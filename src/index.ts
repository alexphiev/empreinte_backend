import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import rateLimit from 'express-rate-limit'
import swaggerUi from 'swagger-ui-express'
import { swaggerSpec } from './config/swagger'
import { analyzePlaceWebsite } from './controllers/place-analysis.controller'
import { authenticateApiKey } from './middleware/auth.middleware'

const app = express()
const PORT = process.env.PORT || 8080

if (!process.env.API_SECRET_KEY) {
  throw new Error('API_SECRET_KEY environment variable is required')
}

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000']

// Rate limiter configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
})

// Stricter rate limiter for resource-intensive endpoints
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 requests per hour for scraping
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
 *       This is a resource-intensive operation with strict rate limiting (10 requests/hour).
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
