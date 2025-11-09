import { updatePlace } from '../db/places'
import { analyzePlaceRedditCore } from '../services/reddit-analysis.service'
import { scoreConfig } from '../services/score-config.service'
import { supabase } from '../services/supabase.service'
import { analyzePlaceWebsiteCore } from '../services/website-analysis.service'
import { analyzePlaceWikipediaCore } from '../services/wikipedia-analysis.service'
import { Tables } from '../types/database'

type Place = Tables<'places'>

interface EnhancementResult {
  placeId: string
  placeName: string
  websiteEnhanced: boolean
  redditEnhanced: boolean
  wikipediaEnhanced: boolean
  enhancementScore: number
  score: number
  errors: string[]
}

export class EnhancementController {
  public async getPlacesNeedingEnhancement(): Promise<Place[]> {
    try {
      console.log('📋 Fetching places that need enhancement...')

      const { data: places, error } = await supabase
        .from('places')
        .select('*')
        .or('last_enhanced_at.is.null,website_generated.is.null,reddit_generated.is.null,wikipedia_generated.is.null')

      if (error) {
        console.error('❌ Error fetching places:', error)
        return []
      }

      const placesNeedingEnhancement = places.filter((place) => this.needsEnhancement(place))

      console.log(`🔍 Found ${placesNeedingEnhancement.length} places needing enhancement`)
      return placesNeedingEnhancement
    } catch (error) {
      console.error('❌ Error getting places needing enhancement:', error)
      return []
    }
  }

  private needsEnhancement(place: Place): boolean {
    // Check if place was never enhanced
    if (!place.last_enhanced_at) {
      return true
    }

    // Check if place has website but no website_generated
    if (place.website && !place.website_generated) {
      return true
    }

    // Check if place needs reddit info (no reddit_generated field set)
    if (!place.reddit_generated) {
      return true
    }

    // Check if place has potential wikipedia info but no wikipedia_generated
    if (!place.wikipedia_generated) {
      // We can try to find wikipedia info even if not explicitly set
      return true
    }

    return false
  }

  public async enhancePlace(place: Place, force: boolean = false): Promise<EnhancementResult> {
    console.log(`\n🚀 Starting enhancement for place: ${place.name}`)

    const result: EnhancementResult = {
      placeId: place.id,
      placeName: place.name || 'Unknown',
      websiteEnhanced: false,
      redditEnhanced: false,
      wikipediaEnhanced: false,
      enhancementScore: 0,
      score: 0,
      errors: [],
    }

    let enhancementScore = 0
    const updates: Partial<Place> = {
      last_enhanced_at: new Date().toISOString(),
    }

    // 1. Website Enhancement
    if (place.website && (!place.website_generated || force)) {
      try {
        console.log(`🌐 Enhancing website info...`)
        const { result: websiteResult, error: websiteError } = await analyzePlaceWebsiteCore(place.id, {
          bypassCache: force,
        })

        if (websiteError) {
          const errorMsg = `Website enhancement failed: ${websiteError}`
          console.error(`❌ ${errorMsg}`)
          result.errors.push(errorMsg)
        } else if (websiteResult && websiteResult.description) {
          if (!websiteResult.description.includes('NO_RELEVANT_INFO') && websiteResult.description.length > 0) {
            // The core service already saves to database, so we just track the enhancement
            const score = scoreConfig.getWebsiteEnhancementScore()
            enhancementScore += score
            result.websiteEnhanced = true
            console.log(`✅ Website enhancement successful (+${score} score points)`)
          } else {
            console.log(`✅ Website enhancement completed - no relevant content found`)
          }
        }
      } catch (error) {
        const errorMsg = `Website enhancement failed: ${error}`
        console.error(`❌ ${errorMsg}`)
        result.errors.push(errorMsg)
      }
    } else {
      console.log(`🌐 Website enhancement skipped - already enhanced`)
      if (place.website_generated && !place.website_generated.toLowerCase().includes('no_relevant_info')) {
        enhancementScore += scoreConfig.getWebsiteEnhancementScore()
      }
    }

    // 2. Reddit Enhancement
    if (!place.reddit_generated || force) {
      try {
        console.log(`📱 Enhancing Reddit info...`)

        if (!place.name) {
          console.log(`❌ Reddit enhancement failed - no name`)
          return result
        }

        const { result: redditResult, error: redditError } = await analyzePlaceRedditCore(place.id, {
          bypassCache: force,
        })

        if (redditError) {
          const errorMsg = `Reddit enhancement failed: ${redditError}`
          console.error(`❌ ${errorMsg}`)
          result.errors.push(errorMsg)
        } else if (redditResult && redditResult.description) {
          if (!redditResult.description.includes('NO_RELEVANT_INFO') && redditResult.description.length > 0) {
            // The core service already saves to database, so we just track the enhancement
            const score = scoreConfig.getRedditEnhancementScore()
            enhancementScore += score
            result.redditEnhanced = true
            console.log(`✅ Reddit enhancement successful (+${score} score points)`)
          } else {
            console.log(`✅ Reddit enhancement completed - no relevant content found`)
          }
        }
      } catch (error) {
        const errorMsg = `Reddit enhancement failed: ${error}`
        console.error(`❌ ${errorMsg}`)
        result.errors.push(errorMsg)
      }
    } else {
      console.log(`🌐 Reddit enhancement skipped - already enhanced`)
      if (place.reddit_generated && !place.reddit_generated.toLowerCase().includes('no_relevant_info')) {
        enhancementScore += scoreConfig.getRedditEnhancementScore()
      }
    }

    // 3. Wikipedia Enhancement
    if (!place.wikipedia_generated || force) {
      try {
        console.log(`📚 Enhancing Wikipedia info...`)

        const { result: wikipediaResult, error: wikipediaError } = await analyzePlaceWikipediaCore(place.id, {
          bypassCache: force,
        })

        if (wikipediaError) {
          // If it's just "no Wikipedia article found", that's okay - not an error
          if (wikipediaError.includes('No Wikipedia article')) {
            console.log(`✅ Wikipedia enhancement completed - no Wikipedia article found`)
            // Don't add to errors, just continue
          } else {
            const errorMsg = `Wikipedia enhancement failed: ${wikipediaError}`
            console.error(`❌ ${errorMsg}`)
            result.errors.push(errorMsg)
          }
        } else if (wikipediaResult && wikipediaResult.description) {
          if (!wikipediaResult.description.includes('NO_RELEVANT_INFO') && wikipediaResult.description.length > 0) {
            // The core service already saves to database, so we just track the enhancement
            const score = scoreConfig.getWikipediaEnhancementScore()
            enhancementScore += score
            result.wikipediaEnhanced = true
            console.log(`✅ Wikipedia enhancement successful (+${score} score points)`)
          } else {
            console.log(`✅ Wikipedia enhancement completed - no relevant content found`)
          }
        }
      } catch (error) {
        const errorMsg = `Wikipedia enhancement failed: ${error}`
        console.error(`❌ ${errorMsg}`)
        result.errors.push(errorMsg)
      }
    } else {
      console.log(`🌐 Wikipedia enhancement skipped - already enhanced`)
      if (place.wikipedia_generated && !place.wikipedia_generated.toLowerCase().includes('no_relevant_info')) {
        enhancementScore += scoreConfig.getWikipediaEnhancementScore()
      }
    }

    // 4. Update Score and Save to Database
    updates.enhancement_score = enhancementScore
    result.enhancementScore = enhancementScore
    console.log(`📈 Total enhancement score: ${enhancementScore}`)

    // Update score
    const totalScore = (place.source_score || 0) + enhancementScore
    updates.score = totalScore
    result.score = totalScore
    console.log(`📈 Total score: ${totalScore}`)

    try {
      const { error } = await updatePlace(place.id, updates)

      if (error) {
        const errorMsg = `Database update failed: ${error.message}`
        console.error(`❌ ${errorMsg}`)
        result.errors.push(errorMsg)
      } else {
        console.log(`✅ Place enhancement completed and saved to database`)
      }
    } catch (error) {
      const errorMsg = `Database update error: ${error}`
      console.error(`❌ ${errorMsg}`)
      result.errors.push(errorMsg)
    }

    return result
  }

  public async enhanceAllPlaces(limit?: number, force: boolean = false): Promise<EnhancementResult[]> {
    console.log(`🌟 Starting enhancement of ${limit ? `first ${limit}` : 'all'} places...\n`)

    let places: Place[] = []

    if (force) {
      console.log(`🔄 Force mode enabled - processing all places regardless of enhancement status`)
      // Get all places when force is enabled
      const { data: allPlaces, error } = await supabase.from('places').select('*')

      if (error) {
        console.error('❌ Error fetching places:', error)
        return []
      }

      places = allPlaces || []
    } else {
      places = await this.getPlacesNeedingEnhancement()
    }

    if (places.length === 0) {
      console.log('✅ No places need enhancement!')
      return []
    }

    if (limit && limit > 0) {
      places = places.slice(0, limit)
      console.log(`📝 Limited to first ${limit} places`)
    }

    const results: EnhancementResult[] = []

    for (let i = 0; i < places.length; i++) {
      const place = places[i]
      console.log(`\n📍 Processing place ${i + 1}/${places.length}`)

      const result = await this.enhancePlace(place, force)
      results.push(result)

      // Add delay between places to be respectful to APIs
      if (i < places.length - 1) {
        console.log('⏳ Waiting 2 seconds before next place...')
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }

    // Summary
    console.log('\n📊 Enhancement Summary:')
    console.log('=====================')
    console.log(`Total places processed: ${results.length}`)
    console.log(`Website enhancements: ${results.filter((r) => r.websiteEnhanced).length}`)
    console.log(`Reddit enhancements: ${results.filter((r) => r.redditEnhanced).length}`)
    console.log(`Wikipedia enhancements: ${results.filter((r) => r.wikipediaEnhanced).length}`)
    console.log(`Total enhancement score: ${results.reduce((sum, r) => sum + r.enhancementScore, 0)}`)
    console.log(`Total score: ${results.reduce((sum, r) => sum + r.score, 0)}`)
    console.log(`Places with errors: ${results.filter((r) => r.errors.length > 0).length}`)

    return results
  }
}

export const enhancementController = new EnhancementController()
