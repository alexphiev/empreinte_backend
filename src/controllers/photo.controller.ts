import { Request, Response } from 'express'
import { supabase } from '../services/supabase.service'
import { photoFetcherService } from '../services/photo-fetcher.service'
import { Place } from '../db/places'

export interface FetchPhotosResponse {
  results: Array<{
    placeId: string
    placeName: string
    success: boolean
    photosFound: number
    source: 'wikimedia' | 'google_places' | 'none'
    error?: string
  }>
  totalProcessed: number
  totalSuccess: number
  totalPhotosFound: number
}

/**
 * Fetch photos for places that don't have any yet
 * Filters by minimum score if provided
 */
export async function fetchPhotos(
  req: Request,
  res: Response<FetchPhotosResponse | { error: string }>,
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

    console.log(`\n📸 Starting photo fetch process`)
    if (minScore !== undefined) {
      console.log(`📊 Minimum score filter: ${minScore}`)
    }
    if (limit !== undefined) {
      console.log(`🔢 Limit: ${limit} places`)
    }

    // Get places without photos
    let query = supabase
      .from('places')
      .select('*')
      .is('photos_fetched_at', null) // Places that haven't had photos fetched yet

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
        totalPhotosFound: 0,
      })
      return
    }

    console.log(`📋 Found ${placesToProcess.length} places to process`)

    const results: FetchPhotosResponse['results'] = []

    // Process places one by one with delay
    for (let i = 0; i < placesToProcess.length; i++) {
      const place = placesToProcess[i] as Place
      console.log(`\n📍 Processing place ${i + 1}/${placesToProcess.length}: ${place.name}`)

      const result = await photoFetcherService.fetchPhotosForPlace(place)
      results.push(result)

      // Add delay between requests (except for the last one)
      if (i < placesToProcess.length - 1) {
        await photoFetcherService.delay()
      }
    }

    const totalSuccess = results.filter((r) => r.success).length
    const totalPhotosFound = results.reduce((sum, r) => sum + r.photosFound, 0)

    console.log(`\n✅ Photo fetch complete!`)
    console.log(`📊 Processed: ${results.length}`)
    console.log(`✅ Success: ${totalSuccess}`)
    console.log(`📸 Total photos found: ${totalPhotosFound}`)

    res.status(200).json({
      results,
      totalProcessed: results.length,
      totalSuccess,
      totalPhotosFound,
    })
  } catch (error) {
    console.error('❌ Error in fetchPhotos:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: `Internal server error: ${errorMessage}` })
  }
}

