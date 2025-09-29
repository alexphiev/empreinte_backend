import 'dotenv/config'
import { supabase } from '../services/supabase.service'

interface RemovalStats {
  removedCount: number
  errorCount: number
  startTime: Date
}

class PlacesRemover {
  private stats: RemovalStats

  constructor() {
    this.stats = {
      removedCount: 0,
      errorCount: 0,
      startTime: new Date(),
    }
  }

  private printStats(source: string): void {
    const runtime = Math.floor((Date.now() - this.stats.startTime.getTime()) / 1000)
    console.log('\n📊 --- Removal Report ---')
    console.log(`🎯 Source: ${source}`)
    console.log(`⏱️ Runtime: ${runtime}s`)
    console.log(`🗑️ Removed: ${this.stats.removedCount}`)
    console.log(`❌ Errors: ${this.stats.errorCount}`)
    console.log('------------------------\n')
  }

  public async removeBySource(source: string): Promise<void> {
    console.log(`\n🗑️ Removing ALL ${source} places from database`)
    console.log(`⚠️ WARNING: This will remove ALL ${source} places from the database!`)

    try {
      const { count } = await supabase
        .from('places')
        .select('*', { count: 'exact', head: true })
        .eq('source', source)

      if (!count || count === 0) {
        console.log(`❓ No ${source} places found in database`)
        return
      }

      console.log(`🔍 Found ${count} ${source} places to remove`)

      const { error } = await supabase.from('places').delete().eq('source', source)

      if (error) {
        console.error('❌ Error removing places:', error.message)
        this.stats.errorCount++
        throw error
      }

      this.stats.removedCount = count
      this.printStats(source)
      console.log(`✅ Successfully removed ${count} ${source} places from database`)
    } catch (error) {
      console.error(`💥 Error removing ${source} places:`, error)
      throw error
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const source = args[0]

  if (!source) {
    console.log('❓ Usage: pnpm remove-places <source>')
    console.log('')
    console.log('Examples:')
    console.log('  pnpm remove-places OSM')
    console.log('  pnpm remove-places OVERTURE')
    console.log('  pnpm remove-places DATA.GOUV')
    process.exit(1)
  }

  console.log(`🚀 Starting ${source} Places Remover`)
  console.log(`📅 Started at: ${new Date().toISOString()}`)

  const remover = new PlacesRemover()

  try {
    await remover.removeBySource(source)

    console.log(`\n🎉 ${source} removal completed successfully!`)
    console.log(`📅 Finished at: ${new Date().toISOString()}`)
  } catch (error) {
    console.error(`\n💥 ${source} removal failed:`, error)
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch(console.error)
}

export { PlacesRemover }