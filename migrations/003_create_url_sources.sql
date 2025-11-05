-- Migration: Create url_sources table for tracking submitted URLs
-- Issue: #66 - Method to suggest sources from URLs and extract places info

CREATE TABLE IF NOT EXISTS url_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL UNIQUE,
    submitted_by TEXT,
    source_type TEXT CHECK (source_type IN ('user_submitted', 'auto_discovered', 'api')),
    processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
    places_found INTEGER DEFAULT 0,
    pages_scraped INTEGER DEFAULT 0,
    analysis_result JSONB,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_url_sources_status ON url_sources(processing_status);
CREATE INDEX IF NOT EXISTS idx_url_sources_created_at ON url_sources(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_url_sources_url ON url_sources(url);

COMMENT ON TABLE url_sources IS 'Tracks URLs submitted for analysis and their processing status';
COMMENT ON COLUMN url_sources.url IS 'The URL submitted for analysis';
COMMENT ON COLUMN url_sources.source_type IS 'How the URL was submitted: user_submitted, auto_discovered, or api';
COMMENT ON COLUMN url_sources.processing_status IS 'Current processing status';
COMMENT ON COLUMN url_sources.places_found IS 'Number of places found from this URL';
COMMENT ON COLUMN url_sources.analysis_result IS 'JSON result of the analysis';
