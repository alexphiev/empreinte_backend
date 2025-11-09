import { PostgrestSingleResponse } from '@supabase/supabase-js'
import { supabase } from '../services/supabase.service'
import { Tables } from '../types/database'
import { PlacePhoto } from './place-photos'

export type Place = Tables<'places'>

export interface PlaceWithPhotos extends Place {
  place_photos?: PlacePhoto[]
}

export async function getPlaceById(id: string): Promise<PostgrestSingleResponse<Place>> {
  return supabase.from('places').select('*').eq('id', id).single()
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
