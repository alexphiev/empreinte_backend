#!/usr/bin/env ts-node

/**
 * Batch script to analyze multiple places' Wikipedia pages and extract information using AI
 *
 * Usage:
 *   pnpm run batch-analyze-place-wikipedias [--limit=<number>] [--bypass]
 *   ts-node src/scripts/batch-analyze-place-wikipedias.ts [--limit=<number>] [--bypass]
 *
 * Examples:
 *   pnpm run batch-analyze-place-wikipedias
 *   pnpm run batch-analyze-place-wikipedias --limit=10
 *   pnpm run batch-analyze-place-wikipedias --limit=10 --bypass
 */

import 'dotenv/config'
import { Place, getPlacesForWikipediaAnalysis } from '../db/places'
import { analyzePlaceWikipediaCore } from '../services/wikipedia-analysis.service'
import { retryAsync } from '../utils/retry'

interface ProcessStats {
  processedCount: number
  successCount: number
  errorCount: number
}

class BatchWikipediaAnalyzer {
  public readonly stats: ProcessStats
  private readonly bypassCache: boolean

  constructor(bypassCache: boolean = false) {
    this.stats = {
      processedCount: 0,
      successCount: 0,
      errorCount: 0,
    }
    this.bypassCache = bypassCache
  }

  private printProgress(): void {
    console.log(`\n📊 Progress:`)
    console.log(`   Processed: ${this.stats.processedCount}`)
    console.log(`   Success: ${this.stats.successCount}`)
    console.log(`   Errors: ${this.stats.errorCount}`)
  }

  public async analyzeWikipedias(limit?: number): Promise<void> {
    console.log(`\n🔍 Starting batch Wikipedia analysis`)
    if (limit !== undefined) {
      console.log(`🔢 Limit: ${limit} places`)
    }
    if (this.bypassCache) {
      console.log(`🔄 Bypassing cache - will fetch fresh content`)
    }

    const BATCH_SIZE = 100
    let totalProcessed = 0
    let hasMore = true

    while (hasMore) {
      const batchLimit = limit !== undefined ? Math.min(BATCH_SIZE, limit - totalProcessed) : BATCH_SIZE

      if (batchLimit <= 0) {
        break
      }

      console.log(`\n📦 Fetching batch of ${batchLimit} places...`)

      const { data: placesToProcess, error: queryError } = await retryAsync(
        () => getPlacesForWikipediaAnalysis(this.bypassCache, batchLimit),
        'Fetch places for Wikipedia analysis',
      )

      if (queryError) {
        console.error('❌ Error fetching places:', queryError)
        throw queryError
      }

      if (!placesToProcess || placesToProcess.length === 0) {
        console.log('✅ No more places to process!')
        hasMore = false
        break
      }

      console.log(`📋 Processing ${placesToProcess.length} places in this batch`)

      for (let i = 0; i < placesToProcess.length; i++) {
        const place = placesToProcess[i] as Place
        console.log(`\n📍 Processing place ${totalProcessed + i + 1}: ${place.name}`)

        try {
          const { result, error } = await analyzePlaceWikipediaCore(place.id, { bypassCache: this.bypassCache })
          this.stats.processedCount++

          if (error || !result) {
            this.stats.errorCount++
            console.error(`❌ Error: ${error}`)
          } else {
            this.stats.successCount++
            const descLength = result.description?.length || 0
            const score = result.wikipediaData?.score || 0
            console.log(`✅ Success: ${descLength} chars, score: ${score}`)
          }

          if ((this.stats.processedCount) % 10 === 0) {
            this.printProgress()
          }

          if (i < placesToProcess.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500))
          }
        } catch (error) {
          this.stats.processedCount++
          this.stats.errorCount++
          console.error(`❌ Fatal error processing place ${place.name}:`, error)
        }
      }

      totalProcessed += placesToProcess.length

      if (placesToProcess.length < batchLimit) {
        hasMore = false
      }

      if (limit !== undefined && totalProcessed >= limit) {
        hasMore = false
      }
    }

    console.log(`\n✅ Batch Wikipedia analysis complete!`)
    this.printProgress()
  }
}

async function main() {
  const args = process.argv.slice(2)
  let limit: number | undefined
  let bypass = false

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--limit=')) {
      limit = Number(args[i].split('=')[1])
      if (isNaN(limit) || limit < 1) {
        console.error('❌ limit must be a positive number')
        process.exit(1)
      }
    } else if (args[i] === '--bypass') {
      bypass = true
    }
  }

  const analyzer = new BatchWikipediaAnalyzer(bypass)

  try {
    await analyzer.analyzeWikipedias(limit)
  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  }
}

// Run the script
main()
