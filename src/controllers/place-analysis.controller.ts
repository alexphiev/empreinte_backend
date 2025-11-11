import { Request, Response } from 'express'
import { Place } from '../db/places'
import { analyzePlaceRedditCore } from '../services/reddit-analysis.service'
import { supabase } from '../services/supabase.service'
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
  description: string | null
  wikipediaData: {
    page_title: string
    categories: string[]
    first_paragraph: string | null
    infobox_data: Record<string, any> | null
    page_views: number | null
    language_versions: string[]
    score: number
  } | null
  error?: string
}

export interface RedditAnalysisResponse {
  placeId: string
  placeName: string
  description: string
  threadsCount: number
  error?: string
}

export interface BatchWebsiteAnalysisResponse {
  results: Array<PlaceAnalysisResponse & { error?: string }>
  totalProcessed: number
  totalSuccess: number
  totalErrors: number
}

export interface BatchWikipediaAnalysisResponse {
  totalProcessed: number
  totalSuccess: number
  totalErrors: number
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

    if (!result) {
      res.status(500).json({ error: 'No result from Wikipedia analysis' })
      return
    }

    console.log(`\n✅ Wikipedia analysis complete!`)
    if (result.description) {
      console.log(`📝 Description: ${result.description.substring(0, 100)}...`)
    }
    if (result.wikipediaData) {
      console.log(`📊 Page views: ${result.wikipediaData.page_views || 'N/A'}`)
      console.log(`🌐 Language versions: ${result.wikipediaData.language_versions.length}`)
      console.log(`⭐ Score: ${result.wikipediaData.score}`)
    }

    const response: WikipediaAnalysisResponse = {
      placeId: result.placeId,
      placeName: result.placeName,
      wikipediaReference: result.wikipediaReference,
      description: result.description,
      wikipediaData: result.wikipediaData
        ? {
            page_title: result.wikipediaData.page_title,
            categories: result.wikipediaData.categories,
            first_paragraph: result.wikipediaData.first_paragraph,
            infobox_data: result.wikipediaData.infobox_data,
            page_views: result.wikipediaData.page_views,
            language_versions: result.wikipediaData.language_versions,
            score: result.wikipediaData.score,
          }
        : null,
    }

    res.status(200).json(response)
  } catch (error) {
    console.error('❌ Error in analyzePlaceWikipedia:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: `Internal server error: ${errorMessage}` })
  }
}

/**
 * Analyzes a place's Reddit discussions and extracts information using AI
 */
export async function analyzePlaceReddit(
  req: Request,
  res: Response<RedditAnalysisResponse | { error: string }>,
): Promise<void> {
  try {
    const { placeId } = req.params

    if (!placeId) {
      res.status(400).json({ error: 'Place ID is required' })
      return
    }

    console.log(`\n🔍 Starting Reddit analysis for place ID: ${placeId}`)

    // Check if bypassCache query parameter is set
    const bypassCache = req.query.bypassCache === 'true' || req.query.bypassCache === '1'
    if (bypassCache) {
      console.log(`🔄 Bypassing cache - will fetch fresh content`)
    }

    const { result, error } = await analyzePlaceRedditCore(placeId, { bypassCache })

    if (error) {
      if (error.includes('not found')) {
        res.status(404).json({ error })
      } else if (error.includes('No Reddit discussions')) {
        res.status(404).json({ error })
      } else {
        res.status(500).json({ error })
      }
      return
    }

    console.log(`\n✅ Reddit analysis complete!`)
    console.log(`📝 Description: ${result.description.substring(0, 100)}...`)
    console.log(`📱 Threads analyzed: ${result.threadsCount}`)

    const response: RedditAnalysisResponse = {
      placeId: result.placeId,
      placeName: result.placeName,
      description: result.description,
      threadsCount: result.threadsCount,
    }

    res.status(200).json(response)
  } catch (error) {
    console.error('❌ Error in analyzePlaceReddit:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: `Internal server error: ${errorMessage}` })
  }
}

/**
 * Batch analyzes places' websites
 */
export async function batchAnalyzePlaceWebsites(
  req: Request,
  res: Response<BatchWebsiteAnalysisResponse | { error: string }>,
): Promise<void> {
  try {
    const limit = req.body.limit ? Number(req.body.limit) : undefined
    const bypassCache = req.body.bypass === true || req.body.bypass === 'true' || req.body.bypass === '1'

    if (limit !== undefined && (isNaN(limit) || limit < 1)) {
      res.status(400).json({ error: 'limit must be a positive number' })
      return
    }

    console.log(`\n🔍 Starting batch website analysis`)
    if (limit !== undefined) {
      console.log(`🔢 Limit: ${limit} places`)
    }
    if (bypassCache) {
      console.log(`🔄 Bypassing cache - will fetch fresh content`)
    }

    // Get places with websites that haven't been analyzed (or all if bypassing)
    let query = supabase.from('places').select('*').not('website', 'is', null) // Places that have a website

    if (!bypassCache) {
      // Only get places that haven't been analyzed yet
      query = query.is('website_analyzed_at', null)
    }

    // Order by score descending to prioritize higher-scored places
    query = query.order('score', { ascending: false })

    if (limit !== undefined) {
      query = query.limit(limit)
    }

    const { data: placesToProcess, error: queryError } = await query

    if (queryError) {
      console.error('❌ Error fetching places:', queryError)
      res.status(500).json({ error: `Database error: ${queryError.message}` })
      return
    }

    if (!placesToProcess || placesToProcess.length === 0) {
      res.status(200).json({
        results: [],
        totalProcessed: 0,
        totalSuccess: 0,
        totalErrors: 0,
      })
      return
    }

    console.log(`📋 Found ${placesToProcess.length} places to process`)

    const results: BatchWebsiteAnalysisResponse['results'] = []

    // Process places one by one
    for (let i = 0; i < placesToProcess.length; i++) {
      const place = placesToProcess[i] as Place
      console.log(`\n📍 Processing place ${i + 1}/${placesToProcess.length}: ${place.name}`)

      try {
        const { result, error } = await analyzePlaceWebsiteCore(place.id, { bypassCache })

        if (error) {
          results.push({
            placeId: place.id,
            placeName: place.name || 'Unknown',
            website: place.website,
            description: '',
            mentionedPlaces: [],
            scrapedPagesCount: 0,
            error,
          })
        } else {
          results.push({
            placeId: result.placeId,
            placeName: result.placeName,
            website: result.website,
            description: result.description,
            mentionedPlaces: result.mentionedPlaces,
            scrapedPagesCount: result.scrapedPagesCount,
          })
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        results.push({
          placeId: place.id,
          placeName: place.name || 'Unknown',
          website: place.website,
          description: '',
          mentionedPlaces: [],
          scrapedPagesCount: 0,
          error: errorMessage,
        })
      }

      // Add small delay between requests (except for the last one)
      if (i < placesToProcess.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    const totalSuccess = results.filter((r) => !r.error).length
    const totalErrors = results.filter((r) => r.error).length

    console.log(`\n✅ Batch website analysis complete!`)
    console.log(`📊 Processed: ${results.length}`)
    console.log(`✅ Success: ${totalSuccess}`)
    console.log(`❌ Errors: ${totalErrors}`)

    res.status(200).json({
      results,
      totalProcessed: results.length,
      totalSuccess,
      totalErrors,
    })
  } catch (error) {
    console.error('❌ Error in batchAnalyzePlaceWebsites:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: `Internal server error: ${errorMessage}` })
  }
}

/**
 * Batch analyzes places' Wikipedia pages
 */
export async function batchAnalyzePlaceWikipedias(
  req: Request,
  res: Response<BatchWikipediaAnalysisResponse | { error: string }>,
): Promise<void> {
  try {
    const limit = req.body.limit ? Number(req.body.limit) : undefined
    const bypassCache = req.body.bypass === true || req.body.bypass === 'true' || req.body.bypass === '1'

    if (limit !== undefined && (isNaN(limit) || limit < 1)) {
      res.status(400).json({ error: 'limit must be a positive number' })
      return
    }

    console.log(`\n🔍 Starting batch Wikipedia analysis`)
    if (limit !== undefined) {
      console.log(`🔢 Limit: ${limit} places`)
    }
    if (bypassCache) {
      console.log(`🔄 Bypassing cache - will fetch fresh content`)
    }

    // Get places that haven't been analyzed (or all if bypassing)
    let query = supabase.from('places').select('*')

    if (!bypassCache) {
      // Only get places that haven't been analyzed yet
      query = query.is('wikipedia_analyzed_at', null)
    }

    // Order by score descending to prioritize higher-scored places
    query = query.order('score', { ascending: false })

    if (limit !== undefined) {
      query = query.limit(limit)
    }

    const { data: placesToProcess, error: queryError } = await query

    if (queryError) {
      console.error('❌ Error fetching places:', queryError)
      res.status(500).json({ error: `Database error: ${queryError.message}` })
      return
    }

    if (!placesToProcess || placesToProcess.length === 0) {
      res.status(200).json({
        totalProcessed: 0,
        totalSuccess: 0,
        totalErrors: 0,
      })
      return
    }

    console.log(`📋 Found ${placesToProcess.length} places to process`)

    let totalSuccess = 0
    let totalErrors = 0

    // Process places one by one
    for (let i = 0; i < placesToProcess.length; i++) {
      const place = placesToProcess[i] as Place
      console.log(`\n📍 Processing place ${i + 1}/${placesToProcess.length}: ${place.name}`)

      try {
        const { result, error } = await analyzePlaceWikipediaCore(place.id, { bypassCache })

        if (error || !result) {
          totalErrors++
          console.error(`❌ Error: ${error || 'No result from Wikipedia analysis'}`)
        } else {
          totalSuccess++
          const descLength = result.description?.length || 0
          const score = result.wikipediaData?.score || 0
          console.log(`✅ Success: ${descLength} chars, score: ${score}`)
        }
      } catch (error) {
        totalErrors++
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`❌ Fatal error processing place ${place.name}: ${errorMessage}`)
      }

      // Add small delay between requests (except for the last one)
      if (i < placesToProcess.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    const totalProcessed = totalSuccess + totalErrors

    console.log(`\n✅ Batch Wikipedia analysis complete!`)
    console.log(`📊 Processed: ${totalProcessed}`)
    console.log(`✅ Success: ${totalSuccess}`)
    console.log(`❌ Errors: ${totalErrors}`)

    res.status(200).json({
      totalProcessed,
      totalSuccess,
      totalErrors,
    })
  } catch (error) {
    console.error('❌ Error in batchAnalyzePlaceWikipedias:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: `Internal server error: ${errorMessage}` })
  }
}
