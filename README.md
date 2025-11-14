# Empreinte Nature Places Backend

Backend service for managing and analyzing nature places, including data fetching and AI-powered content extraction.

## Development

### Setup

1. Copy environment template and fill in values:

```bash
cp .env.dist .env
```

2. Generate API secret key:

```bash
openssl rand -hex 32
```

Copy the generated value to `.env` as `API_SECRET_KEY`.

3. Install dependencies:

```bash
pnpm install
```

### Run locally in development mode

```bash
pnpm dev
```

The server will start on `http://localhost:8080` (or the port specified in `PORT` environment variable).

### API Documentation (Swagger)

Once the server is running, access interactive API documentation at:

```bash
http://localhost:8080/api-docs
```

See [API Documentation](#api-documentation) section below for details on using Swagger.

## Scripts Overview

This project includes scripts for data fetching, analysis, and maintenance. All scripts can be run using `pnpm run <script-name>`.

## Data Fetching Scripts

Scripts to fetch place data from various sources:

### OpenStreetMap (OSM)

Fetch places from OpenStreetMap for a specific French department:

```bash
pnpm fetch-osm-places <department-code> [--limit=<number>]
```

**Examples**:

```bash
pnpm fetch-osm-places 30 --limit=100
pnpm fetch-osm-places 75
```

**Parameters**:

- `department-code`: French department code (e.g., 30, 75, 13)
- `--limit`: Optional limit on number of places to fetch

### Overture Maps

Fetch places from Overture Maps:

```bash
pnpm fetch-overture-places
```

### French Regional Parks

Download and import French regional parks from data.gouv.fr:

```bash
pnpm fetch-french-regional-parks [--force] [--limit=<number>]
```

**Examples**:

```bash
pnpm fetch-french-regional-parks --force --limit=100
pnpm fetch-french-regional-parks
```

### French National Parks

Download and import French national parks from data.gouv.fr:

```bash
pnpm fetch-french-national-parks [--force] [--limit=<number>]
```

**Examples**:

```bash
pnpm fetch-french-national-parks --force --limit=100
```

### Remove Places by Source

Remove places from the database by their source (useful for cleaning):

```bash
pnpm remove-places <source>
```

**Examples**:

```bash
pnpm remove-places OSM
pnpm remove-places OVERTURE
pnpm remove-places DATA.GOUV
```

**Available sources**: `OSM`, `OVERTURE`, `DATA.GOUV`

### Clear Caches

Clear cached data for data sources:

```bash
# Clear OSM cache
pnpm clear-osm-cache

# Clear Overture cache
pnpm clear-overture-cache
```

## Place Analysis Scripts

Scripts to analyze individual places and extract information using AI:

### Analyze Place Website

Analyze a place's website by scraping multiple pages and extracting information:

```bash
pnpm analyze-place-website <place-id>
```

**What it does**:

1. Fetches the place from the database
2. Scrapes the website (uses sitemap if available, filters to 10 most relevant pages)
3. Uses two parallel LLM calls to:
   - Summarize content focusing on nature features
   - Extract mentioned nature places
4. Saves results to `website_generated` and `website_places_generated` fields

**Example**:

```bash
pnpm analyze-place-website 123e4567-e89b-12d3-a456-426614174000
```

**Requirements**: Place must have a `website` field populated.

### Analyze Place Wikipedia

Analyze a place's Wikipedia page and extract information:

```bash
pnpm analyze-place-wikipedia <place-id>
```

**What it does**:

1. Fetches the place from the database
2. Tries to find Wikipedia article (checks metadata first, then searches by name)
3. Uses two parallel LLM calls to:
   - Summarize Wikipedia content focusing on nature features
   - Extract mentioned nature places
4. Saves results to `wikipedia_generated` and `wikipedia_places_generated` fields

**Example**:

```bash
pnpm analyze-place-wikipedia 123e4567-e89b-12d3-a456-426614174000
```

**Note**: Works best if the place has a Wikipedia reference in metadata (format: `"en:Article Name"` or `"fr:Article Name"`), but will also search by place name if not found.

### Analyze URLs

Analyze one or more URLs (travel guides, blog posts, articles) to extract nature places:

```bash
pnpm analyze-urls <url1> [url2] [url3] ...
```

**What it does**:

1. Scrapes each URL and extracts text content
2. Uses AI to extract specific, named nature places (filters out generic terms)
3. Stores sources in the `sources` table (unique by URL)
4. Stores extracted places in the `generated_places` table (unique by source_id + name)
5. Caches raw content for future use (can bypass with `bypassCache` option in API)

**Example**:

```bash
pnpm analyze-urls "https://example.com/travel-guide"
pnpm analyze-urls "https://example.com/guide1" "https://example.com/guide2"
```

**Note**: The AI is configured to only extract specific, named places that can be found on maps (excludes generic terms like "forest", "mountain", or administrative regions like "Auvergne").

### Verify Generated Places

Verify generated places by searching OSM and creating/updating real places with bumped scores:

```bash
pnpm verify-places <sourceId> [scoreBump]
pnpm verify-places <generatedPlaceId> [scoreBump]
```

**What it does**:

1. Fetches generated places (either all from a source, or a single place)
2. Searches OSM (OpenStreetMap) for each place by name
3. Matches places using name similarity scoring
4. Creates new places in the database if not found (with bumped score)
5. Updates existing places by increasing their `source_score` (default +2 points)

**Examples**:

```bash
# Verify all places from a source
pnpm verify-places 123e4567-e89b-12d3-a456-426614174000

# Verify all places with custom score bump
pnpm verify-places 123e4567-e89b-12d3-a456-426614174000 3

# Verify a single generated place
pnpm verify-places abc123-def456-789
```

**Parameters**:

- `sourceId`: UUID of the source to verify all generated places from
- `generatedPlaceId`: UUID of a single generated place to verify
- `scoreBump`: Score increase for verified places (default: 2)

### Fetch Photos for Places

Fetch photos for places that don't have any yet. Tries Wikimedia Commons first (free), then falls back to Google Places API:

```bash
pnpm fetch-photos [--minScore=<number>] [--limit=<number>]
```

**What it does**:

1. Finds places without photos (`photos_fetched_at` is null)
2. Optionally filters by minimum score
3. Tries Wikimedia Commons API first (free, uses place name + coordinates + OSM ID)
4. Falls back to Google Places API if no Wikimedia photos found
5. Saves up to 5 photos per place, marks first as primary
6. Sets `photos_fetched_at` timestamp to prevent refetching

**Examples**:

```bash
# Fetch photos for all places without photos
pnpm fetch-photos

# Fetch photos only for places with score >= 5
pnpm fetch-photos --minScore 5

# Fetch photos for first 50 places with score >= 5
pnpm fetch-photos --minScore 5 --limit 50

# Fetch photos for first 10 places (any score)
pnpm fetch-photos --limit 10
```

**Parameters**:

- `--minScore`: Optional. Only fetch photos for places with score >= minScore
- `--limit`: Optional. Maximum number of places to process

### Fetch Ratings for Places

Fetch ratings from Google Places API for places that need them:

```bash
pnpm fetch-ratings [--minScore=<number>] [--limit=<number>]
```

**What it does**:

1. Finds places that haven't had ratings fetched yet, or were fetched more than 6 months ago
2. Optionally filters by minimum score
3. Uses existing Google Places ID if available, otherwise searches for it by name/coordinates
4. Fetches rating and review count from Google Places API
5. Stores Google Places ID for future use
6. Sets `google_rating_fetched_at` timestamp to prevent refetching
7. Adds +2 score bump when ratings are first collected (not on refresh)

**Examples**:

```bash
# Fetch ratings for all places that need them
pnpm fetch-ratings

# Fetch ratings only for places with score >= 5
pnpm fetch-ratings --minScore 5

# Fetch ratings for first 50 places with score >= 5
pnpm fetch-ratings --minScore 5 --limit 50

# Fetch ratings for first 10 places (any score)
pnpm fetch-ratings --limit 10
```

**Parameters**:

- `--minScore`: Optional. Only fetch ratings for places with score >= minScore
- `--limit`: Optional. Maximum number of places to process

**Note**: Ratings are refreshed every 6 months. Places with ratings fetched less than 6 months ago will be skipped.

## Score Recalculation

Recalculate enhancement and total scores for all places:

```bash
# Recalculate all places
pnpm recalculate-scores

# Only recalculate places updated before a specific date
pnpm recalculate-scores DD/MM/YYYY
```

**Examples**:

```bash
# Recalculate all places
pnpm recalculate-scores

# Only recalculate places last updated before January 1, 2025
pnpm recalculate-scores 01/01/2025
```

**Use cases**:

- Fix score inconsistencies after database migrations
- Update scores after scoring logic changes
- Verify score accuracy
- Selectively recalculate only outdated scores

**What it does**:

- Iterates through all places in batches of 1000 (handles large databases)
- Optionally filters by `last_score_updated_at` date
- Recalculates scores based on current enhancement data:
  - Source score (base + park type + verification status)
  - Enhancement score (website + Reddit + Wikipedia + photos + Google ratings)
- Updates `score`, `source_score`, `enhancement_score`, and `last_score_updated_at` fields
- Shows progress and summary statistics

**Parameters**:

- `DD/MM/YYYY`: Optional date filter. Only recalculates places with `last_score_updated_at` before this date

## Maintenance Scripts

### Migrate Place Types

Migrate place types in the database:

```bash
pnpm migrate-place-types
```

### Generate Database Types

Generate TypeScript types from Supabase schema:

```bash
pnpm generate-types
```

**Note**: This requires Supabase CLI and project access.

## API Documentation

The API provides endpoints for analyzing places. Full interactive documentation is available via Swagger UI.

### Accessing Swagger

1. Start the development server:

   ```bash
   pnpm dev
   ```

2. Open Swagger UI in your browser:

   ```bash
   http://localhost:8080/api-docs
   ```

### Using Swagger

1. **Authenticate**: Click "Authorize" button, enter your API key (`X-API-Key`), and click "Authorize"
2. **Test Endpoints**: Expand an endpoint, click "Try it out", enter parameters, and click "Execute"
3. **View Responses**: Check status codes, response bodies, and rate limit headers

### Available API Endpoints

- **POST `/api/places/{placeId}/analyze`**: Analyze a place's website
- **POST `/api/places/{placeId}/analyze-wikipedia`**: Analyze a place's Wikipedia page
- **POST `/api/urls/analyze`**: Analyze URLs and extract nature places
- **POST `/api/places/verify`**: Verify generated places and create/update real places in OSM
- **POST `/api/places/fetch-photos`**: Fetch photos for places that don't have any yet
- **POST `/api/places/fetch-ratings`**: Fetch ratings from Google Places API for places that need them
- **POST `/test`**: Test endpoint to verify API key authentication

**Rate Limits**:

- General API: 100 requests per 15 minutes
- Analysis endpoints: 50 requests per hour per IP

For detailed API documentation, see [PLACE_ANALYSIS_API.md](./PLACE_ANALYSIS_API.md).

## Environment Variables

### Required

```bash
# API authentication
API_SECRET_KEY=your_generated_api_key

# Database
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# AI (for enhancement and analysis)
GEMINI_API_KEY=your_gemini_api_key
```

### Optional

```bash
# Server configuration
PORT=8080  # Default: 8080
ALLOWED_ORIGINS=http://localhost:3000  # Comma-separated list

# Reddit API (for enhancement)
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret

# Google Places API (for photos and ratings)
GOOGLE_PLACES_API_KEY=your_google_places_api_key
```

## Scripts Summary

| Script                        | Purpose                          | Usage                                                    |
| ----------------------------- | -------------------------------- | -------------------------------------------------------- |
| `fetch-osm-places`            | Fetch places from OpenStreetMap  | `pnpm fetch-osm-places <dept> [--limit=N]`               |
| `fetch-overture-places`       | Fetch places from Overture Maps  | `pnpm fetch-overture-places`                             |
| `fetch-french-regional-parks` | Import French regional parks     | `pnpm fetch-french-regional-parks [--force] [--limit=N]` |
| `fetch-french-national-parks` | Import French national parks     | `pnpm fetch-french-national-parks [--force] [--limit=N]` |
| `remove-places`               | Remove places by source          | `pnpm remove-places <source>`                            |
| `analyze-place-website`       | Analyze a place's website        | `pnpm analyze-place-website <place-id>`                  |
| `analyze-place-wikipedia`     | Analyze a place's Wikipedia      | `pnpm analyze-place-wikipedia <place-id>`                |
| `analyze-urls`                | Analyze URLs and extract places  | `pnpm analyze-urls <url1> [url2] ...`                    |
| `verify-places`               | Verify generated places in OSM   | `pnpm verify-places <sourceId> [scoreBump]`              |
| `fetch-photos`                | Fetch photos for places          | `pnpm fetch-photos [--minScore=N] [--limit=N]`           |
| `fetch-ratings`               | Fetch ratings from Google Places | `pnpm fetch-ratings [--minScore=N] [--limit=N]`          |
| `recalculate-scores`          | Recalculate place scores         | `pnpm recalculate-scores DD/MM/YYYY`                     |
| `migrate-place-types`         | Migrate place types              | `pnpm migrate-place-types`                               |
| `generate-types`              | Generate DB types                | `pnpm generate-types`                                    |
| `clear-osm-cache`             | Clear OSM cache                  | `pnpm clear-osm-cache`                                   |
| `clear-overture-cache`        | Clear Overture cache             | `pnpm clear-overture-cache`                              |
