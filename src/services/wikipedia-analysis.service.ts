import { getPlaceById, updatePlace } from '../db/places'
import { getOrCreateSource } from '../db/sources'
import { batchGetOrCreateGeneratedPlaces } from '../db/generated-places'
import { cleanWikipediaText } from '../utils/text-cleaner'
import { extractMentionedPlaces, summarizeScrapedContent } from './ai.service'
import { wikipediaService } from './wikipedia.service'

export interface WikipediaAnalysisResult {
  placeId: string
  placeName: string
  wikipediaReference: string | null
  description: string
  mentionedPlaces: string[]
}

export interface WikipediaAnalysisOptions {
  bypassCache?: boolean
}

/**
 * Core Wikipedia analysis logic - shared between API and scripts
 */
export async function analyzePlaceWikipediaCore(
  placeId: string,
  options: WikipediaAnalysisOptions = {},
): Promise<{ result: WikipediaAnalysisResult; error?: string }> {
  try {
    // Fetch place from database
    const placeResponse = await getPlaceById(placeId)

    if (placeResponse.error || !placeResponse.data) {
      return {
        result: {
          placeId,
          placeName: 'Unknown',
          wikipediaReference: null,
          description: '',
          mentionedPlaces: [],
        },
        error: `Place not found: ${placeId}`,
      }
    }

    const place = placeResponse.data
    const metadata = place.metadata as any
    const bypassCache = options.bypassCache || false

    console.log(`📍 Analyzing place: ${place.name}`)

    if (bypassCache) {
      console.log(`🔄 Bypassing cache - will fetch fresh content`)
    }

    // Step 1: Check cache or fetch Wikipedia content
    console.log(`\n--- Step 1: Fetching Wikipedia Content ---`)
    let wikipediaContent: string | null = null
    let wikipediaResult: {
      summary: string | null
      rawContent: string | null
      mentionedPlaces: string[]
      wikipediaReference?: string | null
    } | null = null

    // Check cache first (unless bypassing)
    if (!bypassCache && place.wikipedia_raw && place.wikipedia_raw.trim().length > 0) {
      console.log(`✅ Using cached Wikipedia content (${place.wikipedia_raw.length} chars)`)
      wikipediaContent = place.wikipedia_raw
    } else {
      if (bypassCache) {
        console.log(`🔄 Cache bypassed, fetching from Wikipedia...`)
      } else {
        console.log(`🔍 No cache found, fetching from Wikipedia...`)
      }
      // First check if place has a wikipedia field in metadata
      if (metadata && metadata.wikipedia) {
        console.log(`📚 Found Wikipedia reference in metadata: ${metadata.wikipedia}`)
        wikipediaResult = await wikipediaService.fetchAndSummarizeWikipedia(place.name || 'Unknown', metadata.wikipedia)
      }

      // If no metadata wikipedia, try searching by place name
      if (!wikipediaResult || (!wikipediaResult.summary && !wikipediaResult.rawContent)) {
        console.log(`🔍 No Wikipedia reference found, searching by place name...`)
        wikipediaResult = await wikipediaService.searchWikipediaByPlaceName(
          place.name || 'Unknown',
          place.country || undefined,
        )
      }

      if (!wikipediaResult || (!wikipediaResult.summary && !wikipediaResult.rawContent)) {
        return {
          result: {
            placeId: place.id,
            placeName: place.name || 'Unknown',
            wikipediaReference: null,
            description: '',
            mentionedPlaces: [],
          },
          error: 'No Wikipedia article found for this place. Try adding a Wikipedia reference in the place metadata.',
        }
      }

      // Clean and store raw content
      if (wikipediaResult.rawContent) {
        wikipediaContent = cleanWikipediaText(wikipediaResult.rawContent)
        // Store cleaned raw content in cache
        await updatePlace(place.id, { wikipedia_raw: wikipediaContent })
        console.log(`💾 Cached cleaned Wikipedia content (${wikipediaContent.length} chars)`)
      } else {
        return {
          result: {
            placeId: place.id,
            placeName: place.name || 'Unknown',
            wikipediaReference: null,
            description: '',
            mentionedPlaces: [],
          },
          error: 'Failed to fetch Wikipedia content.',
        }
      }
    }

    // Step 2: Analyze cached or newly fetched content with AI
    if (!wikipediaResult) {
      // We have cached content, need to analyze it
      console.log(`\n--- Step 2: Analyzing Cached Content with AI ---`)
      console.log(`📝 Summarizing content...`)
      console.log(`📍 Extracting mentioned places...`)

      const [summary, mentionedPlaces] = await Promise.all([
        summarizeScrapedContent(place.name || 'Unknown Place', wikipediaContent),
        extractMentionedPlaces(place.name || 'Unknown Place', wikipediaContent),
      ])

      if (!summary) {
        return {
          result: {
            placeId: place.id,
            placeName: place.name || 'Unknown',
            wikipediaReference: metadata?.wikipedia || null,
            description: '',
            mentionedPlaces: [],
          },
          error: 'Failed to summarize Wikipedia content. The content may not be relevant or AI service is unavailable.',
        }
      }

      wikipediaResult = {
        summary,
        rawContent: wikipediaContent,
        mentionedPlaces: mentionedPlaces || [],
        wikipediaReference: metadata?.wikipedia || null,
      }
    } else {
      // We already have results from fetching, but ensure we use cleaned content
      console.log(`\n--- Step 2: Analyzing Content with AI ---`)
      if (wikipediaContent && wikipediaContent !== wikipediaResult.rawContent) {
        const [summary, mentionedPlaces] = await Promise.all([
          summarizeScrapedContent(place.name || 'Unknown Place', wikipediaContent),
          extractMentionedPlaces(place.name || 'Unknown Place', wikipediaContent),
        ])
        wikipediaResult.summary = summary
        wikipediaResult.mentionedPlaces = mentionedPlaces || []
      }
    }

    // Step 3: Check if we got a summary
    if (!wikipediaResult.summary) {
      return {
        result: {
          placeId: place.id,
          placeName: place.name || 'Unknown',
          wikipediaReference: wikipediaResult.wikipediaReference || metadata?.wikipedia || null,
          description: '',
          mentionedPlaces: [],
        },
        error: 'Failed to summarize Wikipedia content. The content may not be relevant or AI service is unavailable.',
      }
    }

    // Step 4: Save results to database
    console.log(`\n--- Step 3: Saving Results to Database ---`)
    console.log(`   Saving wikipedia_generated (${wikipediaResult.summary.length} chars)`)
    console.log(`   Saving wikipedia_places_generated (${wikipediaResult.mentionedPlaces.length} places)`)
    console.log(`   Saving wikipedia_raw (${wikipediaContent?.length || 0} chars)`)
    console.log(`   Saving wikipedia_analyzed_at timestamp`)

    const updateData: {
      wikipedia_generated: string
      wikipedia_places_generated?: string[]
      wikipedia_raw?: string
      wikipedia_analyzed_at: string
    } = {
      wikipedia_generated: wikipediaResult.summary,
      wikipedia_analyzed_at: new Date().toISOString(),
    }

    if (wikipediaResult.mentionedPlaces && wikipediaResult.mentionedPlaces.length > 0) {
      updateData.wikipedia_places_generated = wikipediaResult.mentionedPlaces
    }

    // Ensure raw content is stored
    if (wikipediaContent) {
      updateData.wikipedia_raw = wikipediaContent
    }

    const updateResult = await updatePlace(place.id, updateData)

    if (updateResult.error) {
      // Log error but continue - we still have the results
      console.error(`❌ Failed to save results to database:`)
      console.error(`   Error:`, updateResult.error)
      console.error(`   Error message:`, updateResult.error.message)
      console.error(`   Error details:`, JSON.stringify(updateResult.error, null, 2))
    } else {
      console.log(`✅ Results saved to database successfully`)
      console.log(`   Updated place ID: ${place.id}`)
    }

    // Use the wikipediaReference from the result if available, otherwise fall back to metadata
    const wikipediaReference = wikipediaResult.wikipediaReference || metadata?.wikipedia || null

    // Step 4: Store source and generated places
    if (wikipediaResult.mentionedPlaces.length > 0 && wikipediaReference) {
      console.log(`\n--- Step 4: Storing Source and Generated Places ---`)
      try {
        // Construct Wikipedia URL from reference (format: "lang:ArticleTitle")
        const wikipediaUrl = wikipediaReference.includes(':')
          ? `https://${wikipediaReference.split(':')[0]}.wikipedia.org/wiki/${encodeURIComponent(wikipediaReference.split(':')[1])}`
          : null

        if (wikipediaUrl) {
          // Get or create source for the Wikipedia URL
          const sourceResponse = await getOrCreateSource(wikipediaUrl)
          if (sourceResponse.error || !sourceResponse.data) {
            console.error(`❌ Failed to get or create source:`, sourceResponse.error)
          } else {
            const source = sourceResponse.data
            console.log(`✅ Source ID: ${source.id}`)

            // Store generated places linked to this source
            const placesToStore = wikipediaResult.mentionedPlaces.map((placeName) => ({
              name: placeName,
              description: null, // We don't have descriptions for mentioned places from Wikipedia analysis
              source_id: source.id,
            }))

            const storedPlaces = await batchGetOrCreateGeneratedPlaces(placesToStore)
            console.log(`✅ Stored ${storedPlaces.length} generated places linked to source`)
          }
        }
      } catch (error) {
        console.error(`❌ Error storing source and generated places:`, error)
        // Don't fail the whole operation if this step fails
      }
    }

    return {
      result: {
        placeId: place.id,
        placeName: place.name || 'Unknown',
        wikipediaReference: wikipediaReference,
        description: wikipediaResult.summary,
        mentionedPlaces: wikipediaResult.mentionedPlaces,
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      result: {
        placeId,
        placeName: 'Unknown',
        wikipediaReference: null,
        description: '',
        mentionedPlaces: [],
      },
      error: `Internal error: ${errorMessage}`,
    }
  }
}
