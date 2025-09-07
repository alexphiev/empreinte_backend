# Overture Maps Nature Places Fetcher

## Setup

1. **Install Python dependencies:**

   ```bash
   ./install-overture.sh
   ```

   This will create a Python virtual environment (`venv_overture`) and install all required packages.

2. **Configure environment:**
   - Add your Supabase credentials to `.env`
   - Python 3.8+ required

3. **Virtual Environment:**
   - The script automatically handles virtual environment activation
   - Manual activation: `source venv_overture/bin/activate`

## Usage

**Fetch nature places for Gard department (default):**

```bash
pnpm run fetch-overture-places
```

**Fetch for specific department:**

```bash
pnpm run fetch-overture-places 30  # Gard
pnpm run fetch-overture-places 06  # Alpes-Maritimes
```

**Fetch ALL France (warning: very large dataset):**

```bash
pnpm run fetch-overture-places all
```

## Features

- **Python CLI integration** - Uses official Overture Maps Python CLI
- **High-quality data** - Curated, cleaned outdoor recreation data
- **Rich categories** - Detailed nature and outdoor activity classifications
- **No rate limits** - Download as much data as needed
- **GeoJSON processing** - Native geometry handling
- **Duplicate detection** - Checks existing `source_id` before insertion
- **Explicit logging** - Clear progress reports with confidence scores

## Data Collected

The script fetches these Overture Maps categories:

- **Parks**: National parks, state parks, memorial parks, dog parks
- **Outdoor Activities**: Beaches, hiking trails, mountain bike trails, waterfalls
- **Adventure Sports**: Rock climbing, skiing, boating, water sports
- **Nature Areas**: Recreation areas, outdoor spaces, wildlife areas

## Monitoring

Progress is logged with detailed status:

- 🏔️ Region processing status
- ✅ Successfully inserted places with confidence scores
- ⚠️ Duplicate places skipped
- ❌ Errors with detailed messages
- 📊 Progress reports every 20 items
- 🐍 Download completion status

## Data Quality

- **Confidence scores** - Each place has a quality confidence rating
- **Named places only** - Filters out unnamed locations
- **Geometry validation** - Proper GeoJSON formatting
- **Source tracking** - Uses `source_id` prefix `overture:`

## Caching System

The script automatically caches downloaded files to avoid re-downloading:

- **Cached files**: `temp/overture/overture_places_dept_30.geojson`
- **Reuse logic**: If file exists, skip download and process cached data
- **Clear cache**: `pnpm run clear-overture-cache`

## Advantages over OSM

- **Curated data** - Higher quality, more consistent
- **Better categorization** - More detailed outdoor recreation types
- **No API limits** - Bulk downloads without restrictions
- **Monthly updates** - Fresh, maintained dataset
- **Global coverage** - Consistent schema worldwide
- **Smart caching** - Reuses downloaded data for faster re-runs
