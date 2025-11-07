import { Request, Response } from 'express'
import { getPlaceById, updatePlace } from '../db/places'
import { extractMentionedPlaces, summarizeScrapedContent } from '../services/ai.service'
import { deepWebsiteScraperService } from '../services/deep-website-scraper.service'
import { wikipediaService } from '../services/wikipedia.service'
import { cleanText, cleanWikipediaText } from '../utils/text-cleaner'

export interface PlaceAnalysisResponse {
  placeId: string
  placeName: string
  website: string | null
  description: string
  mentionedPlaces: string[]
  scrapedPagesCount: number
  error?: string
}

export interface WikipediaAnalysisResponse {
  placeId: string
  placeName: string
  wikipediaReference: string | null
  description: string
  mentionedPlaces: string[]
  error?: string
}

/**
 * Analyzes a place by scraping its website and using AI to extract information
 */
export async function analyzePlaceWebsite(
  req: Request,
  res: Response<PlaceAnalysisResponse | { error: string }>,
): Promise<void> {
  try {
    const { placeId } = req.params

    if (!placeId) {
      res.status(400).json({ error: 'Place ID is required' })
      return
    }

    console.log(`\n🔍 Starting place analysis for ID: ${placeId}`)

    // Fetch place from database
    const placeResponse = await getPlaceById(placeId)

    if (placeResponse.error || !placeResponse.data) {
      console.error(`❌ Place not found: ${placeId}`)
      res.status(404).json({ error: 'Place not found' })
      return
    }

    const place = placeResponse.data

    if (!place.website) {
      console.error(`❌ Place has no website: ${place.name}`)
      res.status(400).json({ error: 'Place has no website to analyze' })
      return
    }

    console.log(`📍 Analyzing place: ${place.name}`)
    console.log(`🌐 Website: ${place.website}`)

    // Check if bypassCache query parameter is set
    const bypassCache = req.query.bypassCache === 'true' || req.query.bypassCache === '1'
    if (bypassCache) {
      console.log(`🔄 Bypassing cache - will fetch fresh content`)
    }

    // Step 1: Check cache or scrape website
    console.log(`\n--- Step 1: Fetching Website Content ---`)
    let scrapedContent: string | null = null
    let pagesCount = 0

    if (!bypassCache && place.website_raw && place.website_raw.trim().length > 0) {
      console.log(`✅ Using cached website content (${place.website_raw.length} chars)`)
      scrapedContent = place.website_raw
      pagesCount = (scrapedContent.match(/=== Page \d+:/g) || []).length
    } else {
      if (bypassCache) {
        console.log(`🔄 Cache bypassed, scraping website...`)
      } else {
        console.log(`🔍 No cache found, scraping website...`)
      }
      scrapedContent = await deepWebsiteScraperService.scrapeWebsiteDeep(
        place.website,
        place.name || undefined,
        place.country || undefined,
      )

      if (!scrapedContent) {
        console.error(`❌ Failed to scrape website`)
        res.status(500).json({
          error: 'Failed to scrape website. The site may have protections or be unavailable.',
        })
        return
      }

      // Clean and store raw content (scrapedContent is already cleaned by extractTextContent, but normalize further)
      const cleanedRawContent = cleanText(scrapedContent)
      pagesCount = (cleanedRawContent.match(/=== Page \d+:/g) || []).length
      scrapedContent = cleanedRawContent // Use cleaned version for analysis

      // Store cleaned raw content in cache (overwrites existing cache if bypassCache was used)
      await updatePlace(place.id, { website_raw: cleanedRawContent })
      console.log(`💾 Cached cleaned website content (${cleanedRawContent.length} chars)`)
    }

    // Step 2: Two separate LLM calls - summarization and place extraction (can be done in parallel)
    console.log(`\n--- Step 2: Analyzing Content with AI ---`)
    console.log(`📝 Summarizing content...`)
    console.log(`📍 Extracting mentioned places...`)

    const [summary, mentionedPlaces] = await Promise.all([
      summarizeScrapedContent(place.name || 'Unknown Place', scrapedContent),
      extractMentionedPlaces(place.name || 'Unknown Place', scrapedContent),
    ])

    if (!summary) {
      console.error(`❌ AI summarization failed or returned no relevant content`)
      res.status(500).json({
        error: 'Failed to summarize content. The website content may not be relevant or AI service is unavailable.',
      })
      return
    }

    // Step 3: Save results to database
    console.log(`\n--- Step 3: Saving Results to Database ---`)
    console.log(`   Saving website_generated (${summary.length} chars)`)
    console.log(`   Saving website_places_generated (${mentionedPlaces.length} places)`)
    console.log(`   Saving website_raw (${scrapedContent.length} chars)`)
    console.log(`   Saving last_website_analyzed_at timestamp`)
    
    const updateResult = await updatePlace(place.id, {
      website_generated: summary,
      website_places_generated: mentionedPlaces,
      website_raw: scrapedContent, // Ensure raw content is stored (should already be cached)
      last_website_analyzed_at: new Date().toISOString(),
    })

    if (updateResult.error) {
      console.error(`❌ Failed to save results to database:`)
      console.error(`   Error:`, updateResult.error)
      console.error(`   Error message:`, updateResult.error.message)
      console.error(`   Error details:`, JSON.stringify(updateResult.error, null, 2))
      // Still return the response, but log the error clearly
    } else {
      console.log(`✅ Results saved to database successfully`)
      console.log(`   Updated place ID: ${place.id}`)
    }

    // Step 4: Return results
    console.log(`\n✅ Analysis complete!`)
    console.log(`📝 Description: ${summary.substring(0, 100)}...`)
    console.log(`📍 Mentioned places: ${mentionedPlaces.length}`)

    const response: PlaceAnalysisResponse = {
      placeId: place.id,
      placeName: place.name || 'Unknown',
      website: place.website,
      description: summary,
      mentionedPlaces: mentionedPlaces,
      scrapedPagesCount: pagesCount,
    }

    res.status(200).json(response)
  } catch (error) {
    console.error('❌ Error in analyzePlaceWebsite:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: `Internal server error: ${errorMessage}` })
  }
}

/**
 * Analyzes a place's Wikipedia page and extracts information using AI
 */
export async function analyzePlaceWikipedia(
  req: Request,
  res: Response<WikipediaAnalysisResponse | { error: string }>,
): Promise<void> {
  try {
    const { placeId } = req.params

    if (!placeId) {
      res.status(400).json({ error: 'Place ID is required' })
      return
    }

    console.log(`\n🔍 Starting Wikipedia analysis for place ID: ${placeId}`)

    // Fetch place from database
    const placeResponse = await getPlaceById(placeId)

    if (placeResponse.error || !placeResponse.data) {
      console.error(`❌ Place not found: ${placeId}`)
      res.status(404).json({ error: 'Place not found' })
      return
    }

    const place = placeResponse.data

    console.log(`📍 Analyzing place: ${place.name}`)

    // Check if bypassCache query parameter is set
    const bypassCache = req.query.bypassCache === 'true' || req.query.bypassCache === '1'
    if (bypassCache) {
      console.log(`🔄 Bypassing cache - will fetch fresh content`)
    }

    // Get metadata for later use
    const metadata = place.metadata as any

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
        console.error(`❌ No Wikipedia content found for ${place.name}`)
        res.status(404).json({
          error: 'No Wikipedia article found for this place. Try adding a Wikipedia reference in the place metadata.',
        })
        return
      }

      // Clean and store raw content
      if (wikipediaResult.rawContent) {
        wikipediaContent = cleanWikipediaText(wikipediaResult.rawContent)
        // Store cleaned raw content in cache (overwrites existing cache if bypassCache was used)
        await updatePlace(place.id, { wikipedia_raw: wikipediaContent })
        console.log(`💾 Cached cleaned Wikipedia content (${wikipediaContent.length} chars)`)
      } else {
        console.error(`❌ No Wikipedia raw content available`)
        res.status(500).json({
          error: 'Failed to fetch Wikipedia content.',
        })
        return
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

      wikipediaResult = {
        summary,
        rawContent: wikipediaContent,
        mentionedPlaces: mentionedPlaces || [],
      }
    } else {
      // We already have results from fetching, but ensure we use cleaned content
      console.log(`\n--- Step 2: Analyzing Content with AI ---`)
      // Results already obtained from fetch, but re-analyze with cleaned content if needed
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
      console.error(`❌ AI summarization failed or returned no relevant content`)
      res.status(500).json({
        error: 'Failed to summarize Wikipedia content. The content may not be relevant or AI service is unavailable.',
      })
      return
    }

    // Step 4: Save results to database
    console.log(`\n--- Step 3: Saving Results to Database ---`)
    const updateData: {
      wikipedia_generated: string
      wikipedia_places_generated?: string[]
      wikipedia_raw?: string
      last_wikipedia_analyzed_at: string
    } = {
      wikipedia_generated: wikipediaResult.summary,
      last_wikipedia_analyzed_at: new Date().toISOString(),
    }

    if (wikipediaResult.mentionedPlaces && wikipediaResult.mentionedPlaces.length > 0) {
      updateData.wikipedia_places_generated = wikipediaResult.mentionedPlaces
    }

    // Ensure raw content is stored (should already be cached, but ensure it's there)
    if (wikipediaContent) {
      updateData.wikipedia_raw = wikipediaContent
    }

    console.log(`   Saving wikipedia_generated (${wikipediaResult.summary.length} chars)`)
    console.log(`   Saving wikipedia_places_generated (${wikipediaResult.mentionedPlaces.length} places)`)
    console.log(`   Saving wikipedia_raw (${wikipediaContent?.length || 0} chars)`)
    console.log(`   Saving last_wikipedia_analyzed_at timestamp`)

    const updateResult = await updatePlace(place.id, updateData)

    if (updateResult.error) {
      console.error(`❌ Failed to save results to database:`)
      console.error(`   Error:`, updateResult.error)
      console.error(`   Error message:`, updateResult.error.message)
      console.error(`   Error details:`, JSON.stringify(updateResult.error, null, 2))
      // Still return the response, but log the error clearly
    } else {
      console.log(`✅ Results saved to database successfully`)
      console.log(`   Updated place ID: ${place.id}`)
    }

    // Step 4: Return results
    console.log(`\n✅ Wikipedia analysis complete!`)
    console.log(`📝 Description: ${wikipediaResult.summary.substring(0, 100)}...`)
    console.log(`📍 Mentioned places: ${wikipediaResult.mentionedPlaces.length}`)

    // Use the wikipediaReference from the result if available, otherwise fall back to metadata
    const wikipediaReference = wikipediaResult.wikipediaReference || metadata?.wikipedia || null

    const response: WikipediaAnalysisResponse = {
      placeId: place.id,
      placeName: place.name || 'Unknown',
      wikipediaReference: wikipediaReference,
      description: wikipediaResult.summary,
      mentionedPlaces: wikipediaResult.mentionedPlaces,
    }

    res.status(200).json(response)
  } catch (error) {
    console.error('❌ Error in analyzePlaceWikipedia:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: `Internal server error: ${errorMessage}` })
  }
}
