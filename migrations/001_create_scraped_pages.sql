-- Migration: Create scraped_pages table for storing scraped website content
-- Issue: #65 - Automated Website Content Extraction

CREATE TABLE IF NOT EXISTS scraped_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    website_url TEXT NOT NULL,
    page_url TEXT NOT NULL,
    extracted_text TEXT,
    extraction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    place_id UUID REFERENCES places(id) ON DELETE CASCADE,
    page_title TEXT,
    word_count INTEGER,
    status TEXT DEFAULT 'extracted' CHECK (status IN ('extracted', 'processed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scraped_pages_website_url ON scraped_pages(website_url);
CREATE INDEX IF NOT EXISTS idx_scraped_pages_place_id ON scraped_pages(place_id);
CREATE INDEX IF NOT EXISTS idx_scraped_pages_extraction_date ON scraped_pages(extraction_date DESC);
CREATE INDEX IF NOT EXISTS idx_scraped_pages_status ON scraped_pages(status);

-- Unique constraint to prevent duplicate scrapes of the same page
CREATE UNIQUE INDEX IF NOT EXISTS idx_scraped_pages_unique_page ON scraped_pages(page_url, place_id);

COMMENT ON TABLE scraped_pages IS 'Stores extracted text content from scraped website pages';
COMMENT ON COLUMN scraped_pages.website_url IS 'Base URL of the website';
COMMENT ON COLUMN scraped_pages.page_url IS 'Full URL of the scraped page';
COMMENT ON COLUMN scraped_pages.extracted_text IS 'Clean text extracted from the page';
COMMENT ON COLUMN scraped_pages.place_id IS 'Reference to the place this page belongs to';
COMMENT ON COLUMN scraped_pages.status IS 'Processing status: extracted, processed, or failed';
