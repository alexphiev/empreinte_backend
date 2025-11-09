/**
 * Score Configuration Service
 *
 * Centralizes all score values from environment variables to avoid magic numbers
 * throughout the codebase. All score-related values should be retrieved from here.
 */

export interface ScoreConfig {
  // Enhancement scores (points added when content is successfully analyzed)
  enhancement: {
    website: number
    reddit: number
    wikipedia: number
  }

  // Score bumps for other operations
  bumps: {
    photosFetched: number
    ratingsFetched: number
    generatedPlaceVerified: number
  }

  // Source scores (base scores for places from different sources)
  source: {
    base: number
    hasWikipedia: number
    hasWebsite: number
  }
}

class ScoreConfigService {
  private config: ScoreConfig

  constructor() {
    this.config = this.loadConfig()
  }

  private loadConfig(): ScoreConfig {
    return {
      enhancement: {
        website: this.getEnvNumber('SCORE_ENHANCEMENT_WEBSITE', 2),
        reddit: this.getEnvNumber('SCORE_ENHANCEMENT_REDDIT', 2),
        wikipedia: this.getEnvNumber('SCORE_ENHANCEMENT_WIKIPEDIA', 4),
      },
      bumps: {
        photosFetched: this.getEnvNumber('SCORE_BUMP_PHOTOS_FETCHED', 2),
        ratingsFetched: this.getEnvNumber('SCORE_BUMP_RATINGS_FETCHED', 2),
        generatedPlaceVerified: this.getEnvNumber('SCORE_BUMP_GENERATED_PLACE_VERIFIED', 2),
      },
      source: {
        base: this.getEnvNumber('SCORE_SOURCE_BASE', 1),
        hasWikipedia: this.getEnvNumber('SCORE_SOURCE_HAS_WIKIPEDIA', 2),
        hasWebsite: this.getEnvNumber('SCORE_SOURCE_HAS_WEBSITE', 2),
      },
    }
  }

  private getEnvNumber(key: string, defaultValue: number): number {
    const value = process.env[key]
    if (value === undefined || value === '') {
      return defaultValue
    }
    const parsed = parseInt(value, 10)
    if (isNaN(parsed)) {
      console.warn(`⚠️ Invalid value for ${key}: "${value}". Using default: ${defaultValue}`)
      return defaultValue
    }
    return parsed
  }

  /**
   * Get the complete score configuration
   */
  public getConfig(): ScoreConfig {
    return { ...this.config }
  }

  /**
   * Get enhancement score for website analysis
   */
  public getWebsiteEnhancementScore(): number {
    return this.config.enhancement.website
  }

  /**
   * Get enhancement score for Reddit analysis
   */
  public getRedditEnhancementScore(): number {
    return this.config.enhancement.reddit
  }

  /**
   * Get enhancement score for Wikipedia analysis
   */
  public getWikipediaEnhancementScore(): number {
    return this.config.enhancement.wikipedia
  }

  /**
   * Get score bump for photos fetched
   */
  public getPhotosFetchedBump(): number {
    return this.config.bumps.photosFetched
  }

  /**
   * Get score bump for ratings fetched
   */
  public getRatingsFetchedBump(): number {
    return this.config.bumps.ratingsFetched
  }

  /**
   * Get score bump for place verification
   */
  public getGeneratedPlaceVerifiedBump(): number {
    return this.config.bumps.generatedPlaceVerified
  }

  /**
   * Get base source score
   */
  public getSourceBaseScore(): number {
    return this.config.source.base
  }

  /**
   * Get bonus score for places with Wikipedia reference
   */
  public getSourceHasWikipediaScore(): number {
    return this.config.source.hasWikipedia
  }

  /**
   * Get bonus score for places with website
   */
  public getSourceHasWebsiteScore(): number {
    return this.config.source.hasWebsite
  }
}

export const scoreConfig = new ScoreConfigService()
