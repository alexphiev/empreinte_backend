import { Request, Response } from 'express'
import { analyzeUrlsCore } from '../services/url-analysis.service'

export interface UrlAnalysisResponse {
  results: Array<{
    sourceId: string
    url: string
    places: Array<{
      name: string
      description: string | null
    }>
  }>
  error?: string
}

/**
 * Analyzes URLs and extracts nature places from them
 */
export async function analyzeUrls(
  req: Request,
  res: Response<UrlAnalysisResponse | { error: string }>,
): Promise<void> {
  try {
    const { urls } = req.body

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      res.status(400).json({ error: 'URLs array is required and must not be empty' })
      return
    }

    // Validate URLs
    const validUrls = urls.filter((url: string) => {
      if (typeof url !== 'string' || !url.trim()) {
        return false
      }
      try {
        new URL(url)
        return true
      } catch {
        return false
      }
    })

    if (validUrls.length === 0) {
      res.status(400).json({ error: 'No valid URLs provided' })
      return
    }

    console.log(`\n🔍 Starting URL analysis for ${validUrls.length} URL(s)`)

    const bypassCache = req.query.bypassCache === 'true' || req.query.bypassCache === '1'
    if (bypassCache) {
      console.log(`🔄 Bypassing cache - will fetch fresh content`)
    }

    const { results, error } = await analyzeUrlsCore(validUrls, { bypassCache })

    if (error) {
      res.status(500).json({ error })
      return
    }

    console.log(`\n✅ URL analysis complete!`)
    console.log(`📊 Processed ${results.length} source(s), extracted ${results.reduce((sum, r) => sum + r.places.length, 0)} total places`)

    const response: UrlAnalysisResponse = {
      results: results.map((r) => ({
        sourceId: r.sourceId,
        url: r.url,
        places: r.places,
      })),
    }

    res.status(200).json(response)
  } catch (error) {
    console.error('❌ Error in analyzeUrls:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: `Internal server error: ${errorMessage}` })
  }
}

