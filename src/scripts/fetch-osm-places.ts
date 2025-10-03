import 'dotenv/config'
import { departments, getDepartmentByCode } from '../data/department.data'
import { overpassService } from '../services/overpass.service'
import {
  batchUpsert,
  createProcessStats,
  formatDuration,
  formatPlaceObject,
  printProgress,
  type ProcessStats,
  validatePlace,
} from '../utils/common'
import { createPointWKT } from '../utils/geometry'

class NaturePlacesFetcher {
  public readonly stats: ProcessStats

  constructor() {
    this.stats = createProcessStats()
  }

  private preparePlace(place: any, department: string, isNaturalRegionalPark = false): any {
    const source_score = isNaturalRegionalPark ? 8 : 1
    const location = place.latitude && place.longitude ? createPointWKT(place.longitude, place.latitude) : null

    return formatPlaceObject({
      source: 'OSM',
      sourceId: `osm:${place.osm_id}`,
      osm_id: place.osm_id,
      name: place.name,
      type: place.type,
      location,
      geometry: place.geometry,
      region: department,
      country: 'France',
      description: place.tags?.description || null,
      source_score,
      metadata: place,
    })
  }

  private printProgress(department: string): void {
    printProgress(this.stats, `${department} | API Requests: ${overpassService.getRequestCount()}`)
  }

  public async fetchDepartment(departmentCode: string, naturalRegionalParksOnly = false): Promise<void> {
    const department = getDepartmentByCode(departmentCode)
    if (!department) {
      throw new Error(`Department ${departmentCode} not found`)
    }

    const modeText = naturalRegionalParksOnly ? 'Natural Regional Parks' : 'Nature Places'
    console.log(`\n🌿 Starting fetch for ${modeText} in ${department.name} (${departmentCode})`)
    console.log(
      `📍 Bounding box: South=${department.bbox.south}, West=${department.bbox.west}, North=${department.bbox.north}, East=${department.bbox.east}`,
    )

    try {
      // Query Overpass API
      console.log('🌐 Querying Overpass API...')
      const elements = naturalRegionalParksOnly
        ? await overpassService.queryRegionalParks(department.bbox, departmentCode)
        : await overpassService.queryNaturePlaces(department.bbox, departmentCode)

      if (elements.length === 0) {
        console.log('❓ No elements found in this department')
        return
      }

      console.log(`📋 Processing ${elements.length} elements from Overpass API...`)
      const places = overpassService.processElements(elements)

      // Prepare all places for batch upsert
      const preparedPlaces = places
        .map((place) => {
          this.stats.processedCount++
          const prepared = this.preparePlace(place, departmentCode, naturalRegionalParksOnly)
          return validatePlace(prepared) ? prepared : null
        })
        .filter((place): place is NonNullable<typeof place> => place !== null)

      if (preparedPlaces.length === 0) {
        console.log('❓ No places to insert after processing')
        return
      }

      console.log(`🌿 Upserting ${preparedPlaces.length} OSM ${modeText.toLowerCase()}...`)

      // Batch upsert in chunks of 10 to prevent timeout with large geometry data
      await batchUpsert(
        preparedPlaces,
        {
          tableName: 'places',
          conflictColumn: 'source_id',
          batchSize: 10,
        },
        this.stats,
      )

      // Final report
      this.printProgress(`${department.name} (${departmentCode})`)
      console.log(`🎉 Completed ${modeText} in ${department.name} (${departmentCode}) successfully!`)
    } catch (error) {
      console.error(`💥 Error processing ${department.name}:`, error)
      throw error
    }
  }

  public async fetchAllFrenchNaturalRegionalParks(): Promise<void> {
    console.log(`\n🏞️ Starting fetch for ALL French Natural Regional Parks`)

    try {
      // Query Overpass API for all France
      console.log('🌐 Querying Overpass API for all France...')
      const franceBbox = {
        south: 41.0,
        west: -5.0,
        north: 51.0,
        east: 10.0,
      }

      const elements = await overpassService.queryRegionalParks(franceBbox)

      if (elements.length === 0) {
        console.log('❓ No natural regional parks found in France')
        return
      }

      console.log(`📋 Processing ${elements.length} French natural regional parks...`)
      const places = overpassService.processElements(elements)

      // Prepare all places for batch upsert
      const preparedPlaces = places
        .map((place) => {
          this.stats.processedCount++
          const prepared = this.preparePlace(place, 'France', true)
          return validatePlace(prepared) ? prepared : null
        })
        .filter((place): place is NonNullable<typeof place> => place !== null)

      if (preparedPlaces.length === 0) {
        console.log('❓ No places to insert after processing')
        return
      }

      console.log(`🏞️ Upserting ${preparedPlaces.length} French natural regional parks...`)

      // Batch upsert in chunks of 10 to prevent timeout with large geometry data
      await batchUpsert(
        preparedPlaces,
        {
          tableName: 'places',
          conflictColumn: 'source_id',
          batchSize: 10,
        },
        this.stats,
      )

      // Final report
      this.printProgress('All French Natural Regional Parks')
      console.log(`🎉 Completed French Natural Regional Parks import successfully!`)
    } catch (error) {
      console.error(`💥 Error processing French Natural Regional Parks:`, error)
      throw error
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2)
  const firstArg = args[0]

  console.log(`🚀 Starting OSM Nature Places Fetcher`)
  console.log(`📅 Started at: ${new Date().toISOString()}`)

  const fetcher = new NaturePlacesFetcher()

  try {
    if (firstArg === 'all-parks') {
      await fetcher.fetchAllFrenchNaturalRegionalParks()
    } else if (firstArg) {
      const departmentCode = firstArg
      const mode = args[1] || 'places' // 'places' or 'parks'
      const naturalRegionalParksOnly = mode === 'parks'
      await fetcher.fetchDepartment(departmentCode, naturalRegionalParksOnly)
    } else {
      console.error('❌ Usage:')
      console.log('  pnpm run fetch-osm-places <department-code> [places|parks]')
      console.log('  pnpm run fetch-osm-places all-parks')
      console.log(
        '🏞️  Available departments:',
        departments
          .slice(0, 5)
          .map((d) => `${d.code} (${d.name})`)
          .join(', '),
        '...',
      )
      process.exit(1)
    }

    console.log('\n🏁 OSM fetch completed successfully!')
    console.log(`📅 Finished at: ${new Date().toISOString()}`)
    console.log(`⏱️ Total runtime: ${formatDuration(fetcher.stats.startTime)}`)
  } catch (error) {
    console.error('\n💥 OSM fetch failed:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch(console.error)
}

export { NaturePlacesFetcher }
