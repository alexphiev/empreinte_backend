import { PostgrestSingleResponse } from '@supabase/supabase-js'
import { supabase } from '../services/supabase.service'
import { Tables, TablesInsert, TablesUpdate } from '../types/database'

export type Wikipedia = Tables<'wikipedia'>
export type WikipediaInsert = TablesInsert<'wikipedia'>
export type WikipediaUpdate = TablesUpdate<'wikipedia'>

export async function getWikipediaByPlaceId(placeId: string): Promise<PostgrestSingleResponse<Wikipedia | null>> {
  return supabase.from('wikipedia').select('*').eq('place_id', placeId).maybeSingle()
}

export async function upsertWikipedia(data: WikipediaInsert): Promise<PostgrestSingleResponse<Wikipedia>> {
  return supabase
    .from('wikipedia')
    .upsert(
      {
        ...data,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'place_id',
      },
    )
    .select()
    .single()
}

export async function updateWikipediaScore(
  placeId: string,
  score: number,
): Promise<PostgrestSingleResponse<Wikipedia>> {
  return supabase
    .from('wikipedia')
    .update({ score, updated_at: new Date().toISOString() })
    .eq('place_id', placeId)
    .select()
    .single()
}
