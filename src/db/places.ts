import { PostgrestResponse, PostgrestSingleResponse } from '@supabase/supabase-js'
import { supabase } from '../services/supabase.service'
import { Tables, TablesInsert } from '../types/database'
import { PlacePhoto } from './place-photos'

export type Place = Tables<'places'>

export interface PlaceWithPhotos extends Place {
  place_photos?: PlacePhoto[]
}

export async function getPlaceById(id: string): Promise<PostgrestSingleResponse<Place>> {
  return supabase.from('places').select('*').eq('id', id).single()
}

export async function getPlaces(): Promise<PostgrestResponse<Place>> {
  return supabase.from('places').select('*')
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
    enhancement_score: enhancementScore,
    source_score: sourceScore,
    score: totalScore,
  }

  // Include source_score if provided
  if (sourceScore !== undefined) {
    updates.source_score = sourceScore
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
