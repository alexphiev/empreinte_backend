import { Request, Response } from 'express'
import { analyzePlaceWebsiteCore } from '../services/website-analysis.service'
import { analyzePlaceWikipediaCore } from '../services/wikipedia-analysis.service'

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

    // Check if bypassCache query parameter is set
    const bypassCache = req.query.bypassCache === 'true' || req.query.bypassCache === '1'
    if (bypassCache) {
      console.log(`🔄 Bypassing cache - will fetch fresh content`)
    }

    const { result, error } = await analyzePlaceWebsiteCore(placeId, { bypassCache })

    if (error) {
      if (error.includes('not found')) {
        res.status(404).json({ error })
      } else if (error.includes('no website')) {
        res.status(400).json({ error })
      } else {
        res.status(500).json({ error })
      }
      return
    }

    console.log(`\n✅ Analysis complete!`)
    console.log(`📝 Description: ${result.description.substring(0, 100)}...`)
    console.log(`📍 Mentioned places: ${result.mentionedPlaces.length}`)

    const response: PlaceAnalysisResponse = {
      placeId: result.placeId,
      placeName: result.placeName,
      website: result.website,
      description: result.description,
      mentionedPlaces: result.mentionedPlaces,
      scrapedPagesCount: result.scrapedPagesCount,
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

    // Check if bypassCache query parameter is set
    const bypassCache = req.query.bypassCache === 'true' || req.query.bypassCache === '1'
    if (bypassCache) {
      console.log(`🔄 Bypassing cache - will fetch fresh content`)
    }

    const { result, error } = await analyzePlaceWikipediaCore(placeId, { bypassCache })

    if (error) {
      if (error.includes('not found')) {
        res.status(404).json({ error })
      } else if (error.includes('No Wikipedia article')) {
        res.status(404).json({ error })
      } else {
        res.status(500).json({ error })
      }
      return
    }

    console.log(`\n✅ Wikipedia analysis complete!`)
    console.log(`📝 Description: ${result.description.substring(0, 100)}...`)
    console.log(`📍 Mentioned places: ${result.mentionedPlaces.length}`)

    const response: WikipediaAnalysisResponse = {
      placeId: result.placeId,
      placeName: result.placeName,
      wikipediaReference: result.wikipediaReference,
      description: result.description,
      mentionedPlaces: result.mentionedPlaces,
    }

    res.status(200).json(response)
  } catch (error) {
    console.error('❌ Error in analyzePlaceWikipedia:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: `Internal server error: ${errorMessage}` })
  }
}
