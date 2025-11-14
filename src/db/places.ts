import { PostgrestResponse, PostgrestSingleResponse } from '@supabase/supabase-js'
import { supabase } from '../services/supabase.service'
import { Tables, TablesInsert } from '../types/database'
import { PlacePhoto } from './place-photos'

export type Place = Tables<'places'>
export type PlaceWithScoreData = Place & {
  generated_places?: { id: string }[]
  wikipedia?: { score: number }
  place_photos?: { id: string }[]
}

export interface PlaceWithPhotos extends Place {
  place_photos?: PlacePhoto[]
}

export async function getPlaceById(id: string): Promise<PostgrestSingleResponse<Place>> {
  return supabase.from('places').select('*').eq('id', id).single()
}

export async function getPlacesForScoreCalculation(
  limit?: number,
  offset?: number,
  maxLastScoreUpdatedAt?: Date,
): Promise<PostgrestResponse<PlaceWithScoreData>> {
  let query = supabase
    .from('places')
    .select(
      '*, generated_places!generated_places_place_id_fkey(id), wikipedia!wikipedia_place_id_fkey(score), place_photos!place_photos_place_id_fkey(id)',
    )

  if (maxLastScoreUpdatedAt) {
    query = query.or(`last_score_updated_at.is.null,last_score_updated_at.lt.${maxLastScoreUpdatedAt.toISOString()}`)
  }

  if (limit !== undefined) {
    query = query.limit(limit)
  }

  if (offset !== undefined) {
    query = query.range(offset, offset + (limit || 1000) - 1)
  }

  return query as any
}

export async function getPlacesCount(maxLastScoreUpdatedAt?: Date): Promise<{ count: number | null; error: any }> {
  let query = supabase.from('places').select('id', { count: 'estimated', head: true })

  if (maxLastScoreUpdatedAt) {
    query = query.or(`last_score_updated_at.is.null,last_score_updated_at.lt.${maxLastScoreUpdatedAt.toISOString()}`)
  }

  const { count, error } = await query

  return { count, error }
}

/**
 * Get a place by ID with photos included (using nested select for efficiency)
 */
export async function getPlaceByIdWithPhotos(id: string): Promise<PostgrestSingleResponse<PlaceWithPhotos>> {
  return supabase.from('places').select('*, place_photos(*)').eq('id', id).single()
}

export async function updatePlace(id: string, updates: Partial<Place>): Promise<PostgrestSingleResponse<Place>> {
  return supabase
    .from('places')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .single()
}

export async function getExistingPlaces(names: string[]): Promise<string[]> {
  if (names.length === 0) {
    return []
  }

  const { data, error } = await supabase.from('places').select('name').in('name', names)

  if (error) {
    console.error('❌ Error checking existing places:', error.message)
    return []
  }

  return data ? data.map((place) => place.name).filter((name): name is string => name !== null) : []
}

/**
 * Get places for Wikipedia analysis
 * @param bypassCache If true, returns all places regardless of analysis status
 * @param limit Optional limit on number of places to return
 * @returns Places ordered by score descending
 */
export async function getPlacesForWikipediaAnalysis(
  bypassCache: boolean = false,
  limit?: number,
): Promise<PostgrestResponse<{ id: string; name: string | null; wikipedia_analyzed_at: string | null }>> {
  let query = supabase.from('places').select('id, name, wikipedia_analyzed_at')

  if (!bypassCache) {
    // Only get places that haven't been analyzed yet
    query = query.is('wikipedia_analyzed_at', null)
  }

  // Order by score descending to prioritize higher-scored places
  query = query.order('score', { ascending: false })

  if (limit !== undefined) {
    query = query.limit(limit)
  }

  return query
}

export async function updatePlaceScores(
  placeId: string,
  enhancementScore: number,
  totalScore: number,
  sourceScore?: number,
): Promise<PostgrestSingleResponse<Place>> {
  const updates: any = {
    enhancement_score: Math.round(enhancementScore),
    source_score: sourceScore !== undefined ? Math.round(sourceScore) : undefined,
    score: Math.round(totalScore),
    last_score_updated_at: new Date().toISOString(),
  }

  // Include source_score if provided
  if (sourceScore !== undefined) {
    updates.source_score = Math.round(sourceScore)
  }

  return supabase.from('places').update(updates).eq('id', placeId).single()
}

/**
 * Updates place scores from a ScoreCalculation object
 */
export async function updatePlaceScoresFromCalculation(
  placeId: string,
  scores: { sourceScore: number; enhancementScore: number; totalScore: number },
): Promise<PostgrestSingleResponse<Place>> {
  return updatePlaceScores(placeId, scores.enhancementScore, scores.totalScore, scores.sourceScore)
}

/**
 * Batch update place scores for multiple places
 * Uses Supabase upsert for efficient bulk updates
 * Returns only error for maximum performance (no data returned from DB)
 */
export async function batchUpdatePlaceScores(
  updates: Array<{
    id: string
    sourceScore: number
    enhancementScore: number
    totalScore: number
  }>,
): Promise<{ error: any }> {
  const timestamp = new Date().toISOString()

  const data = updates.map((update) => ({
    id: update.id,
    source_score: Math.round(update.sourceScore),
    enhancement_score: Math.round(update.enhancementScore),
    score: Math.round(update.totalScore),
    last_score_updated_at: timestamp,
  }))

  const { error } = await supabase.from('places').upsert(data, { onConflict: 'id' })

  return { error }
}

/**
 * Get a place by OSM ID
 */
export async function getPlaceByOsmId(osmId: string): Promise<PostgrestSingleResponse<Place | null>> {
  return supabase.from('places').select('*').eq('osm_id', osmId).maybeSingle()
}

/**
 * Create a new place
 */
export async function createPlace(placeData: TablesInsert<'places'>): Promise<PostgrestSingleResponse<Place>> {
  return supabase.from('places').insert(placeData).select().single()
}
