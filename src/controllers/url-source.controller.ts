import { Request, Response } from 'express'
import { getExistingPlaces, updatePlace } from '../db/places'
import { createPlacesToRefine } from '../db/places-to-refine'
import { createScrapedPages } from '../db/scraped-pages'
import { createUrlSource, getUrlSourceByUrl, isUrlAlreadySubmitted, updateUrlSourceStatus } from '../db/url-sources'
import { extractPlacesFromContent, ExtractedPlace } from '../services/ai.service'
import { deepWebsiteScraperService } from '../services/deep-website-scraper.service'
import type { PlaceToRefineInsert } from '../types/new-tables'

export interface UrlSubmissionRequest {
  url: string
  submittedBy?: string
}

export interface UrlAnalysisResponse {
  urlSourceId: string
  url: string
  status: 'completed' | 'failed'
  placesFound: number
  pagesScraped: number
  newPlaces: number
  existingPlacesUpdated: number
  extractedPlaces: ExtractedPlace[]
  error?: string
}

/**
 * Analyzes a submitted URL to extract places and cross-reference with database
 * Implements Issue #66 - Method to suggest sources from URLs
 */
export async function analyzeUrlSource(
  req: Request<object, UrlAnalysisResponse, UrlSubmissionRequest>,
  res: Response<UrlAnalysisResponse | { error: string }>,
): Promise<void> {
  try {
    const { url, submittedBy } = req.body

    if (!url) {
      res.status(400).json({ error: 'URL is required' })
      return
    }

    // Validate URL format
    try {
      new URL(url)
    } catch {
      res.status(400).json({ error: 'Invalid URL format' })
      return
    }

    console.log(`\n🔍 Starting URL source analysis for: ${url}`)

    // Check if URL already submitted
    const alreadySubmitted = await isUrlAlreadySubmitted(url)
    let urlSourceId: string

    if (alreadySubmitted) {
      console.log(`⚠️  URL already submitted, retrieving existing record`)
      const { data: existingSource } = await getUrlSourceByUrl(url)
      if (existingSource) {
        urlSourceId = existingSource.id
        // Update status to processing
        await updateUrlSourceStatus(urlSourceId, 'processing')
      } else {
        res.status(500).json({ error: 'Error retrieving existing URL source' })
        return
      }
    } else {
      // Create new URL source record
      const { data: newSource, error: createError } = await createUrlSource({
        url,
        submitted_by: submittedBy || null,
        source_type: 'api',
        processing_status: 'processing',
        places_found: 0,
        pages_scraped: 0,
        analysis_result: null,
        error_message: null,
        processed_at: null,
      })

      if (createError || !newSource) {
        console.error(`❌ Error creating URL source:`, createError)
        res.status(500).json({ error: 'Failed to create URL source record' })
        return
      }

      urlSourceId = newSource.id
      console.log(`✅ Created URL source record: ${urlSourceId}`)
    }

    // Step 1: Deep scrape the website
    console.log(`\n--- Step 1: Scraping Website ---`)
    const scrapedContent = await deepWebsiteScraperService.scrapeWebsiteDeep(url)

    if (!scrapedContent) {
      console.error(`❌ Failed to scrape website`)
      await updateUrlSourceStatus(urlSourceId, 'failed', {
        error_message: 'Failed to scrape website. The site may have protections or be unavailable.',
      })
      res.status(500).json({
        error: 'Failed to scrape website',
      })
      return
    }

    const pagesCount = (scrapedContent.match(/=== Page \d+:/g) || []).length
    console.log(`✅ Scraped ${pagesCount} pages`)

    // Store scraped pages (extract individual pages from combined content)
    const pageMatches = scrapedContent.matchAll(/=== Page \d+: (https?:\/\/[^\s]+) ===\n\n([\s\S]*?)(?=\n\n=== Page \d+:|$)/g)
    const scrapedPages = []

    for (const match of pageMatches) {
      const pageUrl = match[1]
      const pageText = match[2].trim()
      scrapedPages.push({
        website_url: url,
        page_url: pageUrl,
        extracted_text: pageText,
        extraction_date: new Date().toISOString(),
        place_id: null,
        page_title: null,
        word_count: pageText.split(/\s+/).length,
        status: 'extracted' as const,
      })
    }

    if (scrapedPages.length > 0) {
      await createScrapedPages(scrapedPages)
      console.log(`✅ Stored ${scrapedPages.length} scraped pages in database`)
    }

    // Step 2: Extract places using AI
    console.log(`\n--- Step 2: Extracting Places with AI ---`)
    const extractedPlaces = await extractPlacesFromContent(scrapedContent)

    if (!extractedPlaces || extractedPlaces.length === 0) {
      console.log(`❌ No places extracted`)
      await updateUrlSourceStatus(urlSourceId, 'completed', {
        places_found: 0,
        pages_scraped: pagesCount,
        analysis_result: { extractedPlaces: [], message: 'No places found in content' },
      })

      res.status(200).json({
        urlSourceId,
        url,
        status: 'completed',
        placesFound: 0,
        pagesScraped: pagesCount,
        newPlaces: 0,
        existingPlacesUpdated: 0,
        extractedPlaces: [],
      })
      return
    }

    console.log(`✅ Extracted ${extractedPlaces.length} places`)

    // Step 3: Cross-reference with existing database
    console.log(`\n--- Step 3: Cross-referencing with Database ---`)
    const placeNames = extractedPlaces.map((p) => p.name)
    const existingPlaceNames = await getExistingPlaces(placeNames)

    let existingPlacesUpdated = 0
    let newPlacesCreated = 0

    // Process each extracted place
    for (const extractedPlace of extractedPlaces) {
      const isExisting = existingPlaceNames.includes(extractedPlace.name)

      if (isExisting) {
        // Update existing place: boost score, improve description
        console.log(`  ✅ Found existing place: ${extractedPlace.name}`)

        // TODO: Implement score boosting and description enhancement
        // For now, we'll just log it
        existingPlacesUpdated++
      } else {
        // Create entry in places_to_refine
        console.log(`  📍 New place to refine: ${extractedPlace.name}`)
        newPlacesCreated++
      }
    }

    // Bulk insert new places to refine
    const placesToRefine: PlaceToRefineInsert[] = extractedPlaces
      .filter((p) => !existingPlaceNames.includes(p.name))
      .map((p) => ({
        name: p.name,
        description: p.description,
        source_url: url,
        extracted_data: {
          placeType: p.placeType,
          locationHint: p.locationHint,
          confidence: p.confidence,
        },
        mentioned_in_place_id: null,
        status: 'pending' as const,
        matched_place_id: null,
        confidence_score: p.confidence,
        location_hint: p.locationHint,
        place_type: p.placeType,
        country: null,
        region: null,
        processed_at: null,
      }))

    if (placesToRefine.length > 0) {
      const { error: insertError } = await createPlacesToRefine(placesToRefine)
      if (insertError) {
        console.error(`❌ Error inserting places to refine:`, insertError)
      } else {
        console.log(`✅ Created ${placesToRefine.length} places to refine`)
      }
    }

    // Step 4: Update URL source with results
    await updateUrlSourceStatus(urlSourceId, 'completed', {
      places_found: extractedPlaces.length,
      pages_scraped: pagesCount,
      analysis_result: {
        extractedPlaces,
        existingPlacesUpdated,
        newPlacesCreated,
      },
    })

    // Return results
    console.log(`\n✅ Analysis complete!`)
    console.log(`   - Pages scraped: ${pagesCount}`)
    console.log(`   - Places found: ${extractedPlaces.length}`)
    console.log(`   - Existing places: ${existingPlacesUpdated}`)
    console.log(`   - New places: ${newPlacesCreated}`)

    res.status(200).json({
      urlSourceId,
      url,
      status: 'completed',
      placesFound: extractedPlaces.length,
      pagesScraped: pagesCount,
      newPlaces: newPlacesCreated,
      existingPlacesUpdated,
      extractedPlaces,
    })
  } catch (error) {
    console.error('❌ Error in analyzeUrlSource:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: `Internal server error: ${errorMessage}` })
  }
}
