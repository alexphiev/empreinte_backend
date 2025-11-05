// Type definitions for new database tables
// These should eventually be added to database.ts via Supabase type generation

export interface ScrapedPage {
  id: string
  website_url: string
  page_url: string
  extracted_text: string | null
  extraction_date: string
  place_id: string | null
  page_title: string | null
  word_count: number | null
  status: 'extracted' | 'processed' | 'failed'
  created_at: string
  updated_at: string
}

export interface PlaceToRefine {
  id: string
  name: string
  description: string | null
  source_url: string
  extracted_data: Record<string, unknown> | null
  mentioned_in_place_id: string | null
  status: 'pending' | 'verified' | 'rejected' | 'merged'
  matched_place_id: string | null
  confidence_score: number | null
  location_hint: string | null
  place_type: string | null
  country: string | null
  region: string | null
  created_at: string
  updated_at: string
  processed_at: string | null
}

export interface UrlSource {
  id: string
  url: string
  submitted_by: string | null
  source_type: 'user_submitted' | 'auto_discovered' | 'api'
  processing_status: 'pending' | 'processing' | 'completed' | 'failed'
  places_found: number
  pages_scraped: number
  analysis_result: Record<string, unknown> | null
  error_message: string | null
  created_at: string
  updated_at: string
  processed_at: string | null
}

// Insert types (for creating new records)
export type ScrapedPageInsert = Omit<ScrapedPage, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
  updated_at?: string
}

export type PlaceToRefineInsert = Omit<PlaceToRefine, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
  updated_at?: string
}

export type UrlSourceInsert = Omit<UrlSource, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
  updated_at?: string
}
