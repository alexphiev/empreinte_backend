# Bilan Carbone PDF Service

## Development

Copy env.dist to .env and fill the values and replace the API_SECRET_KEY with a generated value.

```bash
openssl rand -hex 32
```

Then copy the generated value to the .env file.

```bash
cp .env.dist .env
```

Install dependencies:

```bash
pnpm install
```

### Run locally in development mode

```bash
pnpm dev
```

## Data Fetching Scripts

The application includes several scripts to fetch place data from different sources:

### Fetch French Regional Natural Parks

Downloads and imports French regional natural parks from data.gouv.fr:

```bash
pnpm fetch-french-parks
```

This script:
- Downloads park data from the official French government data API
- Caches data locally as `datagouv_regional_parks_france.json` for faster re-runs
- Extracts park names, locations, websites, and Wikipedia references
- Imports data into the `places` table with type `regional_park`
- Handles geometric data and calculates center points
- Uses quality score of 8 for government data

### Other Fetching Scripts

```bash
# Fetch places from OpenStreetMap
pnpm fetch-osm-places

# Fetch places from Overture Maps
pnpm fetch-overture-places

# Remove places by source (cleaning method)
pnpm remove-places OSM
pnpm remove-places OVERTURE
pnpm remove-places DATA.GOUV

# Clear caches
pnpm clear-osm-cache
pnpm clear-overture-cache
```

## Data Enhancement System

The application includes a comprehensive system for enhancing place data with information from multiple sources:

### Enhancement Commands

```bash
# Check how many places need enhancement
pnpm enhance-places list

# Enhance a specific place by ID
pnpm enhance-places single <place-id>

# Enhance all places that need enhancement
pnpm enhance-places all

# Enhance only the first N places (useful for testing)
pnpm enhance-places all 10

# Force re-enhancement of places (override existing enhancements)
pnpm enhance-places all force
pnpm enhance-places <place-id> force

# Recalculate enhancement and total scores for all places
pnpm recalculate-scores
```

### Required Environment Variables for Enhancement

Add these to your `.env` file:

```bash
# Google AI API key for content summarization
GEMINI_API_KEY=your_gemini_api_key

# Reddit API credentials
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret
```

### What the Enhancement System Does

The system enriches place records with:

- **Website Information**: Scrapes and summarizes content from place websites
- **Reddit Discussions**: Finds and summarizes relevant Reddit discussions about places
- **Wikipedia Content**: Extracts and summarizes Wikipedia articles about places

Quality scores are increased for successful enhancements:
- Website info: +2 points
- Reddit info: +2 points (only for relevant discussions)
- Wikipedia info: +4 points

All content is filtered through AI to ensure only relevant information is added.

### Score Recalculation

The `recalculate-scores` script allows you to fix score inconsistencies without re-enhancing data:

```bash
pnpm recalculate-scores
```

This script:
- Iterates through all places in the database
- Recalculates enhancement scores based on existing enhanced fields
- Updates `enhancement_score` and total `score` fields
- Ensures scores accurately reflect current enhancement state
- Useful after database migrations or enhancement logic changes
