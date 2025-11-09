import { Request, Response } from 'express'
import { supabase } from '../services/supabase.service'
import { ratingsFetcherService } from '../services/ratings-fetcher.service'
import { Place } from '../db/places'

export interface FetchRatingsResponse {
  results: Array<{
    placeId: string
    placeName: string
    success: boolean
    rating: number | null
    ratingCount: number | null
    googlePlacesId: string | null
    error?: string
  }>
  totalProcessed: number
  totalSuccess: number
}

/**
 * Fetch ratings for places that need them
 * Filters by minimum score if provided
 */
export async function fetchRatings(
  req: Request,
  res: Response<FetchRatingsResponse | { error: string }>,
): Promise<void> {
  try {
    const minScore = req.body.minScore ? Number(req.body.minScore) : undefined
    const limit = req.body.limit ? Number(req.body.limit) : undefined

    if (minScore !== undefined && (isNaN(minScore) || minScore < 0)) {
      res.status(400).json({ error: 'minScore must be a non-negative number' })
      return
    }

    if (limit !== undefined && (isNaN(limit) || limit < 1)) {
      res.status(400).json({ error: 'limit must be a positive number' })
      return
    }

    console.log(`\n⭐ Starting ratings fetch process`)
    if (minScore !== undefined) {
      console.log(`📊 Minimum score filter: ${minScore}`)
    }
    if (limit !== undefined) {
      console.log(`🔢 Limit: ${limit} places`)
    }

    // Get places that need ratings fetched
    // Either never fetched, or fetched more than 6 months ago
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    let query = supabase
      .from('places')
      .select('*')
      .or(
        `google_rating_fetched_at.is.null,google_rating_fetched_at.lt.${sixMonthsAgo.toISOString()}`,
      )

    if (minScore !== undefined) {
      query = query.gte('score', minScore)
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
      })
      return
    }

    console.log(`📋 Found ${placesToProcess.length} places to process`)

    const results: FetchRatingsResponse['results'] = []

    // Process places one by one with delay
    for (let i = 0; i < placesToProcess.length; i++) {
      const place = placesToProcess[i] as Place
      console.log(`\n📍 Processing place ${i + 1}/${placesToProcess.length}: ${place.name}`)

      const result = await ratingsFetcherService.fetchRatingsForPlace(place)
      results.push(result)

      // Add delay between requests (except for the last one)
      if (i < placesToProcess.length - 1) {
        await ratingsFetcherService.delay()
      }
    }

    const totalSuccess = results.filter((r) => r.success).length

    console.log(`\n✅ Ratings fetch complete!`)
    console.log(`📊 Processed: ${results.length}`)
    console.log(`✅ Success: ${totalSuccess}`)

    res.status(200).json({
      results,
      totalProcessed: results.length,
      totalSuccess,
    })
  } catch (error) {
    console.error('❌ Error in fetchRatings:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: `Internal server error: ${errorMessage}` })
  }
}

