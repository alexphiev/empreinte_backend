import { Tables } from '../types/database'

type Place = Tables<'places'>

export interface EnhancementScoreCalculation {
  websiteScore: number
  redditScore: number
  wikipediaScore: number
  totalEnhancementScore: number
}

export interface PlaceScoreCalculation extends EnhancementScoreCalculation {
  sourceScore: number
  totalScore: number
}

export function isValidEnhancement(field: string | null): boolean {
  if (!field) return false
  if (field === 'not found') return false
  if (field.includes('NO_RELEVANT_INFO')) return false
  return true
}

export function calculateEnhancementScore(place: Place): EnhancementScoreCalculation {
  let websiteScore = 0
  let redditScore = 0
  let wikipediaScore = 0

  // Website enhancement (+2 points)
  if (isValidEnhancement(place.website_generated)) {
    websiteScore = 2
  }

  // Reddit enhancement (+2 points)
  if (isValidEnhancement(place.reddit_generated)) {
    redditScore = 2
  }

  // Wikipedia enhancement (+4 points)
  if (isValidEnhancement(place.wikipedia_generated)) {
    wikipediaScore = 4
  }

  const totalEnhancementScore = websiteScore + redditScore + wikipediaScore

  return {
    websiteScore,
    redditScore,
    wikipediaScore,
    totalEnhancementScore,
  }
}

export function calculatePlaceScore(place: Place): PlaceScoreCalculation {
  const sourceScore = place.source_score || 0
  const enhancement = calculateEnhancementScore(place)
  const totalScore = sourceScore + enhancement.totalEnhancementScore

  return {
    ...enhancement,
    sourceScore,
    totalScore,
  }
}

export function hasWebsiteEnhancement(place: Place): boolean {
  return isValidEnhancement(place.website_generated)
}

export function hasRedditEnhancement(place: Place): boolean {
  return isValidEnhancement(place.reddit_generated)
}

export function hasWikipediaEnhancement(place: Place): boolean {
  return isValidEnhancement(place.wikipedia_generated)
}