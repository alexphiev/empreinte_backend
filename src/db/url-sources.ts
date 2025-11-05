import { PostgrestSingleResponse } from '@supabase/supabase-js'
import { supabase } from '../services/supabase.service'
import type { UrlSource, UrlSourceInsert } from '../types/new-tables'

/**
 * Create a new URL source record
 */
export async function createUrlSource(data: UrlSourceInsert): Promise<PostgrestSingleResponse<UrlSource>> {
  return supabase
    .from('url_sources' as any)
    .insert({
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()
}

/**
 * Get URL source by URL
 */
export async function getUrlSourceByUrl(url: string): Promise<PostgrestSingleResponse<UrlSource>> {
  return supabase.from('url_sources' as any).select('*').eq('url', url).single() as any
}

/**
 * Update URL source processing status
 */
export async function updateUrlSourceStatus(
  id: string,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  updates?: Partial<UrlSource>,
): Promise<PostgrestSingleResponse<UrlSource>> {
  const data: Partial<UrlSource> = {
    processing_status: status,
    updated_at: new Date().toISOString(),
    ...updates,
  }

  if (status === 'completed' || status === 'failed') {
    data.processed_at = new Date().toISOString()
  }

  return supabase.from('url_sources' as any).update(data).eq('id', id).select().single() as any
}

/**
 * Get URL sources by status
 */
export async function getUrlSourcesByStatus(
  status: 'pending' | 'processing' | 'completed' | 'failed',
): Promise<{ data: UrlSource[] | null; error: unknown }> {
  return supabase.from('url_sources' as any).select('*').eq('processing_status', status).order('created_at', { ascending: false }) as any
}

/**
 * Check if URL has already been submitted
 */
export async function isUrlAlreadySubmitted(url: string): Promise<boolean> {
  const { data, error } = await supabase.from('url_sources' as any).select('id').eq('url', url).maybeSingle()

  if (error) {
    console.error('Error checking if URL is submitted:', error)
    return false
  }

  return data !== null
}
