import { PostgrestSingleResponse } from '@supabase/supabase-js'
import { supabase } from '../services/supabase.service'
import type { PlaceToRefine, PlaceToRefineInsert } from '../types/new-tables'

/**
 * Create a new place to refine record
 */
export async function createPlaceToRefine(
  data: PlaceToRefineInsert,
): Promise<PostgrestSingleResponse<PlaceToRefine>> {
  return supabase
    .from('places_to_refine' as any)
    .insert({
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()
}

/**
 * Bulk insert places to refine
 */
export async function createPlacesToRefine(
  places: PlaceToRefineInsert[],
): Promise<{ data: PlaceToRefine[] | null; error: unknown }> {
  const now = new Date().toISOString()
  const placesWithTimestamps = places.map((place) => ({
    ...place,
    created_at: now,
    updated_at: now,
  }))

  return supabase.from('places_to_refine' as any).insert(placesWithTimestamps).select() as any
}

/**
 * Get places to refine by status
 */
export async function getPlacesToRefineByStatus(
  status: 'pending' | 'verified' | 'rejected' | 'merged',
): Promise<{ data: PlaceToRefine[] | null; error: unknown }> {
  return supabase.from('places_to_refine' as any).select('*').eq('status', status).order('created_at', { ascending: false }) as any
}

/**
 * Update place to refine status
 */
export async function updatePlaceToRefineStatus(
  id: string,
  status: 'pending' | 'verified' | 'rejected' | 'merged',
  matchedPlaceId?: string,
): Promise<PostgrestSingleResponse<PlaceToRefine>> {
  const updates: Partial<PlaceToRefine> = {
    status,
    updated_at: new Date().toISOString(),
    processed_at: new Date().toISOString(),
  }

  if (matchedPlaceId) {
    updates.matched_place_id = matchedPlaceId
  }

  return supabase.from('places_to_refine' as any).update(updates).eq('id', id).select().single() as any
}

/**
 * Search for similar place names in places_to_refine
 */
export async function findSimilarPlaceToRefine(
  name: string,
): Promise<{ data: PlaceToRefine[] | null; error: unknown }> {
  return supabase.from('places_to_refine' as any).select('*').ilike('name', `%${name}%`).limit(10) as any
}

/**
 * Get places to refine mentioned in a specific place
 */
export async function getPlacesToRefineByMentionedIn(
  mentionedInPlaceId: string,
): Promise<{ data: PlaceToRefine[] | null; error: unknown }> {
  return supabase
    .from('places_to_refine' as any)
    .select('*')
    .eq('mentioned_in_place_id', mentionedInPlaceId)
    .order('created_at', { ascending: false }) as any
}
