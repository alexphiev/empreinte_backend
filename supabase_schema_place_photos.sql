-- Add photos_fetched_at column to places table
ALTER TABLE places ADD COLUMN IF NOT EXISTS photos_fetched_at TIMESTAMPTZ;

-- Create place_photos table
CREATE TABLE IF NOT EXISTS place_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('wikimedia', 'google_places')),
  url TEXT NOT NULL,
  attribution TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_place_photos_place_id ON place_photos(place_id);
CREATE INDEX IF NOT EXISTS idx_place_photos_is_primary ON place_photos(place_id, is_primary) WHERE is_primary = TRUE;
CREATE INDEX IF NOT EXISTS idx_place_photos_source ON place_photos(source);

-- Create unique constraint to prevent duplicate photos (same place + url)
CREATE UNIQUE INDEX IF NOT EXISTS idx_place_photos_unique ON place_photos(place_id, url);

-- Add a trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_place_photos_updated_at ON place_photos;
CREATE TRIGGER update_place_photos_updated_at BEFORE UPDATE ON place_photos
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

