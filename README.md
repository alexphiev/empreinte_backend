# Empreinte Nature Places Backend

Backend service for managing and analyzing nature places, including data fetching, enhancement, and AI-powered content extraction.

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

This project includes scripts for data fetching, enhancement, analysis, and maintenance. All scripts can be run using `pnpm run <script-name>`.

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

## Data Enhancement System

The application includes a comprehensive system for enhancing place data with information from multiple sources:

### Enhancement Commands

```bash
# Check how many places need enhancement
pnpm enhance-places list

# Enhance a specific place by ID
pnpm enhance-places <place-id>

# Enhance all places that need enhancement
pnpm enhance-places all

# Enhance only the first N places (useful for testing)
pnpm enhance-places all 10

# Force re-enhancement of places (override existing enhancements)
pnpm enhance-places all force
pnpm enhance-places <place-id> force
```

### What the Enhancement System Does

The system enriches place records with:

- **Website Information**: Scrapes and summarizes content from place websites (+2 points)
- **Reddit Discussions**: Finds and summarizes relevant Reddit discussions about places (+2 points)
- **Wikipedia Content**: Extracts and summarizes Wikipedia articles about places (+4 points)

All content is filtered through AI to ensure only relevant information is added.

### Score Recalculation

Recalculate enhancement and total scores for all places without re-enhancing data:

```bash
pnpm recalculate-scores
```

**Use cases**:

- Fix score inconsistencies after database migrations
- Update scores after enhancement logic changes
- Verify score accuracy

**What it does**:

- Iterates through all places in the database
- Recalculates enhancement scores based on existing enhanced fields
- Updates `enhancement_score` and total `score` fields
- Ensures scores accurately reflect current enhancement state

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
```

## Scripts Summary

| Script                        | Purpose                         | Usage                                                    |
| ----------------------------- | ------------------------------- | -------------------------------------------------------- |
| `fetch-osm-places`            | Fetch places from OpenStreetMap | `pnpm fetch-osm-places <dept> [--limit=N]`               |
| `fetch-overture-places`       | Fetch places from Overture Maps | `pnpm fetch-overture-places`                             |
| `fetch-french-regional-parks` | Import French regional parks    | `pnpm fetch-french-regional-parks [--force] [--limit=N]` |
| `fetch-french-national-parks` | Import French national parks    | `pnpm fetch-french-national-parks [--force] [--limit=N]` |
| `remove-places`               | Remove places by source         | `pnpm remove-places <source>`                            |
| `enhance-places`              | Enhance place data with AI      | `pnpm enhance-places [list\|all\|<id>] [force]`          |
| `analyze-place-website`       | Analyze a place's website       | `pnpm analyze-place-website <place-id>`                  |
| `analyze-place-wikipedia`     | Analyze a place's Wikipedia     | `pnpm analyze-place-wikipedia <place-id>`                |
| `recalculate-scores`          | Recalculate place scores        | `pnpm recalculate-scores`                                |
| `migrate-place-types`         | Migrate place types             | `pnpm migrate-place-types`                               |
| `generate-types`              | Generate DB types               | `pnpm generate-types`                                    |
| `clear-osm-cache`             | Clear OSM cache                 | `pnpm clear-osm-cache`                                   |
| `clear-overture-cache`        | Clear Overture cache            | `pnpm clear-overture-cache`                              |
