# OSM Nature Places Fetcher - Overpass API Integration

## Setup

1. **Configure environment:**
   - Add your Supabase credentials to `.env`

## Usage

**Fetch nature places for Gard department (default):**

```bash
pnpm run fetch-osm-places
```

**Fetch for specific department:**

```bash
pnpm run fetch-osm-places 30  # Gard
pnpm run fetch-osm-places 06  # Alpes-Maritimes
```

## Features

- **Rate limiting**: Respects Overpass API limits (1.5s delays, exponential backoff)
- **Duplicate detection**: Checks existing source_id before insertion
- **Explicit logging**: Clear progress reports with emojis and detailed status
- **Error handling**: Graceful handling of API timeouts and errors
- **Server fallback**: Automatically switches between Overpass servers
- **Smart caching**: Saves API responses locally to avoid re-downloading

## Data Collected

The script fetches these nature feature types:

- **Parks**: Parks, nature reserves
- **Natural features**: Forests, beaches, water bodies, peaks, caves, glaciers, wetlands
- **Protected areas**: National parks, protected areas
- **Waterways**: Rivers, streams

## Monitoring

Progress is logged to console with explicit emojis and status messages:

- 🌿 Department processing status
- ✅ Successfully inserted places
- ⚠️ Duplicate places skipped
- ❌ Errors with detailed messages
- 📊 Progress reports every 25 items
- 🌐 API request tracking

## Caching System

The script automatically caches API responses to avoid re-querying:

- **Cached files**: `temp/overpass/overpass_dept_30.json`
- **Reuse logic**: If file exists, skip API call and process cached data
- **Clear cache**: `pnpm run clear-osm-cache`

## Rate Limits

- Target: <10,000 API requests per day
- Delay: 1.5 seconds between requests
- Retry logic: Exponential backoff for 429 errors
- Server switching: Falls back to alternative servers on timeouts
