-- Migration: Create places_to_refine table for storing unverified places
-- Issue: #66 - Method to suggest sources from URLs and extract places info

CREATE TABLE IF NOT EXISTS places_to_refine (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    source_url TEXT NOT NULL,
    extracted_data JSONB,
    mentioned_in_place_id UUID REFERENCES places(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected', 'merged')),
    matched_place_id UUID REFERENCES places(id) ON DELETE SET NULL,
    confidence_score DECIMAL(3, 2),
    location_hint TEXT,
    place_type TEXT,
    country TEXT,
    region TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_places_to_refine_status ON places_to_refine(status);
CREATE INDEX IF NOT EXISTS idx_places_to_refine_name ON places_to_refine(name);
CREATE INDEX IF NOT EXISTS idx_places_to_refine_mentioned_in ON places_to_refine(mentioned_in_place_id);
CREATE INDEX IF NOT EXISTS idx_places_to_refine_created_at ON places_to_refine(created_at DESC);

COMMENT ON TABLE places_to_refine IS 'Stores unverified places extracted from URLs for later review and refinement';
COMMENT ON COLUMN places_to_refine.name IS 'Name of the potential place';
COMMENT ON COLUMN places_to_refine.source_url IS 'URL where this place was mentioned';
COMMENT ON COLUMN places_to_refine.extracted_data IS 'Raw data extracted from the source';
COMMENT ON COLUMN places_to_refine.mentioned_in_place_id IS 'ID of the place where this was mentioned';
COMMENT ON COLUMN places_to_refine.status IS 'Processing status: pending, verified, rejected, or merged';
COMMENT ON COLUMN places_to_refine.matched_place_id IS 'ID of the existing place if matched';
COMMENT ON COLUMN places_to_refine.confidence_score IS 'Confidence score for the match (0-1)';
