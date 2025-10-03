import { supabase } from '../services/supabase.service'

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
