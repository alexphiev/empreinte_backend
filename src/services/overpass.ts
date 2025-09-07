import fs from 'fs/promises'
import path from 'path'

interface OverpassElement {
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
  private readonly cacheDir = path.join(process.cwd(), 'temp', 'overpass')

  constructor() {
    // Ensure cache directory exists
    this.ensureCacheDir()
  }

  private async ensureCacheDir(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true })
    } catch (error) {
      console.warn('⚠️ Could not create cache directory:', error)
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime
    if (timeSinceLastRequest < this.minDelayMs) {
      await this.delay(this.minDelayMs - timeSinceLastRequest)
    }
    this.lastRequestTime = Date.now()
  }

  private normalizeFeatureType(tags: Record<string, string>): string {
    // National parks and protected areas
    if (tags.boundary === 'national_park') return 'national_park'
    if (tags.boundary === 'protected_area') return 'protected_area'

    // Leisure areas
    if (tags.leisure === 'park') return 'park'
    if (tags.leisure === 'nature_reserve') return 'nature_reserve'

    // Natural features
    if (tags.natural === 'forest') return 'forest'
    if (tags.natural === 'wood') return 'forest'
    if (tags.natural === 'beach') return 'beach'
    if (tags.natural === 'water') return 'water'
    if (tags.natural === 'peak') return 'mountain'
    if (tags.natural === 'cave_entrance') return 'cave'
    if (tags.natural === 'glacier') return 'glacier'
    if (tags.natural === 'wetland') return 'wetland'

    // Waterways
    if (tags.waterway === 'river') return 'river'
    if (tags.waterway === 'stream') return 'stream'

    // Fallback
    return tags.natural || tags.leisure || tags.boundary || 'unknown'
  }

  private getCenterPoint(element: OverpassElement): { lat: number; lon: number } | null {
    // Direct coordinates
    if (element.lat && element.lon) {
      return { lat: element.lat, lon: element.lon }
    }

    // Center point from Overpass
    if (element.center) {
      return element.center
    }

    // Calculate from geometry
    if (element.geometry && element.geometry.length > 0) {
      try {
        const lats = element.geometry.map((p) => p.lat).filter(lat => typeof lat === 'number' && !isNaN(lat))
        const lons = element.geometry.map((p) => p.lon).filter(lon => typeof lon === 'number' && !isNaN(lon))
        
        if (lats.length > 0 && lons.length > 0) {
          return {
            lat: (Math.min(...lats) + Math.max(...lats)) / 2,
            lon: (Math.min(...lons) + Math.max(...lons)) / 2,
          }
        }
      } catch (error) {
        console.warn(`⚠️ Failed to calculate center for element ${element.id}:`, error)
      }
    }

    console.warn(`⚠️ Cannot determine center point for element ${element.id}, skipping`)
    return null
  }

  private buildQuery(bbox: BoundingBox): string {
    const query = `[out:json][timeout:180][bbox:${bbox.south},${bbox.west},${bbox.north},${bbox.east}];
(
  way[natural~"^(forest|wood|beach|wetland|peak|cave_entrance|glacier)$"];
  relation[natural~"^(forest|wood|beach|wetland|peak|cave_entrance|glacier)$"];
  node[natural~"^(peak|cave_entrance|glacier)$"];
  way[leisure~"^(park|nature_reserve)$"];
  relation[leisure~"^(park|nature_reserve)$"];
  way[boundary~"^(national_park|protected_area)$"];
  relation[boundary~"^(national_park|protected_area)$"];
  way[waterway~"^(river|stream)$"];
  relation[waterway~"^(river|stream)$"];
);
out center geom;`
    return query
  }

  private switchToNextUrl(): void {
    this.currentUrlIndex = (this.currentUrlIndex + 1) % this.baseUrls.length
    console.log(`Switching to Overpass server: ${this.baseUrls[this.currentUrlIndex]}`)
  }

  private getCacheKey(bbox: BoundingBox): string {
    // Create a cache key based on bounding box
    return `overpass_${bbox.south}_${bbox.west}_${bbox.north}_${bbox.east}`.replace(/\./g, '_')
  }

  private async loadFromCache(departmentCode?: string): Promise<OverpassElement[] | null> {
    if (!departmentCode) return null
    
    const fileName = `overpass_dept_${departmentCode}.json`
    const filePath = path.join(this.cacheDir, fileName)
    
    try {
      await fs.access(filePath)
      console.log(`♻️  Found cached Overpass data for department ${departmentCode}: ${fileName}`)
      console.log(`📁 Reusing existing data to save API calls`)
      
      const data = await fs.readFile(filePath, 'utf-8')
      const elements = JSON.parse(data)
      return elements
    } catch {
      // File doesn't exist or can't be read
      return null
    }
  }

  private async saveToCache(elements: OverpassElement[], departmentCode?: string): Promise<void> {
    if (!departmentCode) return
    
    const fileName = `overpass_dept_${departmentCode}.json`
    const filePath = path.join(this.cacheDir, fileName)
    
    try {
      await fs.writeFile(filePath, JSON.stringify(elements, null, 2))
      console.log(`💾 Cached Overpass data: ${fileName}`)
    } catch (error) {
      console.warn(`⚠️ Could not save cache file: ${error}`)
    }
  }

  public async queryNaturePlaces(bbox: BoundingBox, departmentCode?: string, retries = 3): Promise<OverpassElement[]> {
    // Check cache first
    const cachedData = await this.loadFromCache(departmentCode)
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
          await this.delay(delayMs)
          continue
        }

        if (response.status === 504 || response.status === 502) {
          console.warn(`Gateway timeout/error (${response.status}). Switching server...`)
          this.switchToNextUrl()
          const delayMs = 5000 * attempt
          await this.delay(delayMs)
          continue
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json() as OverpassResponse
        console.log(`🌍 Successfully fetched ${data.elements.length} elements`)

        // Save to cache for future use
        await this.saveToCache(data.elements, departmentCode)

        return data.elements
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error)

        if (attempt === retries) {
          throw new Error(`All ${retries} attempts failed. Last error: ${error}`)
        }

        const delayMs = 5000 * attempt
        console.log(`Waiting ${delayMs}ms before next attempt...`)
        await this.delay(delayMs)
      }
    }

    return []
  }

  private convertToGeoJSON(element: OverpassElement): any {
    if (!element.geometry || element.geometry.length === 0) {
      return null
    }

    try {
      // Convert Overpass geometry to GeoJSON format
      if (element.type === 'node') {
        return {
          type: 'Point',
          coordinates: [element.lon, element.lat]
        }
      } else if (element.type === 'way') {
        const coordinates = element.geometry.map(point => [point.lon, point.lat])
        
        // Check if it's a closed polygon (first and last points are the same)
        const isClosedPolygon = coordinates.length > 3 && 
          coordinates[0][0] === coordinates[coordinates.length - 1][0] &&
          coordinates[0][1] === coordinates[coordinates.length - 1][1]
        
        if (isClosedPolygon) {
          return {
            type: 'Polygon',
            coordinates: [coordinates]
          }
        } else {
          return {
            type: 'LineString',
            coordinates: coordinates
          }
        }
      } else if (element.type === 'relation') {
        // For relations, use a simple point at the center
        const center = this.getCenterPoint(element)
        if (center) {
          return {
            type: 'Point',
            coordinates: [center.lon, center.lat]
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
    latitude: number
    longitude: number
    geometry: any
    tags: Record<string, string>
  }> {
    return elements
      .map((element) => {
        const tags = element.tags || {}
        const center = this.getCenterPoint(element)

        // Skip elements without valid coordinates
        if (!center) {
          return null
        }

        // Skip elements without names
        if (!tags.name || tags.name.trim() === '') {
          return null
        }

        const geoJsonGeometry = this.convertToGeoJSON(element)

        return {
          osm_id: element.id,
          name: tags.name,
          type: this.normalizeFeatureType(tags),
          latitude: center.lat,
          longitude: center.lon,
          geometry: geoJsonGeometry,
          tags,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
  }

  public getRequestCount(): number {
    return this.requestCount
  }
}

export const overpassService = new OverpassService()
