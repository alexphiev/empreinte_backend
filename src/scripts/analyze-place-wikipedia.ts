#!/usr/bin/env ts-node

/**
 * Script to analyze a place's Wikipedia page and extract information using AI
 *
 * Usage:
 *   pnpm run analyze-place-wikipedia <place-id>
 *   ts-node src/scripts/analyze-place-wikipedia.ts <place-id>
 *
 * Example:
 *   pnpm run analyze-place-wikipedia 123e4567-e89b-12d3-a456-426614174000
 */

import 'dotenv/config'
import { getPlaceById, updatePlace } from '../db/places'
import { wikipediaService } from '../services/wikipedia.service'
import { summarizeScrapedContent, extractMentionedPlaces } from '../services/ai.service'
import { cleanWikipediaText } from '../utils/text-cleaner'

async function main() {
  const placeId = process.argv[2]

  if (!placeId) {
    console.error('❌ Error: Place ID is required')
    console.error('\nUsage:')
    console.error('  pnpm run analyze-place-wikipedia <place-id>')
    console.error('\nExample:')
    console.error('  pnpm run analyze-place-wikipedia 123e4567-e89b-12d3-a456-426614174000')
    process.exit(1)
  }

  console.log('🚀 Starting Wikipedia analysis...\n')
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

    // Step 2: Check cache or fetch Wikipedia content
    console.log('\n--- Step 2: Fetching Wikipedia Content ---')
    let wikipediaContent: string | null = null
    let wikipediaResult: {
      summary: string | null
      rawContent: string | null
      mentionedPlaces: string[]
    } | null = null

    // Check cache first
    if (place.wikipedia_raw && place.wikipedia_raw.trim().length > 0) {
      console.log(`✅ Using cached Wikipedia content (${place.wikipedia_raw.length} chars)`)
      wikipediaContent = place.wikipedia_raw
    } else {
      console.log(`🔍 No cache found, fetching from Wikipedia...`)
      // First check if place has a wikipedia field in metadata
      const metadata = place.metadata as any
      if (metadata && metadata.wikipedia) {
        console.log(`📚 Found Wikipedia reference in metadata: ${metadata.wikipedia}`)
        wikipediaResult = await wikipediaService.fetchAndSummarizeWikipedia(
          place.name || 'Unknown',
          metadata.wikipedia,
        )
      }

      // If no metadata wikipedia, try searching by place name
      if (!wikipediaResult || (!wikipediaResult.summary && !wikipediaResult.rawContent)) {
        console.log(`🔍 No Wikipedia reference found, searching by place name...`)
        wikipediaResult = await wikipediaService.searchWikipediaByPlaceName(place.name || 'Unknown')
      }

      if (!wikipediaResult || (!wikipediaResult.summary && !wikipediaResult.rawContent)) {
        console.error('\n❌ No Wikipedia content found for this place')
        console.error('Try adding a Wikipedia reference in the place metadata (format: "en:Article Name" or "fr:Article Name")')
        process.exit(1)
      }

      // Clean and store raw content
      if (wikipediaResult.rawContent) {
        wikipediaContent = cleanWikipediaText(wikipediaResult.rawContent)
        // Store cleaned raw content in cache
        await updatePlace(place.id, { wikipedia_raw: wikipediaContent })
        console.log(`💾 Cached cleaned Wikipedia content (${wikipediaContent.length} chars)`)
      } else {
        console.error('\n❌ No Wikipedia raw content available')
        process.exit(1)
      }
    }

    // Step 3: Analyze cached or newly fetched content with AI
    if (!wikipediaResult) {
      // We have cached content, need to analyze it
      console.log('\n--- Step 3: Analyzing Cached Content with AI ---')
      console.log(`📝 Summarizing content...`)
      console.log(`📍 Extracting mentioned places...`)

      const [summary, mentionedPlaces] = await Promise.all([
        summarizeScrapedContent(place.name || 'Unknown Place', wikipediaContent),
        extractMentionedPlaces(place.name || 'Unknown Place', wikipediaContent),
      ])

      if (!summary) {
        console.error('\n❌ AI summarization failed')
        console.error('The content may not be relevant or the AI service is unavailable.')
        process.exit(1)
      }

      wikipediaResult = {
        summary,
        rawContent: wikipediaContent,
        mentionedPlaces: mentionedPlaces || [],
      }
    } else {
      // We already have results from fetching, but re-analyze with cleaned content
      console.log('\n--- Step 3: Analyzing Content with AI ---')
      if (wikipediaContent && wikipediaContent !== wikipediaResult.rawContent) {
        const [summary, mentionedPlaces] = await Promise.all([
          summarizeScrapedContent(place.name || 'Unknown Place', wikipediaContent),
          extractMentionedPlaces(place.name || 'Unknown Place', wikipediaContent),
        ])
        wikipediaResult.summary = summary
        wikipediaResult.mentionedPlaces = mentionedPlaces || []
      }

      if (!wikipediaResult.summary) {
        console.error('\n❌ AI summarization failed')
        console.error('The content may not be relevant or the AI service is unavailable.')
        process.exit(1)
      }
    }

    // Step 4: Save results to database
    console.log('\n--- Step 4: Saving Results to Database ---')
    const updateData: {
      wikipedia_generated: string
      wikipedia_places_generated?: string[]
      wikipedia_raw?: string
    } = {
      wikipedia_generated: wikipediaResult.summary,
    }

    if (wikipediaResult.mentionedPlaces && wikipediaResult.mentionedPlaces.length > 0) {
      updateData.wikipedia_places_generated = wikipediaResult.mentionedPlaces
    }

    // Ensure raw content is stored (should already be cached, but ensure it's there)
    if (wikipediaContent) {
      updateData.wikipedia_raw = wikipediaContent
    }

    const updateResult = await updatePlace(place.id, updateData)

    if (updateResult.error) {
      console.error(`❌ Failed to save results to database: ${updateResult.error.message}`)
      console.warn('⚠️  Continuing to display results...')
    } else {
      console.log(`✅ Results saved to database`)
    }

    // Step 4: Display results
    console.log('\n' + '='.repeat(80))
    console.log('✅ WIKIPEDIA ANALYSIS COMPLETE')
    console.log('='.repeat(80))

    console.log('\n📝 Description:')
    console.log('-'.repeat(80))
    console.log(wikipediaResult.summary)
    console.log('-'.repeat(80))
    console.log(`Length: ${wikipediaResult.summary.length} characters`)

    console.log('\n📍 Mentioned Places:')
    console.log('-'.repeat(80))
    if (wikipediaResult.mentionedPlaces.length === 0) {
      console.log('(No other places mentioned)')
    } else {
      wikipediaResult.mentionedPlaces.forEach((placeName, index) => {
        console.log(`${index + 1}. ${placeName}`)
      })
    }
    console.log('-'.repeat(80))

    console.log('\n✨ Summary:')
    console.log(`   - Description length: ${wikipediaResult.summary.length} chars`)
    console.log(`   - Mentioned places: ${wikipediaResult.mentionedPlaces.length}`)
    if (wikipediaResult.rawContent) {
      console.log(`   - Raw content length: ${wikipediaResult.rawContent.length} chars`)
    }

    console.log('\n✅ Script completed successfully!')
  } catch (error) {
    console.error('\n❌ Fatal error occurred:')
    console.error(error)
    process.exit(1)
  }
}

// Run the script
main()

