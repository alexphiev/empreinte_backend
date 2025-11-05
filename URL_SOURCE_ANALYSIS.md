# URL Source Analysis API

Complete documentation for the URL source analysis feature that implements GitHub issues #65 and #66.

## Overview

This feature allows submitting URLs to automatically discover and extract nature places mentioned on websites. The system:
1. Scrapes the website using sitemap detection
2. Extracts all mentioned nature places using AI
3. Cross-references against existing database
4. Updates existing places or creates new entries in `places_to_refine` table

## GitHub Issues Implemented

### Issue #65: Automated Website Content Extraction
- ✅ Sitemap.xml detection and parsing
- ✅ Crawling all subpages from sitemap
- ✅ Text extraction from HTML pages
- ✅ Data persistence (scraped_pages table)
- ✅ Batch optimization for AI calls

### Issue #66: Method to Suggest Sources from URLs
- ✅ API endpoint to submit URLs
- ✅ Extract places and descriptions from URLs
- ✅ Cross-reference against existing database
- ✅ Update existing places (planned: score boosting)
- ✅ Store new places in `places_to_refine` table
- ✅ Swagger/OpenAPI documentation

## Database Schema

### New Tables

#### 1. `scraped_pages` Table
Stores extracted text content from scraped website pages.

```sql
CREATE TABLE scraped_pages (
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
```

#### 2. `places_to_refine` Table
Stores unverified places extracted from URLs for later review.

```sql
CREATE TABLE places_to_refine (
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
```

#### 3. `url_sources` Table
Tracks URLs submitted for analysis and their processing status.

```sql
CREATE TABLE url_sources (
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
```

## API Endpoint

### POST `/api/sources/analyze`

Submits a URL to extract and discover nature places.

**Authentication**: Required (API key via `X-API-Key` header)

**Rate Limit**: 10 requests per hour per IP

**Request Body**:
```json
{
  "url": "https://www.nationalparks.org/explore-parks",
  "submittedBy": "user@example.com" // optional
}
```

**Response** (200 OK):
```json
{
  "urlSourceId": "123e4567-e89b-12d3-a456-426614174000",
  "url": "https://www.nationalparks.org/explore-parks",
  "status": "completed",
  "placesFound": 15,
  "pagesScraped": 8,
  "newPlaces": 12,
  "existingPlacesUpdated": 3,
  "extractedPlaces": [
    {
      "name": "Yosemite National Park",
      "description": "Famous for its granite cliffs, waterfalls, and giant sequoia groves...",
      "placeType": "national_park",
      "locationHint": "California, USA",
      "confidence": 0.95
    },
    ...
  ]
}
```

**Error Responses**:
- `400 Bad Request`: Invalid URL format
- `401 Unauthorized`: Missing or invalid API key
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Scraping failed or AI unavailable

**Example cURL Request**:
```bash
curl -X POST "http://localhost:8080/api/sources/analyze" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.nationalparks.org/explore-parks",
    "submittedBy": "user@example.com"
  }'
```

## Processing Pipeline

### Step 1: URL Validation and Tracking
1. Validate URL format
2. Check if URL already submitted
3. Create or update `url_sources` record
4. Set status to 'processing'

### Step 2: Website Scraping
1. Deep scrape website using sitemap detection (up to 20 pages)
2. Extract clean text from each page
3. Store scraped pages in `scraped_pages` table
4. Track: website_url, page_url, extracted_text, word_count

### Step 3: AI Place Extraction
1. Send combined scraped content to Gemini AI
2. Extract structured place information:
   - Name (specific, not generic)
   - Description (max 500 chars)
   - Place type (park, trail, forest, mountain, etc.)
   - Location hint (country, region, nearby cities)
   - Confidence score (0.5-1.0)
3. Filter out low-confidence matches (< 0.5)

### Step 4: Cross-Reference with Database
1. Get list of extracted place names
2. Query existing `places` table for matches
3. For each extracted place:
   - **If exists**: Mark for update (TODO: implement score boosting)
   - **If new**: Add to `places_to_refine` table

### Step 5: Store Results
1. Bulk insert new places to `places_to_refine`
2. Update `url_sources` with results:
   - Set status to 'completed'
   - Store places_found, pages_scraped
   - Store analysis_result JSON
3. Return results to client

## AI Configuration

### Place Extraction Prompt

The system uses a specialized prompt to extract places from content:

```
You are helping to extract nature and outdoor places from website content for a discovery app.

Please analyze this content and extract ALL nature places, parks, trails, natural landmarks, or outdoor locations mentioned.

IMPORTANT RULES:
1. Only include places that are:
   - Specifically named (not "local parks" or "nearby trails")
   - Related to nature, outdoors, hiking, wildlife, or recreation
   - Distinct locations that could have their own database entry
2. Confidence score (0-1):
   - 0.9-1.0: Clearly defined with location info
   - 0.7-0.9: Well mentioned but partial location info
   - 0.5-0.7: Mentioned but vague details
   - Below 0.5: Don't include
3. Extract location hints from context (country, state, region, nearby cities)
```

## Database Migrations

To set up the database, run these SQL migration files in order:

1. `migrations/001_create_scraped_pages.sql`
2. `migrations/002_create_places_to_refine.sql`
3. `migrations/003_create_url_sources.sql`

After running migrations, regenerate Supabase types:
```bash
pnpm run generate-types
```

## Usage Examples

### Example 1: Analyze a National Parks Website

```bash
curl -X POST "http://localhost:8080/api/sources/analyze" \
  -H "X-API-Key: $API_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.nps.gov/state/ca/index.htm"
  }'
```

**Expected Outcome**:
- Scrapes 15-20 pages from the NPS California website
- Extracts 20+ California national parks and monuments
- Creates entries in `places_to_refine` for new places
- Updates existing places if they're already in database

### Example 2: Analyze a Hiking Blog

```bash
curl -X POST "http://localhost:8080/api/sources/analyze" \
  -H "X-API-Key: $API_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://hikingblog.com/top-trails-2024",
    "submittedBy": "hiker@example.com"
  }'
```

**Expected Outcome**:
- Scrapes blog post and related pages
- Extracts mentioned trails and parks
- Stores with high confidence scores for specific trail names
- Lower confidence for vaguely mentioned places

## Future Enhancements

### Planned Features

1. **Score Boosting for Existing Places**
   - Increase relevance/quality scores when mentioned in additional sources
   - Track number of mentions across sources
   - Weight by source credibility

2. **Description Enhancement**
   - Merge descriptions from multiple sources
   - Keep the most detailed/accurate description
   - Flag conflicts for human review

3. **Source Attribution**
   - Track which sources mention each place
   - Display source list on place detail pages
   - Calculate place credibility from source quality

4. **Batch Processing**
   - Queue system for processing multiple URLs
   - Background job processing
   - Webhook notifications when complete

5. **URL Filtering with Gemini**
   - Batch multiple URLs in one AI call (cost optimization)
   - Predict relevance before scraping
   - Prioritize high-value URLs

6. **Advanced Scraping**
   - JavaScript rendering for dynamic sites
   - Image analysis for location photos
   - PDF content extraction
   - robots.txt compliance

## Troubleshooting

### "Failed to scrape website"
- Website may have anti-scraping protections (Cloudflare, etc.)
- Check if website is accessible in browser
- Try with a simpler, static website first

### "No places extracted"
- Content may not be relevant to nature/outdoors
- Try a website specifically about parks or trails
- Check that the website has actual place names (not just generic references)

### "Rate limit exceeded"
- Wait for the rate limit window to reset (1 hour)
- Use the `RateLimit-Reset` header to know when to retry
- Adjust rate limits in `src/index.ts` if needed

### Database Errors
- Ensure migrations have been run:
  ```bash
  psql $DATABASE_URL < migrations/001_create_scraped_pages.sql
  psql $DATABASE_URL < migrations/002_create_places_to_refine.sql
  psql $DATABASE_URL < migrations/003_create_url_sources.sql
  ```
- Regenerate types: `pnpm run generate-types`

## Security Considerations

1. **API Keys**: Required for all requests, never expose in client-side code
2. **Rate Limiting**: Strict limits prevent abuse (10 requests/hour)
3. **URL Validation**: All URLs are validated before processing
4. **SQL Injection**: All database queries use parameterized statements
5. **CORS**: Configured to only allow specific origins
6. **Content Safety**: Only extracts text, no code execution

## Performance Notes

- Average processing time: 30-60 seconds per URL
- Depends on: number of pages, website speed, AI response time
- Scraping: ~2-3 seconds per page (with 500ms delays)
- AI extraction: ~5-10 seconds for 15,000 characters
- Database operations: < 1 second

## Monitoring

Track these metrics in production:
- URLs processed per hour/day
- Success/failure rates
- Average places found per URL
- Processing time percentiles (p50, p95, p99)
- AI token usage and costs
- Database query performance

## Related Documentation

- [PLACE_ANALYSIS_API.md](./PLACE_ANALYSIS_API.md) - Place-specific website analysis
- [Swagger UI](http://localhost:8080/api-docs) - Interactive API documentation
- [GitHub Issue #65](https://github.com/alexphiev/aroundus/issues/65) - Automated Website Content Extraction
- [GitHub Issue #66](https://github.com/alexphiev/aroundus/issues/66) - Method to suggest sources from URLs

## License

Part of the Empreinte Nature Places project.
