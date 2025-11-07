import { Request, Response } from 'express'
import { verifyPlacesCore, VerificationResult } from '../services/place-verification.service'

export interface PlaceVerificationResponse {
  results: VerificationResult[]
  error?: string
}

/**
 * Verifies generated places by searching OSM and creating/updating real places
 */
export async function verifyPlaces(
  req: Request,
  res: Response<PlaceVerificationResponse | { error: string }>,
): Promise<void> {
  try {
    const { sourceId, generatedPlaceId, scoreBump } = req.body

    if (!sourceId && !generatedPlaceId) {
      res.status(400).json({ error: 'Either sourceId or generatedPlaceId must be provided' })
      return
    }

    console.log(`\n🔍 Starting place verification`)
    if (sourceId) {
      console.log(`   Source ID: ${sourceId}`)
    }
    if (generatedPlaceId) {
      console.log(`   Generated Place ID: ${generatedPlaceId}`)
    }
    if (scoreBump) {
      console.log(`   Score bump: ${scoreBump}`)
    }

    const { results, error } = await verifyPlacesCore({
      sourceId,
      generatedPlaceId,
      scoreBump: scoreBump || 2,
    })

    if (error) {
      res.status(500).json({ error })
      return
    }

    const verifiedCount = results.filter((r) => r.verified).length
    console.log(`\n✅ Verification complete!`)
    console.log(`📊 Verified ${verifiedCount}/${results.length} places`)

    const response: PlaceVerificationResponse = {
      results,
    }

    res.status(200).json(response)
  } catch (error) {
    console.error('❌ Error in verifyPlaces:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: `Internal server error: ${errorMessage}` })
  }
}

