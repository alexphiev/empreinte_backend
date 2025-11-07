#!/usr/bin/env ts-node

/**
 * Script to analyze a place's website by scraping and using AI to extract information
 *
 * Usage:
 *   pnpm run analyze-place-website <place-id>
 *   ts-node src/scripts/analyze-place-website.ts <place-id>
 *
 * Example:
 *   pnpm run analyze-place-website 123e4567-e89b-12d3-a456-426614174000
 */

import 'dotenv/config'
import { getPlaceById, updatePlace } from '../db/places'
import { summarizeScrapedContent, extractMentionedPlaces } from '../services/ai.service'
import { deepWebsiteScraperService } from '../services/deep-website-scraper.service'
import { cleanText } from '../utils/text-cleaner'

async function main() {
  const placeId = process.argv[2]

  if (!placeId) {
    console.error('❌ Error: Place ID is required')
    console.error('\nUsage:')
    console.error('  pnpm run analyze-place-website <place-id>')
    console.error('\nExample:')
    console.error('  pnpm run analyze-place-website 123e4567-e89b-12d3-a456-426614174000')
    process.exit(1)
  }

  console.log('🚀 Starting place website analysis...\n')
  console.log(`Place ID: ${placeId}\n`)

  try {
    // Step 1: Fetch place from database
    console.log('--- Step 1: Fetching Place ---')
    const placeResponse = await getPlaceById(placeId)

    if (placeResponse.error || !placeResponse.data) {
      console.error(`❌ Place not found with ID: ${placeId}`)
      console.error(`Error: ${placeResponse.error?.message}`)
      process.exit(1)
    }

    const place = placeResponse.data
    console.log(`✅ Found place: ${place.name}`)
    console.log(`   Type: ${place.type}`)
    console.log(`   Website: ${place.website || 'N/A'}`)

    if (!place.website) {
      console.error('\n❌ This place has no website to analyze')
      process.exit(1)
    }

    // Step 2: Check cache or scrape website
    console.log('\n--- Step 2: Fetching Website Content ---')
    let scrapedContent: string | null = null
    let pagesCount = 0

    if (place.website_raw && place.website_raw.trim().length > 0) {
      console.log(`✅ Using cached website content (${place.website_raw.length} chars)`)
      scrapedContent = place.website_raw
      pagesCount = (scrapedContent.match(/=== Page \d+:/g) || []).length
    } else {
      console.log(`🔍 No cache found, scraping website...`)
      console.log(`Target: ${place.website}`)

      scrapedContent = await deepWebsiteScraperService.scrapeWebsiteDeep(
        place.website,
        place.name || undefined,
        place.country || undefined,
      )

      if (!scrapedContent) {
        console.error('❌ Failed to scrape website')
        console.error(
          'The website may have protections, be unavailable, or there was a network error.',
        )
        process.exit(1)
      }

      // Clean and store raw content
      const cleanedRawContent = cleanText(scrapedContent)
      pagesCount = (cleanedRawContent.match(/=== Page \d+:/g) || []).length

      // Store cleaned raw content in cache
      await updatePlace(place.id, { website_raw: cleanedRawContent })
      console.log(`💾 Cached cleaned website content (${cleanedRawContent.length} chars)`)
      scrapedContent = cleanedRawContent
    }

    console.log(`✅ Content ready: ${pagesCount} pages, ${scrapedContent.length} characters`)

    // Step 3: Two separate LLM calls - summarization and place extraction (done in parallel)
    console.log('\n--- Step 3: Analyzing with AI ---')
    console.log(`📝 Summarizing content...`)
    console.log(`📍 Extracting mentioned places...`)

    const [summary, mentionedPlaces] = await Promise.all([
      summarizeScrapedContent(place.name || 'Unknown Place', scrapedContent),
      extractMentionedPlaces(place.name || 'Unknown Place', scrapedContent),
    ])

    if (!summary) {
      console.error('❌ AI summarization failed')
      console.error('The content may not be relevant or the AI service is unavailable.')
      process.exit(1)
    }

    // Step 4: Save results to database
    console.log('\n--- Step 4: Saving Results to Database ---')
    const updateResult = await updatePlace(place.id, {
      website_generated: summary,
      website_places_generated: mentionedPlaces,
      website_raw: scrapedContent, // Ensure raw content is stored
    })

    if (updateResult.error) {
      console.error(`❌ Failed to save results to database: ${updateResult.error.message}`)
      console.warn('⚠️  Continuing to display results...')
    } else {
      console.log(`✅ Results saved to database`)
    }

    // Step 5: Display results
    console.log('\n' + '='.repeat(80))
    console.log('✅ ANALYSIS COMPLETE')
    console.log('='.repeat(80))

    console.log('\n📝 Description:')
    console.log('-'.repeat(80))
    console.log(summary)
    console.log('-'.repeat(80))
    console.log(`Length: ${summary.length} characters`)

    console.log('\n📍 Mentioned Places:')
    console.log('-'.repeat(80))
    if (mentionedPlaces.length === 0) {
      console.log('(No other places mentioned)')
    } else {
      mentionedPlaces.forEach((placeName, index) => {
        console.log(`${index + 1}. ${placeName}`)
      })
    }
    console.log('-'.repeat(80))

    console.log('\n✨ Summary:')
    console.log(`   - Pages scraped: ${pagesCount}`)
    console.log(`   - Content analyzed: ${scrapedContent.length} chars`)
    console.log(`   - Description length: ${summary.length} chars`)
    console.log(`   - Mentioned places: ${mentionedPlaces.length}`)

    console.log('\n✅ Script completed successfully!')
  } catch (error) {
    console.error('\n❌ Fatal error occurred:')
    console.error(error)
    process.exit(1)
  }
}

// Run the script
main()
