import 'dotenv/config'
import { getDepartmentByCode } from '../data/department.data'
import { supabase } from '../services/supabase.service'

interface RemovalStats {
  removedCount: number
  errorCount: number
  startTime: Date
}

class OvertureRemover {
  private stats: RemovalStats

  constructor() {
    this.stats = {
      removedCount: 0,
      errorCount: 0,
      startTime: new Date(),
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

    console.log(`\n🗑️ Removing Overture places for ${department.name} (${departmentCode})`)

    try {
      const { data: places, error: fetchError } = await supabase
        .from('places')
        .select('id, source_id, name')
        .eq('source', 'OVERTURE')
        .eq('region', departmentCode)

      if (fetchError) {
        throw fetchError
      }

      if (!places || places.length === 0) {
        console.log(`❓ No Overture places found for department ${departmentCode}`)
        return
      }

      console.log(`🔍 Found ${places.length} Overture places to remove`)

      const { error: deleteError } = await supabase
        .from('places')
        .delete()
        .eq('source', 'OVERTURE')
        .eq('region', departmentCode)

      if (deleteError) {
        console.error('❌ Error removing places:', deleteError.message)
        this.stats.errorCount++
        throw deleteError
      }

      this.stats.removedCount = places.length
      this.printStats(`${department.name} (${departmentCode})`)
      console.log(`✅ Successfully removed ${places.length} Overture places from ${department.name}`)
    } catch (error) {
      console.error(`💥 Error removing Overture places for ${department.name}:`, error)
      throw error
    }
  }

  public async removeAllOverture(): Promise<void> {
    console.log(`\n🗑️ Removing ALL Overture places from database`)
    console.log('⚠️ WARNING: This will remove ALL Overture places from the database!')

    try {
      const { count } = await supabase
        .from('places')
        .select('*', { count: 'exact', head: true })
        .eq('source', 'OVERTURE')

      if (!count || count === 0) {
        console.log('❓ No Overture places found in database')
        return
      }

      console.log(`🔍 Found ${count} Overture places to remove`)

      const { error } = await supabase.from('places').delete().eq('source', 'OVERTURE')

      if (error) {
        console.error('❌ Error removing places:', error.message)
        this.stats.errorCount++
        throw error
      }

      this.stats.removedCount = count
      this.printStats('All France')
      console.log(`✅ Successfully removed ${count} Overture places from database`)
    } catch (error) {
      console.error('💥 Error removing all Overture places:', error)
      throw error
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  console.log(`🚀 Starting Overture Places Remover`)
  console.log(`📅 Started at: ${new Date().toISOString()}`)

  const remover = new OvertureRemover()

  try {
    if (command === 'all') {
      await remover.removeAllOverture()
    } else if (command) {
      await remover.removeDepartment(command)
    } else {
      console.log('❓ Usage:')
      console.log('  Remove specific department: pnpm run remove-overture-places <department_code>')
      console.log('  Remove all Overture places: pnpm run remove-overture-places all')
      console.log('')
      console.log('Examples:')
      console.log('  pnpm run remove-overture-places 30  # Remove Gard department')
      console.log('  pnpm run remove-overture-places all # Remove all Overture places')
      process.exit(1)
    }

    console.log('\n🎉 Overture removal completed successfully!')
    console.log(`📅 Finished at: ${new Date().toISOString()}`)
  } catch (error) {
    console.error('\n💥 Overture removal failed:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch(console.error)
}

export { OvertureRemover }
