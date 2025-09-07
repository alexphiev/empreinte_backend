import 'dotenv/config'
import { supabase } from '../services/supabase'
import { getDepartmentByCode } from '../data/departments'

interface RemovalStats {
  removedCount: number
  errorCount: number
  startTime: Date
}

class OSMRemover {
  private stats: RemovalStats

  constructor() {
    this.stats = {
      removedCount: 0,
      errorCount: 0,
      startTime: new Date()
    }
  }

  private printStats(region: string): void {
    const runtime = Math.floor((Date.now() - this.stats.startTime.getTime()) / 1000)
    console.log('\n📊 --- Removal Report ---')
    console.log(`🌍 Region: ${region}`)
    console.log(`⏱️ Runtime: ${runtime}s`)
    console.log(`🗑️ Removed: ${this.stats.removedCount}`)
    console.log(`❌ Errors: ${this.stats.errorCount}`)
    console.log('------------------------\n')
  }

  public async removeDepartment(departmentCode: string): Promise<void> {
    const department = getDepartmentByCode(departmentCode)
    if (!department) {
      throw new Error(`Department ${departmentCode} not found`)
    }

    console.log(`\n🗑️ Removing OSM places for ${department.name} (${departmentCode})`)
    
    try {
      const { data: places, error: fetchError } = await supabase
        .from('places')
        .select('id, source_id, name')
        .eq('source', 'OSM')
        .eq('region', departmentCode)

      if (fetchError) {
        throw fetchError
      }

      if (!places || places.length === 0) {
        console.log(`❓ No OSM places found for department ${departmentCode}`)
        return
      }

      console.log(`🔍 Found ${places.length} OSM places to remove`)

      const { error: deleteError } = await supabase
        .from('places')
        .delete()
        .eq('source', 'OSM')
        .eq('region', departmentCode)

      if (deleteError) {
        console.error('❌ Error removing places:', deleteError.message)
        this.stats.errorCount++
        throw deleteError
      }

      this.stats.removedCount = places.length
      this.printStats(`${department.name} (${departmentCode})`)
      console.log(`✅ Successfully removed ${places.length} OSM places from ${department.name}`)

    } catch (error) {
      console.error(`💥 Error removing OSM places for ${department.name}:`, error)
      throw error
    }
  }

  public async removeAllOSM(): Promise<void> {
    console.log(`\n🗑️ Removing ALL OSM places from database`)
    console.log('⚠️ WARNING: This will remove ALL OSM places from the database!')
    
    try {
      const { count } = await supabase
        .from('places')
        .select('*', { count: 'exact', head: true })
        .eq('source', 'OSM')

      if (!count || count === 0) {
        console.log('❓ No OSM places found in database')
        return
      }

      console.log(`🔍 Found ${count} OSM places to remove`)

      const { error } = await supabase
        .from('places')
        .delete()
        .eq('source', 'OSM')

      if (error) {
        console.error('❌ Error removing places:', error.message)
        this.stats.errorCount++
        throw error
      }

      this.stats.removedCount = count
      this.printStats('All France')
      console.log(`✅ Successfully removed ${count} OSM places from database`)

    } catch (error) {
      console.error('💥 Error removing all OSM places:', error)
      throw error
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  console.log(`🚀 Starting OSM Places Remover`)
  console.log(`📅 Started at: ${new Date().toISOString()}`)
  
  const remover = new OSMRemover()
  
  try {
    if (command === 'all') {
      await remover.removeAllOSM()
    } else if (command) {
      await remover.removeDepartment(command)
    } else {
      console.log('❓ Usage:')
      console.log('  Remove specific department: pnpm run remove-osm-places <department_code>')
      console.log('  Remove all OSM places: pnpm run remove-osm-places all')
      console.log('')
      console.log('Examples:')
      console.log('  pnpm run remove-osm-places 30  # Remove Gard department')
      console.log('  pnpm run remove-osm-places all # Remove all OSM places')
      process.exit(1)
    }
    
    console.log('\n🎉 OSM removal completed successfully!')
    console.log(`📅 Finished at: ${new Date().toISOString()}`)
  } catch (error) {
    console.error('\n💥 OSM removal failed:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch(console.error)
}

export { OSMRemover }