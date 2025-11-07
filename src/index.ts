import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import rateLimit from 'express-rate-limit'
import swaggerUi from 'swagger-ui-express'
import { swaggerSpec } from './config/swagger'
import { analyzePlaceWebsite, analyzePlaceWikipedia } from './controllers/place-analysis.controller'
import { analyzeUrls } from './controllers/url-analysis.controller'
import { verifyPlaces } from './controllers/place-verification.controller'
import { authenticateApiKey } from './middleware/auth.middleware'

const app = express()
const PORT = process.env.PORT || 8080

if (!process.env.API_SECRET_KEY) {
  throw new Error('API_SECRET_KEY environment variable is required')
}

const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000']

// Rate limiter configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
})

// Rate limiter for resource-intensive endpoints (more lenient for manual use)
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // Limit each IP to 50 requests per hour (reasonable for manual use)
  message: 'Too many scraping requests. Please try again in an hour.',
  standardHeaders: true,
  legacyHeaders: false,
})

// Health check endpoint (no CORS or rate limiting restrictions)
app.get('/health', (_, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() })
})

// Swagger documentation endpoint (no auth required)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

// Apply CORS to all other routes
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true)
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true)
      }

      console.error('CORS error with origin', origin)
      callback(new Error('Not allowed by CORS'))
    },
    credentials: true,
  }),
)

app.use(express.json({ limit: '1mb' }))

// Apply general rate limiter to all API routes
app.use('/api', limiter)

/**
 * @swagger
 * /api/places/{placeId}/analyze:
 *   post:
 *     summary: Analyze a place's website and extract information
 *     description: |
 *       Scrapes a place's website (using sitemap if available) and uses AI to extract:
 *       - A detailed description (max 2000 characters)
 *       - A list of mentioned nature places
 *
 *       This is a resource-intensive operation with rate limiting (50 requests/hour).
 *     tags:
 *       - Places
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: placeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The UUID of the place to analyze
 *       - in: query
 *         name: bypassCache
 *         required: false
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If true, bypasses cached raw data and fetches fresh content (which will overwrite the cache)
 *     responses:
 *       200:
 *         description: Successful analysis
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PlaceAnalysisResponse'
 *       400:
 *         description: Bad request (invalid ID or place has no website)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized (missing or invalid API key)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Place not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: Too many requests (rate limit exceeded)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error (scraping failed, AI unavailable, etc.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post('/api/places/:placeId/analyze', authenticateApiKey, strictLimiter, analyzePlaceWebsite)

/**
 * @swagger
 * /api/places/{placeId}/analyze-wikipedia:
 *   post:
 *     summary: Analyze a place's Wikipedia page and extract information
 *     description: |
 *       Fetches a place's Wikipedia article (from metadata or by searching) and uses AI to extract:
 *       - A detailed description focused on nature/outdoor features
 *       - A list of mentioned nature places
 *
 *       This operation uses two separate LLM calls in parallel for summarization and place extraction.
 *       Results are automatically saved to the database.
 *     tags:
 *       - Places
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: placeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The UUID of the place to analyze
 *       - in: query
 *         name: bypassCache
 *         required: false
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If true, bypasses cached raw data and fetches fresh content (which will overwrite the cache)
 *     responses:
 *       200:
 *         description: Successful analysis
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WikipediaAnalysisResponse'
 *       400:
 *         description: Bad request (invalid ID)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized (missing or invalid API key)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Place not found or no Wikipedia article found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: Too many requests (rate limit exceeded)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error (AI unavailable, etc.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post('/api/places/:placeId/analyze-wikipedia', authenticateApiKey, strictLimiter, analyzePlaceWikipedia)

/**
 * @swagger
 * /api/urls/analyze:
 *   post:
 *     summary: Analyze URLs and extract nature places from them
 *     description: |
 *       Scrapes one or more URLs (like travel guides, blog posts, articles) and uses AI to extract:
 *       - All nature places mentioned in the content
 *       - Descriptions for each place (when available)
 *
 *       Results are automatically stored in the database:
 *       - Sources are stored in the `sources` table (unique by URL)
 *       - Generated places are stored in the `generated_places` table (unique by name, linked to source)
 *
 *       This is a resource-intensive operation with rate limiting (50 requests/hour).
 *     tags:
 *       - URLs
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - urls
 *             properties:
 *               urls:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 description: Array of URLs to analyze
 *                 example: ["https://example.com/travel-guide"]
 *     parameters:
 *       - in: query
 *         name: bypassCache
 *         required: false
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If true, bypasses cached data and fetches fresh content
 *     responses:
 *       200:
 *         description: Successful analysis
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       sourceId:
 *                         type: string
 *                         format: uuid
 *                       url:
 *                         type: string
 *                         format: uri
 *                       places:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             name:
 *                               type: string
 *                             description:
 *                               type: string
 *                               nullable: true
 *       400:
 *         description: Bad request (invalid URLs or empty array)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized (missing or invalid API key)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: Too many requests (rate limit exceeded)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error (scraping failed, AI unavailable, etc.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post('/api/urls/analyze', authenticateApiKey, strictLimiter, analyzeUrls)

/**
 * @swagger
 * /api/places/verify:
 *   post:
 *     summary: Verify generated places and create/update real places in OSM
 *     description: |
 *       Searches for generated places in OSM (OpenStreetMap) and either:
 *       - Creates new places in the database if not found
 *       - Updates existing places by bumping their score
 *
 *       By default, verifies all generated places without a status, sorted by oldest created_at first.
 *       Can optionally verify a single generated place by ID, or limit the number of places to verify.
 *       Places are matched by name similarity, and scores are increased based on the source.
 *     tags:
 *       - Places
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               generatedPlaceId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional. Single generated place ID to verify. If not provided, verifies all places without status.
 *               scoreBump:
 *                 type: number
 *                 default: 2
 *                 description: Score increase for verified places (default 2)
 *               limit:
 *                 type: number
 *                 minimum: 1
 *                 description: Maximum number of places to verify (only applies when verifying all places, sorted by oldest created_at)
 *           example:
 *             scoreBump: 2
 *             limit: 10
 *     responses:
 *       200:
 *         description: Successful verification
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       generatedPlaceId:
 *                         type: string
 *                         format: uuid
 *                       generatedPlaceName:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [ADDED, NO_MATCH, NO_NATURE_MATCH, MULTIPLE_MATCHES]
 *                         description: Verification status
 *                       placeId:
 *                         type: string
 *                         format: uuid
 *                         nullable: true
 *                       osmId:
 *                         type: number
 *                         nullable: true
 *                       error:
 *                         type: string
 *                         nullable: true
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized (missing or invalid API key)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: Too many requests (rate limit exceeded)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error (OSM search failed, database error, etc.)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post('/api/places/verify', authenticateApiKey, strictLimiter, verifyPlaces)

/**
 * @swagger
 * /test:
 *   post:
 *     summary: Test endpoint
 *     description: Simple test endpoint to verify API key authentication
 *     tags:
 *       - Testing
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Successful test
 *       401:
 *         description: Unauthorized
 */
app.post('/test', authenticateApiKey, async (req, res) => {
  try {
    res.send('test')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('500 - Error:', errorMessage)
    res.status(500).json({ error: `Error: ${errorMessage}` })
  }
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`)
})
