import { PostgrestSingleResponse } from '@supabase/supabase-js'
import { supabase } from '../services/supabase.service'
import type { ScrapedPage, ScrapedPageInsert } from '../types/new-tables'

/**
 * Create a new scraped page record
 */
export async function createScrapedPage(
  data: ScrapedPageInsert,
): Promise<PostgrestSingleResponse<ScrapedPage>> {
  return supabase
    .from('scraped_pages' as any)
    .insert({
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()
}

/**
 * Bulk insert scraped pages
 */
export async function createScrapedPages(
  pages: ScrapedPageInsert[],
): Promise<{ data: ScrapedPage[] | null; error: unknown }> {
  const now = new Date().toISOString()
  const pagesWithTimestamps = pages.map((page) => ({
    ...page,
    created_at: now,
    updated_at: now,
  }))

  return supabase.from('scraped_pages' as any).insert(pagesWithTimestamps).select() as any
}

/**
 * Get scraped pages for a specific place
 */
export async function getScrapedPagesByPlaceId(
  placeId: string,
): Promise<{ data: ScrapedPage[] | null; error: unknown }> {
  return supabase.from('scraped_pages' as any).select('*').eq('place_id', placeId).order('extraction_date', { ascending: false }) as any
}

/**
 * Get scraped pages by website URL
 */
export async function getScrapedPagesByWebsite(
  websiteUrl: string,
): Promise<{ data: ScrapedPage[] | null; error: unknown }> {
  return supabase
    .from('scraped_pages' as any)
    .select('*')
    .eq('website_url', websiteUrl)
    .order('extraction_date', { ascending: false }) as any
}

/**
 * Update scraped page status
 */
export async function updateScrapedPageStatus(
  id: string,
  status: 'extracted' | 'processed' | 'failed',
): Promise<PostgrestSingleResponse<ScrapedPage>> {
  return supabase
    .from('scraped_pages' as any)
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single() as any
}

/**
 * Check if a page has already been scraped
 */
export async function isPageAlreadyScraped(
  pageUrl: string,
  placeId: string | null,
): Promise<boolean> {
  const query = supabase.from('scraped_pages' as any).select('id').eq('page_url', pageUrl)

  if (placeId) {
    query.eq('place_id', placeId)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    console.error('Error checking if page is scraped:', error)
    return false
  }

  return data !== null
}
