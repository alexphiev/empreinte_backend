import 'dotenv/config'
import { supabase } from '../services/supabase'
import { overpassService } from '../services/overpass'
import { departments, getDepartmentByCode } from '../data/departments'

interface ProcessStats {
  processedCount: number
  insertedCount: number
  duplicateCount: number
  errorCount: number
  startTime: Date
}

class NaturePlacesFetcher {
  private stats: ProcessStats

  constructor() {
    this.stats = {
      processedCount: 0,
      insertedCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      startTime: new Date()
    }
  }



  private preparePlace(place: any, department: string): any {

    return {
      source: 'OSM',
      source_id: `osm:${place.osm_id}`,
      name: place.name,
      type: place.type,
      location: `POINT(${place.longitude} ${place.latitude})`,
      geometry: place.geometry,
      region: department,
      country: 'France',
      description: place.tags?.description || null,
      metadata: place
    }
  }

  private async upsertPlacesBatch(places: any[]): Promise<void> {
    if (places.length === 0) return

    try {
      const { error } = await supabase
        .from('places')
        .upsert(places, {
          onConflict: 'source_id'
        })
      
      if (error) {
        console.error('❌ Error upserting batch:', error.message)
        this.stats.errorCount += places.length
        throw error
      }
      
      console.log(`✅ Upserted batch of ${places.length} places`)
      this.stats.insertedCount += places.length
    } catch (error) {
      console.error('❌ Error upserting batch:', error)
      this.stats.errorCount += places.length
      throw error
    }
  }

  private printProgress(department: string): void {
    const runtime = Math.floor((Date.now() - this.stats.startTime.getTime()) / 1000)
    console.log('\n📊 --- Progress Report ---')
    console.log(`🏞️  Department: ${department}`)
    console.log(`⏱️  Runtime: ${runtime}s`)
    console.log(`📝 Processed: ${this.stats.processedCount}`)
    console.log(`✅ Inserted: ${this.stats.insertedCount}`)
    console.log(`⚠️  Duplicates: ${this.stats.duplicateCount}`)
    console.log(`❌ Errors: ${this.stats.errorCount}`)
    console.log(`🌐 API Requests: ${overpassService.getRequestCount()}`)
    console.log('-------------------------\n')
  }

  public async fetchDepartment(departmentCode: string): Promise<void> {
    const department = getDepartmentByCode(departmentCode)
    if (!department) {
      throw new Error(`Department ${departmentCode} not found`)
    }

    console.log(`\n🌿 Starting fetch for ${department.name} (${departmentCode})`)
    console.log(`📍 Bounding box: South=${department.bbox.south}, West=${department.bbox.west}, North=${department.bbox.north}, East=${department.bbox.east}`)

    try {
      // Query Overpass API
      console.log('🌐 Querying Overpass API...')
      const elements = await overpassService.queryNaturePlaces(department.bbox, departmentCode)
      
      if (elements.length === 0) {
        console.log('❓ No elements found in this department')
        return
      }

      console.log(`📋 Processing ${elements.length} elements from Overpass API...`)
      const places = overpassService.processElements(elements)

      // Prepare all places for batch upsert
      const preparedPlaces = places.map(place => {
        this.stats.processedCount++
        return this.preparePlace(place, departmentCode)
      })

      if (preparedPlaces.length === 0) {
        console.log('❓ No places to insert after processing')
        return
      }

      console.log(`🌿 Upserting ${preparedPlaces.length} OSM places...`)

      // Batch upsert in chunks of 100
      const batchSize = 100
      for (let i = 0; i < preparedPlaces.length; i += batchSize) {
        const batch = preparedPlaces.slice(i, i + batchSize)
        await this.upsertPlacesBatch(batch)
        
        // Progress reporting
        console.log(`📊 Progress: ${Math.min(i + batchSize, preparedPlaces.length)}/${preparedPlaces.length} places processed`)
      }

      // Final report
      this.printProgress(`${department.name} (${departmentCode})`)
      console.log(`🎉 Completed ${department.name} (${departmentCode}) successfully!`)
      
    } catch (error) {
      console.error(`💥 Error processing ${department.name}:`, error)
      throw error
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2)
  const departmentCode = args[0] || '30' // Default to Gard

  console.log(`🚀 Starting OSM Nature Places Fetcher`)
  console.log(`📅 Started at: ${new Date().toISOString()}`)
  
  const fetcher = new NaturePlacesFetcher()
  
  try {
    if (departmentCode) {
      await fetcher.fetchDepartment(departmentCode)
    } else {
      console.error('❌ Usage: pnpm run fetch-osm-places <department-code>')
      console.log('🏞️  Available departments:', departments.slice(0, 5).map(d => `${d.code} (${d.name})`).join(', '), '...')
      process.exit(1)
    }
    
    console.log('\n🏁 OSM fetch completed successfully!')
    console.log(`📅 Finished at: ${new Date().toISOString()}`)
  } catch (error) {
    console.error('\n💥 OSM fetch failed:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch(console.error)
}

export { NaturePlacesFetcher }