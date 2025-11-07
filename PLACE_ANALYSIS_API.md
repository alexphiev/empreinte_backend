# Place Analysis API

This document describes the place analysis functionality that scrapes a place's website or fetches Wikipedia articles and uses AI to extract detailed information.

## Overview

The Place Analysis feature provides:

- **Website Analysis**: Deep scraping of place websites with sitemap discovery and AI-powered content extraction
- **Wikipedia Analysis**: Fetches and analyzes Wikipedia articles to extract nature-focused information
- **AI-Powered Extraction**: Uses Gemini AI with two parallel LLM calls for summarization and place extraction
- **Automatic Storage**: Results are automatically saved to the database
- **Security**: API key authentication, CORS protection, and rate limiting
- **Documentation**: Auto-generated Swagger/OpenAPI documentation with interactive testing

## Features

### 1. Deep Website Scraping

- Attempts to fetch and parse sitemap.xml from the website
- Scrapes up to 10 pages from the sitemap (uses LLM to filter most relevant pages when sitemap has >10 URLs)
- Prioritizes nature-related pages, informational pages describing the place, and visitor guides/tips
- Falls back to scraping just the homepage if no sitemap is available
- Respects rate limits with 500ms delay between requests
- Handles website protections gracefully (gives up if blocked)
- Extracts clean text content from HTML pages

### 2. AI-Powered Analysis

Uses Gemini AI (gemma-3-27b-it model) to analyze scraped content and extract:

- **Description**: A detailed, engaging description (max 2000 characters) focused on nature/outdoor activities
- **Mentioned Places**: A list of other nature places, parks, trails, or landmarks mentioned in the content

### 3. Security Features

- **API Key Authentication**: Required `X-API-Key` header
- **CORS Protection**: Configurable allowed origins
- **Rate Limiting**:
  - General API: 100 requests per 15 minutes
  - Analysis endpoint: 50 requests per hour (resource-intensive, but reasonable for manual use)
- **Input Validation**: Validates place IDs and URLs

### 4. Swagger Documentation

Auto-generated API documentation available at `/api-docs` when the server is running. See [Using Swagger](#using-swagger) section below for detailed instructions.

## API Endpoints

### Website Analysis Endpoint

### POST `/api/places/:placeId/analyze`

Analyzes a place's website by scraping multiple pages and extracting information with AI.

**Authentication**: Required (API key via `X-API-Key` header)

**Rate Limit**: 50 requests per hour per IP (reasonable for manual use)

**Parameters**:

- `placeId` (path, required): UUID of the place to analyze

**Response** (200 OK):

```json
{
  "placeId": "123e4567-e89b-12d3-a456-426614174000",
  "placeName": "Yellowstone National Park",
  "website": "https://www.nps.gov/yell",
  "description": "Yellowstone is America's first national park...",
  "mentionedPlaces": ["Grand Teton National Park", "Old Faithful Geyser", "Mammoth Hot Springs"],
  "scrapedPagesCount": 15
}
```

**Error Responses**:

- `400 Bad Request`: Invalid place ID or place has no website
- `401 Unauthorized`: Missing or invalid API key
- `404 Not Found`: Place not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Scraping failed, AI unavailable, or other errors

**Example cURL Request**:

```bash
curl -X POST "http://localhost:8080/api/places/123e4567-e89b-12d3-a456-426614174000/analyze" \
  -H "X-API-Key: your-api-key-here" \
  -H "Content-Type: application/json"
```

### Wikipedia Analysis Endpoint

### POST `/api/places/:placeId/analyze-wikipedia`

Analyzes a place's Wikipedia page and extracts information using AI.

**Authentication**: Required (API key via `X-API-Key` header)

**Rate Limit**: 50 requests per hour per IP (reasonable for manual use)

**Parameters**:

- `placeId` (path, required): UUID of the place to analyze

**How it works**:

1. First checks if the place has a Wikipedia reference in its metadata (format: `"en:Article Name"` or `"fr:Article Name"`)
2. If no metadata reference exists, searches Wikipedia by place name (tries English and French)
3. Uses two separate LLM calls in parallel:
   - Summarizes the Wikipedia content, focusing on nature/outdoor features
   - Extracts mentioned nature places from the article
4. Automatically saves results to the database (`wikipedia_generated` and `wikipedia_places_generated` fields)

**Response** (200 OK):

```json
{
  "placeId": "123e4567-e89b-12d3-a456-426614174000",
  "placeName": "Yellowstone National Park",
  "wikipediaReference": "en:Yellowstone National Park",
  "description": "Yellowstone National Park is a protected area showcasing significant geothermal phenomena...",
  "mentionedPlaces": ["Grand Teton National Park", "Old Faithful", "Mammoth Hot Springs"]
}
```

**Error Responses**:

- `400 Bad Request`: Invalid place ID
- `401 Unauthorized`: Missing or invalid API key
- `404 Not Found`: Place not found or no Wikipedia article found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: AI unavailable or other errors

**Example cURL Request**:

```bash
curl -X POST "http://localhost:8080/api/places/123e4567-e89b-12d3-a456-426614174000/analyze-wikipedia" \
  -H "X-API-Key: your-api-key-here" \
  -H "Content-Type: application/json"
```

## Script Usage

### Website Analysis Script

You can run website analysis from the command line:

```bash
# Using pnpm
pnpm run analyze-place-website <place-id>

# Using ts-node directly
ts-node src/scripts/analyze-place-website.ts <place-id>
```

**Example**:

```bash
pnpm run analyze-place-website 123e4567-e89b-12d3-a456-426614174000
```

### Wikipedia Analysis Script

You can run Wikipedia analysis from the command line:

```bash
# Using pnpm
pnpm run analyze-place-wikipedia <place-id>

# Using ts-node directly
ts-node src/scripts/analyze-place-wikipedia.ts <place-id>
```

**Example**:

```bash
pnpm run analyze-place-wikipedia 123e4567-e89b-12d3-a456-426614174000
```

**Output**:

```text
🚀 Starting Wikipedia analysis...

Place ID: 123e4567-e89b-12d3-a456-426614174000

--- Step 1: Fetching Place ---
✅ Found place: Yellowstone National Park
   Type: national_park

--- Step 2: Fetching Wikipedia Content ---
🔍 Searching Wikipedia by place name...
📄 Found Wikipedia content in en
📝 Summarizing content...
📍 Extracting mentioned places...
✅ Generated Wikipedia summary for Yellowstone National Park
✅ Extracted 3 mentioned places from Wikipedia

--- Step 3: Saving Results to Database ---
✅ Results saved to database

================================================================================
✅ WIKIPEDIA ANALYSIS COMPLETE
================================================================================

📝 Description:
--------------------------------------------------------------------------------
Yellowstone National Park is a protected area showcasing significant geothermal phenomena...
--------------------------------------------------------------------------------
Length: 1843 characters

📍 Mentioned Places:
--------------------------------------------------------------------------------
1. Grand Teton National Park
2. Old Faithful
3. Mammoth Hot Springs
--------------------------------------------------------------------------------

✨ Summary:
   - Description length: 1843 chars
   - Mentioned places: 3

✅ Script completed successfully!
```

**Output**:

```text
🚀 Starting place website analysis...

Place ID: 123e4567-e89b-12d3-a456-426614174000

--- Step 1: Fetching Place ---
✅ Found place: Yellowstone National Park
   Type: national_park
   Website: https://www.nps.gov/yell

--- Step 2: Scraping Website ---
Target: https://www.nps.gov/yell
🗺️  Attempting to fetch sitemap from: https://www.nps.gov/yell
✅ Found sitemap with 50 URLs at https://www.nps.gov/yell/sitemap.xml
✅ Scraped: https://www.nps.gov/yell/index.htm (5234 chars)
...
✅ Successfully scraped 15 pages
   Total content length: 78543 characters

--- Step 3: Analyzing with AI ---
Using Gemini API to extract description and mentioned places...
✅ AI analysis successful: 1843 chars, 3 mentioned places

================================================================================
✅ ANALYSIS COMPLETE
================================================================================

📝 Description:
--------------------------------------------------------------------------------
Yellowstone is America's first national park...
--------------------------------------------------------------------------------
Length: 1843 characters

📍 Mentioned Places:
--------------------------------------------------------------------------------
1. Grand Teton National Park
2. Old Faithful Geyser
3. Mammoth Hot Springs
--------------------------------------------------------------------------------

✨ Summary:
   - Pages scraped: 15
   - Content analyzed: 78543 chars
   - Description length: 1843 chars
   - Mentioned places: 3

✅ Script completed successfully!
```

## Using Swagger

Swagger provides an interactive API documentation interface where you can test endpoints directly from your browser.

### Accessing Swagger

1. **Start the server**:

   ```bash
   pnpm dev
   ```

2. **Open Swagger UI**:
   Navigate to `http://localhost:8080/api-docs` in your browser

### Using Swagger to Test Endpoints

1. **Authenticate**:
   - Click the "Authorize" button at the top right
   - Enter your API key in the `X-API-Key` field
   - Click "Authorize" and then "Close"
   - Your API key will now be included in all requests

2. **Test an Endpoint**:
   - Find the endpoint you want to test (e.g., `POST /api/places/{placeId}/analyze`)
   - Click on it to expand the details
   - Click "Try it out"
   - Enter the `placeId` parameter (UUID)
   - Click "Execute"
   - View the response below

3. **View Response Details**:
   - Swagger shows the full response including headers
   - Check the status code, response body, and any rate limit headers
   - Copy the response for further use

### Available Endpoints in Swagger

- **POST `/api/places/{placeId}/analyze`**: Analyze a place's website
- **POST `/api/places/{placeId}/analyze-wikipedia`**: Analyze a place's Wikipedia page
- **POST `/test`**: Test endpoint to verify API key authentication

### Tips

- **Rate Limits**: Check the `RateLimit-Remaining` header in responses to see how many requests you have left
- **Error Handling**: Swagger shows detailed error messages if something goes wrong
- **Request/Response Examples**: Each endpoint includes example request/response formats
- **Schema Definitions**: Click on schema names to see the full data structure

## Environment Variables

Required:

- `API_SECRET_KEY`: Secret key for API authentication
- `GEMINI_API_KEY`: Google Gemini API key for AI analysis
- `SUPABASE_URL`: Supabase database URL
- `SUPABASE_ANON_KEY`: Supabase anonymous key

Optional:

- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins (default: `http://localhost:3000`)
- `PORT`: Server port (default: `8080`)

## Architecture

### New Files

1. **src/services/deep-website-scraper.service.ts**
   - Fetches and parses sitemaps
   - Scrapes multiple pages with rate limiting
   - Extracts clean text from HTML

2. **src/services/ai.service.ts** (enhanced)
   - New `analyzeScrapedContent()` function
   - Returns structured JSON with description and mentioned places

3. **src/controllers/place-analysis.controller.ts**
   - Orchestrates scraping and AI analysis
   - Handles errors and validation

4. **src/config/swagger.ts**
   - Swagger/OpenAPI configuration
   - Schema definitions

5. **src/scripts/analyze-place-website.ts**
   - Command-line script for analysis
   - Formatted output for terminal

### Enhanced Files

1. **src/index.ts**
   - Added rate limiting middleware
   - Added Swagger UI endpoint (`/api-docs`)
   - Added place analysis endpoint (`POST /api/places/:placeId/analyze`)

2. **package.json**
   - Added dependencies: `sitemap`, `express-rate-limit`, `swagger-jsdoc`, `swagger-ui-express`
   - Added script: `analyze-place-website`

## Technical Details

### Scraping Strategy

1. **Sitemap Discovery**:
   - Tries common sitemap locations: `/sitemap.xml`, `/sitemap_index.xml`, `/sitemap`
   - Parses XML to extract URLs
   - Uses LLM to filter to 10 most relevant URLs when sitemap has >10 pages (prioritizes nature-related, informational, and visitor guide pages)

2. **Page Scraping**:
   - Uses native `fetch()` with 10-second timeout
   - Validates content type (HTML only)
   - Removes unwanted elements (scripts, styles, navigation, ads)
   - Extracts main content using semantic HTML selectors
   - Adds 500ms delay between requests

3. **Error Handling**:
   - Gracefully handles timeouts
   - Detects and reports website protections
   - Falls back to homepage if sitemap unavailable

### AI Processing

1. **Prompt Engineering**:
   - Clear instructions for structured JSON output
   - Focus on nature/outdoor activities
   - Maximum description length: 2000 characters
   - Filters out generic place references

2. **Response Parsing**:
   - Extracts JSON from AI response (handles extra text)
   - Validates structure
   - Ensures arrays and string limits

3. **Fallback Handling**:
   - Retry logic for API errors
   - Graceful degradation if AI unavailable

## Rate Limiting

### General API Routes

- **Window**: 15 minutes
- **Limit**: 100 requests per IP
- **Applies to**: All `/api/*` endpoints

### Analysis Endpoint

- **Window**: 1 hour
- **Limit**: 50 requests per IP (reasonable for manual use)
- **Applies to**: `POST /api/places/:placeId/analyze`
- **Reason**: Resource-intensive (scraping + AI processing), but allows for manual batch processing

Rate limit headers are included in responses:

- `RateLimit-Limit`: Maximum requests allowed
- `RateLimit-Remaining`: Requests remaining in current window
- `RateLimit-Reset`: Time when the rate limit resets (Unix timestamp)

## Future Enhancements

Potential improvements:

1. Cache scraped content to reduce repeated requests
2. Support for robots.txt parsing
3. JavaScript rendering for dynamic sites (Puppeteer/Playwright)
4. Batch analysis of multiple places
5. Store analysis results in database
6. Webhook support for async processing
7. More sophisticated sitemap handling (sitemap indexes, gzipped sitemaps)

## Testing

To test the implementation:

1. **Start the server**:

   ```bash
   pnpm dev
   ```

2. **View Swagger documentation**:
   Open `http://localhost:8080/api-docs` in your browser

3. **Test with script** (requires place with a website in database):

   ```bash
   pnpm run analyze-place-website <place-id>
   ```

4. **Test with API** (requires API key):

   ```bash
   curl -X POST "http://localhost:8080/api/places/<place-id>/analyze" \
     -H "X-API-Key: $API_SECRET_KEY" \
     -H "Content-Type: application/json"
   ```

## Troubleshooting

### "Place has no website to analyze"

- Ensure the place in the database has a `website` field populated
- Update the place record with a valid website URL

### "Failed to scrape website"

- Website may have anti-scraping protections
- Website may be temporarily unavailable
- Check if the URL is accessible in a browser

### "AI analysis failed"

- Verify `GEMINI_API_KEY` is set correctly
- Check Gemini API quota and billing
- Content may not be relevant to nature/outdoor activities

### Rate limit exceeded

- Wait for the rate limit window to reset
- Use the `RateLimit-Reset` header to know when to retry
- Consider increasing rate limits if needed (edit `src/index.ts`)

## Security Considerations

1. **API Keys**: Store in `.env` file, never commit to version control
2. **CORS**: Configure `ALLOWED_ORIGINS` appropriately for production
3. **Rate Limiting**: Adjust limits based on expected usage and infrastructure
4. **Input Validation**: All inputs are validated (UUIDs, URLs)
5. **Timeout Protection**: All external requests have timeouts
6. **Error Messages**: Don't expose sensitive information in error responses

## License

Part of the Empreinte Nature Places project.
