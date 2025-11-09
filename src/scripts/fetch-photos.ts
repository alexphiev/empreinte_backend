import 'dotenv/config'
import { supabase } from '../services/supabase.service'
import { photoFetcherService } from '../services/photo-fetcher.service'
import { Place } from '../db/places'

interface ProcessStats {
  processedCount: number
  successCount: number
  errorCount: number
  photosFound: number
}

class PhotoFetcher {
  public readonly stats: ProcessStats

  constructor() {
    this.stats = {
      processedCount: 0,
      successCount: 0,
      errorCount: 0,
      photosFound: 0,
    }
  }

  private printProgress(): void {
    console.log(`\n📊 Progress:`)
    console.log(`   Processed: ${this.stats.processedCount}`)
    console.log(`   Success: ${this.stats.successCount}`)
    console.log(`   Errors: ${this.stats.errorCount}`)
    console.log(`   Photos found: ${this.stats.photosFound}`)
  }

  public async fetchPhotosForPlaces(minScore?: number, limit?: number): Promise<void> {
    console.log(`\n📸 Starting photo fetch process`)
    if (minScore !== undefined) {
      console.log(`📊 Minimum score filter: ${minScore}`)
    }
    if (limit !== undefined) {
      console.log(`🔢 Limit: ${limit} places`)
    }

    // Get places without photos
    let query = supabase
      .from('places')
      .select('*')
      .is('photos_fetched_at', null) // Places that haven't had photos fetched yet

    if (minScore !== undefined) {
      query = query.gte('score', minScore)
    }

    // Order by score descending to prioritize higher-scored places
    query = query.order('score', { ascending: false })

    if (limit !== undefined) {
      query = query.limit(limit)
    }

    const { data: placesToProcess, error: queryError } = await query

    if (queryError) {
      console.error('❌ Error fetching places:', queryError)
      throw queryError
    }

    if (!placesToProcess || placesToProcess.length === 0) {
      console.log('✅ No places to process!')
      return
    }

    console.log(`📋 Found ${placesToProcess.length} places to process`)

    // Process places one by one with delay
    for (let i = 0; i < placesToProcess.length; i++) {
      const place = placesToProcess[i] as Place
      console.log(`\n📍 Processing place ${i + 1}/${placesToProcess.length}: ${place.name}`)

      try {
        const result = await photoFetcherService.fetchPhotosForPlace(place)
        this.stats.processedCount++

        if (result.success) {
          this.stats.successCount++
          this.stats.photosFound += result.photosFound
        } else {
          this.stats.errorCount++
        }

        // Print progress every 10 places
        if ((i + 1) % 10 === 0) {
          this.printProgress()
        }

        // Add delay between requests (except for the last one)
        if (i < placesToProcess.length - 1) {
          await photoFetcherService.delay()
        }
      } catch (error) {
        this.stats.processedCount++
        this.stats.errorCount++
        console.error(`❌ Error processing place ${place.name}:`, error)
      }
    }

    // Final summary
    console.log(`\n✅ Photo fetch complete!`)
    this.printProgress()
  }
}

async function main() {
  const args = process.argv.slice(2)
  let minScore: number | undefined
  let limit: number | undefined

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--minScore' && i + 1 < args.length) {
      minScore = Number(args[i + 1])
      if (isNaN(minScore) || minScore < 0) {
        console.error('❌ minScore must be a non-negative number')
        process.exit(1)
      }
      i++
    } else if (args[i] === '--limit' && i + 1 < args.length) {
      limit = Number(args[i + 1])
      if (isNaN(limit) || limit < 1) {
        console.error('❌ limit must be a positive number')
        process.exit(1)
      }
      i++
    }
  }

  const fetcher = new PhotoFetcher()

  try {
    await fetcher.fetchPhotosForPlaces(minScore, limit)
  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

