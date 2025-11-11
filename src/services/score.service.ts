import { calculateGoogleRatingScore } from '@/utils/score.utils'
import { hasGeneratedPlace } from '../db/generated-places'
import { hasPlacePhotos } from '../db/place-photos'
import { getPlaceById, updatePlaceScoresFromCalculation } from '../db/places'
import { getWikipediaByPlaceId } from '../db/wikipedia'
import { Tables } from '../types/database'
import { SCORE_CONFIG } from './score-config.service'

type Place = Tables<'places'>

export interface ScoreCalculation {
  sourceScore: number
  enhancementScore: number
  totalScore: number
}

/**
 * Check if an enhancement field contains valid content
 */
export function isValidEnhancement(field: string | null): boolean {
  if (!field) return false
  if (field === 'not found') return false
  if (field.includes('NO_RELEVANT_INFO')) return false
  return true
}

/**
 * Centralized score calculation function
 * Calculates all scores for a place based on its current state
 */
export async function calculateScore(place: Place): Promise<ScoreCalculation> {
  // Calculate source score
  // Special handling for national and regional parks
  let sourceScore = SCORE_CONFIG.base

  if (place.type === 'national_park') {
    sourceScore = SCORE_CONFIG.nationalPark
  } else if (place.type === 'regional_park') {
    sourceScore = SCORE_CONFIG.regionalPark
  }

  // Add bonus if place has a related generated_place (is verified)
  try {
    const isVerified = await hasGeneratedPlace(place.id)
    if (isVerified) {
      sourceScore += SCORE_CONFIG.isGeneratedPlaceVerified
    }
  } catch (error) {
    // Skip silently if check fails
  }

  // Calculate enhancement score
  let enhancementScore = 0

  // Add bonus for website
  if (place.website) {
    enhancementScore += SCORE_CONFIG.hasWebsite
  }

  // Reddit enhancement
  if (isValidEnhancement(place.reddit_generated)) {
    enhancementScore += SCORE_CONFIG.hasRedditArticles
  }

  // Wikipedia enhancement - use score from wikipedia table
  // Note: Wikipedia score already includes hasPage + pageViews + languageVersions
  try {
    const { data } = await getWikipediaByPlaceId(place.id)
    if (data) {
      enhancementScore += SCORE_CONFIG.wikipedia.hasPage

      if (data.score) {
        enhancementScore += Number(data.score)
      }
    }
  } catch (error) {
    // Skip silently
  }

  // Photos bonus - check for actual photos in database
  try {
    const hasPhotos = await hasPlacePhotos(place.id)
    if (hasPhotos) {
      enhancementScore += SCORE_CONFIG.hasPhotos
    }
  } catch (error) {
    // Skip silently if photos check fails
  }

  // Google ratings bonus - use combined rating and count scoring
  if (place.google_rating && place.google_rating_count) {
    enhancementScore += calculateGoogleRatingScore(place.google_rating, place.google_rating_count)
  }

  const totalScore = sourceScore + enhancementScore

  return {
    sourceScore,
    enhancementScore,
    totalScore,
  }
}

/**
 * Recalculates and updates scores for a place
 * Fetches the latest place data, calculates scores, and updates the database
 * @param placeId The ID of the place to recalculate scores for
 * @returns The calculated scores, or null if the operation failed
 */
export async function recalculateAndUpdateScores(placeId: string): Promise<ScoreCalculation | null> {
  try {
    const { data: updatedPlace, error: fetchError } = await getPlaceById(placeId)

    if (fetchError || !updatedPlace) {
      console.error(`❌ Failed to fetch updated place for score recalculation:`, fetchError)
      return null
    }

    const scores = await calculateScore(updatedPlace)
    const updateResult = await updatePlaceScoresFromCalculation(placeId, scores)

    if (updateResult.error) {
      console.error(`❌ Failed to update scores:`, updateResult.error)
      return null
    }

    console.log(
      `✅ Scores recalculated: source=${scores.sourceScore}, enhancement=${scores.enhancementScore}, total=${scores.totalScore}`,
    )

    return scores
  } catch (error) {
    console.error(`❌ Error recalculating scores:`, error)
    // Don't fail the whole operation if score recalculation fails
    return null
  }
}
