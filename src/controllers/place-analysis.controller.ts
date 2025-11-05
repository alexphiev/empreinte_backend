import { Request, Response } from 'express'
import { getPlaceById } from '../db/places'
import { analyzeScrapedContent, PlaceAnalysisResult } from '../services/ai.service'
import { deepWebsiteScraperService } from '../services/deep-website-scraper.service'

export interface PlaceAnalysisResponse {
  placeId: string
  placeName: string
  website: string | null
  description: string
  mentionedPlaces: string[]
  scrapedPagesCount: number
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

    // Step 1: Deep scrape the website
    console.log(`\n--- Step 1: Deep Scraping Website ---`)
    const scrapedContent = await deepWebsiteScraperService.scrapeWebsiteDeep(place.website)

    if (!scrapedContent) {
      console.error(`❌ Failed to scrape website`)
      res.status(500).json({
        error: 'Failed to scrape website. The site may have protections or be unavailable.',
      })
      return
    }

    // Count approximate pages (based on page separators)
    const pagesCount = (scrapedContent.match(/=== Page \d+:/g) || []).length

    // Step 2: Analyze content with AI
    console.log(`\n--- Step 2: Analyzing Content with AI ---`)
    const analysis = await analyzeScrapedContent(place.name || 'Unknown Place', scrapedContent)

    if (!analysis) {
      console.error(`❌ AI analysis failed or returned no relevant content`)
      res.status(500).json({
        error:
          'Failed to analyze content. The website content may not be relevant or AI service is unavailable.',
      })
      return
    }

    // Step 3: Return results
    console.log(`\n✅ Analysis complete!`)
    console.log(`📝 Description: ${analysis.description.substring(0, 100)}...`)
    console.log(`📍 Mentioned places: ${analysis.mentionedPlaces.length}`)

    const response: PlaceAnalysisResponse = {
      placeId: place.id,
      placeName: place.name || 'Unknown',
      website: place.website,
      description: analysis.description,
      mentionedPlaces: analysis.mentionedPlaces,
      scrapedPagesCount: pagesCount,
    }

    res.status(200).json(response)
  } catch (error) {
    console.error('❌ Error in analyzePlaceWebsite:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: `Internal server error: ${errorMessage}` })
  }
}
