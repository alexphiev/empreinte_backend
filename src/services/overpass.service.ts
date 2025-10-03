import { OSM_TAG_TO_TYPE } from '../data/osm.data'
import { CacheManager, createCacheManager } from '../utils/cache'
import { delay } from '../utils/common'
import {
  calculateCenterFromCoordinates,
  closePolygon,
  isClosedPolygon,
  orderWays,
  simplifyCoordinates,
  type Point,
} from '../utils/geometry'

export interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  geometry?: Array<{ lat: number; lon: number }>
  tags?: Record<string, string>
}

interface OverpassResponse {
  version: number
  generator: string
  osm3s: {
    timestamp_osm_base: string
    copyright: string
  }
  elements: OverpassElement[]
}

interface BoundingBox {
  south: number
  west: number
  north: number
  east: number
}

export class OverpassService {
  private readonly baseUrls = [
    'https://overpass-api.de/api/interpreter',
    'https://lambert.openstreetmap.de/api/interpreter',
  ]
  private currentUrlIndex = 0
  private requestCount = 0
  private lastRequestTime = 0
  private readonly minDelayMs = 1500 // 1.5 seconds between requests
  private readonly cacheManager: CacheManager

  constructor() {
    this.cacheManager = createCacheManager({
      baseDir: 'temp',
      subDir: 'overpass',
    })
    // Ensure cache directory exists
    this.cacheManager.ensureDir().catch((error) => {
      console.warn('⚠️ Could not initialize cache manager:', error)
    })
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime
    if (timeSinceLastRequest < this.minDelayMs) {
      await delay(this.minDelayMs - timeSinceLastRequest)
    }
    this.lastRequestTime = Date.now()
  }

  private normalizeFeatureType(tags: Record<string, string>): string {
    // Use the comprehensive mapping function
    const mappedType = this.mapTagsToType(tags)

    if (mappedType !== 'unknown') {
      return mappedType
    }

    // Try fallback tags
    const fallbackType = tags.natural || tags.leisure || tags.boundary
    if (fallbackType && fallbackType.trim() !== '') {
      return fallbackType
    }

    // Log unknown types for analysis
    console.log('🔍 UNKNOWN TYPE - Tags:', JSON.stringify(tags, null, 2))

    return 'unknown'
  }

  private mapTagsToType(tags: Record<string, string>): string {
    // Handle special cases first
    if (tags.landuse === 'protected_area' && tags.boundary_title?.includes('parc naturel régional')) {
      return 'regional_park'
    }

    // Special building cases with name context
    if (tags.building === 'public' && tags.name?.toLowerCase().includes('maison du parc')) {
      return 'park_house'
    }
    if (tags.building === 'public' && tags.name?.toLowerCase().includes('office de tourisme')) {
      return 'tourist_office'
    }

    // Building + amenity combination
    if (tags.building === 'yes' && tags.amenity === 'shelter') {
      return 'shelter'
    }

    // Administrative boundaries (dynamic type)
    if (tags.admin_level && tags.boundary === 'administrative') {
      return `admin_level_${tags.admin_level}`
    }

    // Search through standard mappings
    for (const [key, value] of Object.entries(tags)) {
      const mappingValue = OSM_TAG_TO_TYPE[key]
      if (mappingValue && mappingValue[value]) {
        return mappingValue[value]
      }
    }

    console.log('🔍 UNKNOWN TYPE - Tags:', JSON.stringify(tags, null, 2))
    const combinedTags = Object.entries(tags)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ')
    return combinedTags
  }

  private getCenterPoint(element: OverpassElement): { lat: number; lon: number } | null {
    // Direct coordinates
    if (element.lat && element.lon) {
      return { lat: element.lat, lon: element.lon }
    }

    // Center point from Overpass
    if (element.center && element.center.lat && element.center.lon) {
      return element.center
    }

    // Calculate from bounds (for relations)
    if ((element as any).bounds) {
      const bounds = (element as any).bounds
      if (bounds.minlat && bounds.minlon && bounds.maxlat && bounds.maxlon) {
        return {
          lat: (bounds.minlat + bounds.maxlat) / 2,
          lon: (bounds.minlon + bounds.maxlon) / 2,
        }
      }
    }

    // Calculate from geometry
    if (element.geometry && element.geometry.length > 0) {
      try {
        return calculateCenterFromCoordinates(element.geometry)
      } catch (error) {
        console.warn(`⚠️ Failed to calculate center for element ${element.id}:`, error)
      }
    }

    // Calculate from members geometry (for relations)
    if ((element as any).members && Array.isArray((element as any).members)) {
      try {
        const allCoords: Point[] = []
        for (const member of (element as any).members) {
          if (member.geometry && Array.isArray(member.geometry)) {
            allCoords.push(...member.geometry)
          }
        }

        if (allCoords.length > 0) {
          return calculateCenterFromCoordinates(allCoords)
        }
      } catch (error) {
        console.warn(`⚠️ Failed to calculate center from members for element ${element.id}:`, error)
      }
    }

    return null
  }

  private buildQuery(bbox: BoundingBox): string {
    const query = `[out:json][timeout:180][bbox:${bbox.south},${bbox.west},${bbox.north},${bbox.east}];
(
  way[natural~"^(forest|wood|beach|wetland|glacier|desert|geologic_formation|island|waterfall|mountain)$"];
  relation[natural~"^(forest|wood|beach|wetland|glacier|desert|geologic_formation|island|waterfall|mountain)$"];
  node[natural~"^(peak|cave_entrance|hot_spring)$"];
  way[leisure~"^(park|nature_reserve|botanical_garden)$"];
  relation[leisure~"^(park|nature_reserve|botanical_garden)$"];
  way[boundary~"^(national_park|protected_area)$"];
  relation[boundary~"^(national_park|protected_area)$"];
  way[waterway~"^(river|stream|canal)$"];
  relation[waterway~"^(river|stream|canal)$"];
);
out center geom;`
    return query
  }

  private buildNaturalRegionalParksQuery(bbox: BoundingBox): string {
    const query = `[out:json][timeout:180][bbox:${bbox.south},${bbox.west},${bbox.north},${bbox.east}];
(
  // Original spec
  way[landuse="protected_area"]["boundary_title"="parc naturel régional"];
  relation[landuse="protected_area"]["boundary_title"="parc naturel régional"];
  node[landuse="protected_area"]["boundary_title"="parc naturel régional"];
  
  // Alternative tagging patterns
  way[boundary="protected_area"]["designation"~"parc naturel régional",i];
  relation[boundary="protected_area"]["designation"~"parc naturel régional",i];
  way[leisure="nature_reserve"]["designation"~"parc naturel régional",i];
  relation[leisure="nature_reserve"]["designation"~"parc naturel régional",i];
  way[protect_class="5"]["designation"~"parc naturel régional",i];
  relation[protect_class="5"]["designation"~"parc naturel régional",i];
  
  // Search by name pattern
  way[name~"Parc naturel régional",i];
  relation[name~"Parc naturel régional",i];
);
out center geom;`
    return query
  }

  private switchToNextUrl(): void {
    this.currentUrlIndex = (this.currentUrlIndex + 1) % this.baseUrls.length
    console.log(`Switching to Overpass server: ${this.baseUrls[this.currentUrlIndex]}`)
  }

  private async loadFromCache(cacheKey?: string): Promise<OverpassElement[] | null> {
    if (!cacheKey) return null
    return await this.cacheManager.load<OverpassElement[]>(`overpass_${cacheKey}`)
  }

  private async saveToCache(elements: OverpassElement[], cacheKey?: string): Promise<void> {
    if (!cacheKey) return
    await this.cacheManager.save(`overpass_${cacheKey}`, elements)
  }

  public async queryNaturePlaces(bbox: BoundingBox, departmentCode?: string, retries = 3): Promise<OverpassElement[]> {
    // Check cache first
    const cacheKey = departmentCode ? `dept_${departmentCode}` : 'all'
    const cachedData = await this.loadFromCache(cacheKey)
    if (cachedData) {
      return cachedData
    }

    await this.waitForRateLimit()

    const query = this.buildQuery(bbox)
    const currentUrl = this.baseUrls[this.currentUrlIndex]

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`Querying Overpass API (attempt ${attempt}/${retries})...`)
        console.log(`URL: ${currentUrl}`)
        console.log(`Request count: ${++this.requestCount}`)

        const response = await fetch(currentUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'empreinte-backend/1.0.0',
          },
          body: `data=${encodeURIComponent(query)}`,
        })

        if (response.status === 429) {
          const delayMs = Math.min(5000 * Math.pow(2, attempt - 1), 60000) // Exponential backoff, max 60s
          console.warn(`Rate limited (429). Waiting ${delayMs}ms before retry...`)
          await delay(delayMs)
          continue
        }

        if (response.status === 504 || response.status === 502) {
          console.warn(`Gateway timeout/error (${response.status}). Switching server...`)
          this.switchToNextUrl()
          const delayMs = 5000 * attempt
          await delay(delayMs)
          continue
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = (await response.json()) as OverpassResponse
        console.log(`🌍 Successfully fetched ${data.elements.length} elements`)

        // Save to cache for future use
        await this.saveToCache(data.elements, cacheKey)

        return data.elements
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error)

        if (attempt === retries) {
          throw new Error(`All ${retries} attempts failed. Last error: ${error}`)
        }

        const delayMs = 5000 * attempt
        console.log(`Waiting ${delayMs}ms before next attempt...`)
        await delay(delayMs)
      }
    }

    return []
  }

  public async queryNaturalRegionalParks(
    bbox: BoundingBox,
    departmentCode?: string,
    retries = 3,
  ): Promise<OverpassElement[]> {
    // Check cache first
    const cacheKey = departmentCode
      ? `nrp_dept_${departmentCode}`
      : `nrp_${bbox.south}_${bbox.west}_${bbox.north}_${bbox.east}`.replace(/\./g, '_')
    const cachedData = await this.loadFromCache(cacheKey)
    if (cachedData) {
      return cachedData
    }

    await this.waitForRateLimit()

    const query = this.buildNaturalRegionalParksQuery(bbox)
    const currentUrl = this.baseUrls[this.currentUrlIndex]

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`Querying Overpass API for Natural Regional Parks (attempt ${attempt}/${retries})...`)
        console.log(`URL: ${currentUrl}`)
        console.log(`Request count: ${++this.requestCount}`)
        console.log(`Query: ${query}`)

        const response = await fetch(currentUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'empreinte-backend/1.0.0',
          },
          body: `data=${encodeURIComponent(query)}`,
        })

        if (response.status === 429) {
          const delayMs = Math.min(5000 * Math.pow(2, attempt - 1), 60000) // Exponential backoff, max 60s
          console.warn(`Rate limited (429). Waiting ${delayMs}ms before retry...`)
          await delay(delayMs)
          continue
        }

        if (response.status === 504 || response.status === 502) {
          console.warn(`Gateway timeout/error (${response.status}). Switching server...`)
          this.switchToNextUrl()
          const delayMs = 5000 * attempt
          await delay(delayMs)
          continue
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = (await response.json()) as OverpassResponse
        console.log(`🏞️  Successfully fetched ${data.elements.length} natural regional parks`)

        // Save to cache for future use
        await this.saveToCache(data.elements, cacheKey)

        return data.elements
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error)

        if (attempt === retries) {
          throw new Error(`All ${retries} attempts failed. Last error: ${error}`)
        }

        const delayMs = 5000 * attempt
        console.log(`Waiting ${delayMs}ms before next attempt...`)
        await delay(delayMs)
      }
    }

    return []
  }

  public convertToGeoJSON(element: OverpassElement): any {
    try {
      // Convert Overpass geometry to GeoJSON format
      if (element.type === 'node' && element.lon && element.lat) {
        return {
          type: 'Point',
          coordinates: [element.lon, element.lat],
        }
      } else if (element.type === 'way' && element.geometry && element.geometry.length > 0) {
        const coordinates: Array<[number, number]> = element.geometry.map(
          (point) => [point.lon, point.lat] as [number, number],
        )

        // Simplify the coordinates to reduce size
        const simplified = simplifyCoordinates(coordinates, 0.0002) // ~20m tolerance

        // Check if it's a closed polygon (first and last points are the same)
        if (isClosedPolygon(simplified)) {
          return {
            type: 'Polygon',
            coordinates: [simplified],
          }
        } else {
          return {
            type: 'LineString',
            coordinates: simplified,
          }
        }
      } else if (element.type === 'relation') {
        // For relations, try to use geometry first, then members geometry, then fallback to center
        if (element.geometry && element.geometry.length > 0) {
          const coordinates = element.geometry.map((point) => [point.lon, point.lat])
          return {
            type: 'LineString',
            coordinates: coordinates,
          }
        } else if ((element as any).members && Array.isArray((element as any).members)) {
          // Extract and simplify geometry from relation members
          const outerWays: Array<Array<[number, number]>> = []

          const innerWays: Array<Array<[number, number]>> = []

          for (const member of (element as any).members) {
            if (member.geometry && Array.isArray(member.geometry)) {
              const coordinates: Array<[number, number]> = member.geometry
                .filter((point: any) => point.lat && point.lon)
                .map((point: any) => [point.lon, point.lat])

              if (coordinates.length > 0) {
                // Simplify the coordinates to reduce size while preserving shape
                const simplified = simplifyCoordinates(coordinates, 0.0002) // ~20m tolerance

                // Only process members with explicit 'outer' or 'inner' roles
                if (member.role === 'outer') {
                  outerWays.push(simplified)
                } else if (member.role === 'inner') {
                  innerWays.push(simplified)
                }
              }
            }
          }

          if (outerWays.length > 0) {
            // For multiple outer ways, we need to be careful - they might need to be connected
            if (outerWays.length === 1) {
              // Single outer way - create simple polygon with potential holes
              const outerCoords = outerWays[0]
              // Ensure the polygon is closed
              const closedOuterCoords = closePolygon(outerCoords)

              // Add inner ways as holes
              const allRings = [closedOuterCoords]
              for (const innerCoords of innerWays) {
                // Ensure inner rings are closed
                const closedInnerCoords = closePolygon(innerCoords)
                allRings.push(closedInnerCoords)
              }

              return {
                type: 'Polygon',
                coordinates: allRings,
              }
            } else {
              // Prepare ways for ordering
              const waysWithCoords = outerWays.map((coords) => ({ coordinates: coords }))

              // Order the ways so they connect properly
              const orderedWays = orderWays(waysWithCoords)

              // Connect all ordered ways into one continuous boundary
              const allCoordinates: Array<[number, number]> = []
              for (let i = 0; i < orderedWays.length; i++) {
                const wayCoords = orderedWays[i].coordinates
                // Skip the first coordinate of subsequent ways to avoid duplication at connection points
                const coordsToAdd = i === 0 ? wayCoords : wayCoords.slice(1)
                allCoordinates.push(...coordsToAdd)
              }

              // Ensure the polygon is closed (first point = last point)
              const closedCoordinates = closePolygon(allCoordinates)

              return {
                type: 'Polygon',
                coordinates: [closedCoordinates],
              }
            }
          }
        }

        // Fallback to center point for relations without geometry
        const center = this.getCenterPoint(element)
        if (center) {
          return {
            type: 'Point',
            coordinates: [center.lon, center.lat],
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Failed to convert geometry for element ${element.id}:`, error)
    }

    return null
  }

  public processElements(elements: OverpassElement[]): Array<{
    osm_id: number
    name: string
    type: string
    latitude: number | null
    longitude: number | null
    geometry: any
    tags: Record<string, string>
  }> {
    return elements
      .map((element) => {
        const tags = element.tags || {}
        const center = this.getCenterPoint(element)
        const geoJsonGeometry = this.convertToGeoJSON(element)

        // Debug logging for problematic elements
        if (!center && !geoJsonGeometry) {
          console.warn(`⚠️ Element ${element.id} (type: ${element.type}) debug:`)
          console.warn(`  - Has center: ${!!element.center}`)
          console.warn(`  - Has lat/lon: ${!!element.lat}/${!!element.lon}`)
          console.warn(`  - Has geometry: ${!!element.geometry} (length: ${element.geometry?.length || 0})`)
          console.warn(`  - Tags: ${Object.keys(tags).join(', ')}`)
        }

        // Skip elements without both center and geometry
        if (!center && !geoJsonGeometry) {
          console.warn(
            `⚠️ Cannot determine location for element ${element.id} (type: ${element.type}), skipping - no center and no geometry`,
          )
          return null
        }

        // Skip elements without names
        if (!tags.name || tags.name.trim() === '') {
          return null
        }

        // Skip buildings and administrative offices (these are not park boundaries)
        if (tags.building === 'yes' || tags.office === 'government') {
          console.log(`🔧 Skipping building/office: ${tags.name}`)
          return null
        }

        return {
          osm_id: element.id,
          name: tags.name,
          type: this.normalizeFeatureType(tags),
          latitude: center?.lat || null,
          longitude: center?.lon || null,
          geometry: geoJsonGeometry,
          tags,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
  }

  public getRequestCount(): number {
    return this.requestCount
  }

  /**
   * Query Overpass API for specific OSM elements by their IDs
   * Supports batch queries for efficient data retrieval
   */
  public async queryByIds(ids: number[], batchSize = 15): Promise<OverpassElement[]> {
    const results: OverpassElement[] = []

    // Split IDs into batches to avoid query size limits
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize)

      try {
        console.log(
          `🔍 Querying batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(ids.length / batchSize)} with ${batch.length} IDs`,
        )

        const batchResults = await this.queryBatchIds(batch)
        results.push(...batchResults)

        console.log(`✅ Batch completed: found ${batchResults.length}/${batch.length} elements`)
      } catch (error) {
        console.error(`❌ Failed to query batch ${Math.floor(i / batchSize) + 1}:`, error)
        console.log(`📝 Failed IDs: ${batch.join(', ')}`)
      }
    }

    return results
  }

  /**
   * Query a single batch of OSM IDs
   */
  private async queryBatchIds(ids: number[]): Promise<OverpassElement[]> {
    await this.waitForRateLimit()

    // Build query for specific IDs
    const query = this.buildIdQuery(ids)
    const currentUrl = this.baseUrls[this.currentUrlIndex]

    console.log(`🌐 Querying Overpass API...`)
    console.log(`📍 URL: ${currentUrl}`)
    console.log(`🔢 Request count: ${++this.requestCount}`)

    const response = await fetch(currentUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'empreinte-backend/1.0.0',
      },
      body: `data=${encodeURIComponent(query)}`,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = (await response.json()) as OverpassResponse

    if (!data.elements || !Array.isArray(data.elements)) {
      console.warn('⚠️ No elements found in response')
      return []
    }

    return data.elements
  }

  /**
   * Build Overpass query for specific OSM element IDs
   */
  private buildIdQuery(ids: number[]): string {
    // Group IDs by type (we don't know the type, so query all types)
    const idList = ids.join(',')

    return `[out:json][timeout:180];
(
  relation(id:${idList});
  way(id:${idList});
  node(id:${idList});
);
out geom;`
  }
}

export const overpassService = new OverpassService()
