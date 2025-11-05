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
import { getPlaceById } from '../db/places'
import { analyzeScrapedContent } from '../services/ai.service'
import { deepWebsiteScraperService } from '../services/deep-website-scraper.service'

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

    // Step 2: Scrape website
    console.log('\n--- Step 2: Scraping Website ---')
    console.log(`Target: ${place.website}`)

    const scrapedContent = await deepWebsiteScraperService.scrapeWebsiteDeep(place.website)

    if (!scrapedContent) {
      console.error('❌ Failed to scrape website')
      console.error(
        'The website may have protections, be unavailable, or there was a network error.',
      )
      process.exit(1)
    }

    const pagesCount = (scrapedContent.match(/=== Page \d+:/g) || []).length
    console.log(`✅ Successfully scraped ${pagesCount} pages`)
    console.log(`   Total content length: ${scrapedContent.length} characters`)

    // Step 3: Analyze with AI
    console.log('\n--- Step 3: Analyzing with AI ---')
    console.log(`Using Gemini API to extract description and mentioned places...`)

    const analysis = await analyzeScrapedContent(place.name || 'Unknown Place', scrapedContent)

    if (!analysis) {
      console.error('❌ AI analysis failed')
      console.error('The content may not be relevant or the AI service is unavailable.')
      process.exit(1)
    }

    // Step 4: Display results
    console.log('\n' + '='.repeat(80))
    console.log('✅ ANALYSIS COMPLETE')
    console.log('='.repeat(80))

    console.log('\n📝 Description:')
    console.log('-'.repeat(80))
    console.log(analysis.description)
    console.log('-'.repeat(80))
    console.log(`Length: ${analysis.description.length} characters`)

    console.log('\n📍 Mentioned Places:')
    console.log('-'.repeat(80))
    if (analysis.mentionedPlaces.length === 0) {
      console.log('(No other places mentioned)')
    } else {
      analysis.mentionedPlaces.forEach((place, index) => {
        console.log(`${index + 1}. ${place}`)
      })
    }
    console.log('-'.repeat(80))

    console.log('\n✨ Summary:')
    console.log(`   - Pages scraped: ${pagesCount}`)
    console.log(`   - Content analyzed: ${scrapedContent.length} chars`)
    console.log(`   - Description length: ${analysis.description.length} chars`)
    console.log(`   - Mentioned places: ${analysis.mentionedPlaces.length}`)

    console.log('\n✅ Script completed successfully!')
  } catch (error) {
    console.error('\n❌ Fatal error occurred:')
    console.error(error)
    process.exit(1)
  }
}

// Run the script
main()
