import 'dotenv/config'
import { CacheManager, createCacheManager } from '../utils/cache'
import {
  batchUpsert,
  calculateGeometryCenter,
  createPlaceObject,
  createProcessStats,
  formatDuration,
  printProgress,
  type ProcessStats,
  validatePlace,
} from '../utils/common'
import { createPointWKT } from '../utils/geometry'

interface FrenchNaturalPark {
  id?: string | number
  geometry?: any
  properties?: {
    name?: string
    nom?: string
    [key: string]: any
  }
  [key: string]: any
}

class FrenchNaturalParksFetcher {
  public readonly stats: ProcessStats
  private readonly cacheManager: CacheManager
  private readonly cacheKey = 'french_natural_parks'
  private readonly dataUrl = 'https://www.data.gouv.fr/api/1/datasets/r/1c2e318d-eadd-4e3d-8b36-d3cac67cd796'

  constructor() {
    this.stats = createProcessStats()
    this.cacheManager = createCacheManager({ baseDir: 'temp' })
  }

  private async loadFromCache(): Promise<FrenchNaturalPark[] | null> {
    const data = await this.cacheManager.load<any>(this.cacheKey)
    if (!data) return null

    // Handle both GeoJSON and plain JSON formats
    if (data.features && Array.isArray(data.features)) {
      return data.features
    } else if (Array.isArray(data)) {
      return data
    } else {
      console.warn('⚠️ Cached data format not recognized, will re-download')
      return null
    }
  }

  private async saveToCache(data: any): Promise<void> {
    await this.cacheManager.save(this.cacheKey, data)
  }

  private async downloadData(): Promise<FrenchNaturalPark[]> {
    console.log('🌐 Downloading French natural parks data from data.gouv.fr...')

    try {
      const response = await fetch(this.dataUrl, {
        headers: {
          'User-Agent': 'empreinte-backend/1.0.0',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('📥 Successfully downloaded French natural parks data')

      // Save to cache for future use
      await this.saveToCache(data)

      // Handle both GeoJSON and plain JSON formats
      if ((data as any).features && Array.isArray((data as any).features)) {
        return (data as any).features
      } else if (Array.isArray(data)) {
        return data as FrenchNaturalPark[]
      } else {
        throw new Error('Unexpected data format received')
      }
    } catch (error) {
      console.error('❌ Failed to download data:', error)
      throw error
    }
  }

  private preparePlace(park: FrenchNaturalPark): any | null {
    const properties = park.properties || {}
    const name = properties.name || properties.nom || properties.NAME || 'Unknown Park'

    if (!name || name.trim() === '' || name === 'Unknown Park') {
      return null
    }

    const center = calculateGeometryCenter(park.geometry)
    if (!center) {
      console.warn(`⚠️ Cannot determine center point for park: ${name}`)
      return null
    }

    // Use park's ID if available, otherwise generate one
    const sourceId = park.id ? `fnp:${park.id}` : `fnp:${name.toLowerCase().replace(/\s+/g, '-')}`

    return createPlaceObject({
      source: 'DATA.GOUV',
      sourceId,
      name,
      type: 'regional_natural_park',
      location: createPointWKT(center.lon, center.lat),
      geometry: park.geometry,
      region: null,
      country: 'France',
      description: properties.description || null,
      quality: 8,
      metadata: {
        ...properties,
        original_id: park.id,
        source_url: this.dataUrl,
      },
    })
  }

  private printProgress(): void {
    printProgress(this.stats, 'French Natural Regional Parks')
  }

  public async fetchAllParks(): Promise<void> {
    console.log(`\n🏞️  Starting fetch for French Natural Regional Parks`)

    try {
      await this.cacheManager.ensureDir()

      // Try to load from cache first
      let parks = await this.loadFromCache()

      // If not cached, download the data
      if (!parks) {
        parks = await this.downloadData()
      }

      if (!parks || parks.length === 0) {
        console.log('❓ No parks found in the dataset')
        return
      }

      console.log(`📋 Processing ${parks.length} French natural parks...`)

      // Prepare all places for batch upsert
      const preparedPlaces = parks
        .map((park) => {
          this.stats.processedCount++
          const prepared = this.preparePlace(park)
          return prepared && validatePlace(prepared) ? prepared : null
        })
        .filter((place): place is NonNullable<typeof place> => place !== null)

      if (preparedPlaces.length === 0) {
        console.log('❓ No places to insert after processing')
        return
      }

      console.log(`🏞️  Upserting ${preparedPlaces.length} French natural parks...`)

      // Batch upsert in chunks of 100
      await batchUpsert(
        preparedPlaces,
        {
          tableName: 'places',
          conflictColumn: 'source_id',
          batchSize: 100,
        },
        this.stats,
      )

      // Final report
      this.printProgress()
      console.log(`🎉 Completed French Natural Regional Parks import successfully!`)
    } catch (error) {
      console.error(`💥 Error processing French Natural Regional Parks:`, error)
      throw error
    }
  }
}

// Main execution
async function main() {
  console.log(`🚀 Starting French Natural Regional Parks Fetcher`)
  console.log(`📅 Started at: ${new Date().toISOString()}`)

  const fetcher = new FrenchNaturalParksFetcher()

  try {
    await fetcher.fetchAllParks()

    console.log('\n🏁 French natural parks fetch completed successfully!')
    console.log(`📅 Finished at: ${new Date().toISOString()}`)
    console.log(`⏱️ Total runtime: ${formatDuration(fetcher.stats.startTime)}`)
  } catch (error) {
    console.error('\n💥 French natural parks fetch failed:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch(console.error)
}

export { FrenchNaturalParksFetcher }
