import { updatePlace } from '../db/places'
import { redditService } from '../services/reddit.service'
import { supabase } from '../services/supabase.service'
import { websiteScraperService } from '../services/website-scraper.service'
import { wikipediaService } from '../services/wikipedia.service'
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
        const websiteResult = await websiteScraperService.scrapeAndSummarizeWebsite(
          place.name || 'Unknown',
          place.website,
        )

        if (websiteResult.summary || websiteResult.rawContent) {
          if (websiteResult.summary && !websiteResult.summary.includes('NO_RELEVANT_INFO')) {
            updates.website_generated = websiteResult.summary
            enhancementScore += 2
            result.websiteEnhanced = true
            console.log(`✅ Website enhancement successful (+2 score points)`)
          } else if (websiteResult.summary && websiteResult.summary.includes('NO_RELEVANT_INFO')) {
            updates.website_generated = websiteResult.summary
            console.log(`✅ Website enhancement completed - no relevant content found`)
          } else if (websiteResult.rawContent) {
            // AI failed but we have raw content - store a placeholder and let AI retry later
            updates.website_generated = null // Don't set to "not found" - leave for retry
            console.log(`⚠️ Website content found but AI processing failed - stored raw content for later retry`)
          }

          if (websiteResult.rawContent) {
            updates.website_raw = websiteResult.rawContent
          }
        } else {
          updates.website_generated = 'not found'
          console.log(`❌ Website enhancement failed - no relevant content`)
        }
      } catch (error) {
        const errorMsg = `Website enhancement failed: ${error}`
        console.error(`❌ ${errorMsg}`)
        result.errors.push(errorMsg)
      }
    } else {
      console.log(`🌐 Website enhancement skipped - already enhanced`)
      if (place.website_generated && !place.website_generated.toLowerCase().includes('no_relevant_info')) {
        enhancementScore += 2
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

        const redditResult = await redditService.searchAndSummarizeRedditDiscussions(place.name, place.short_name)

        if (redditResult && redditResult.summary && !redditResult.summary.includes('NO_RELEVANT_INFO')) {
          updates.reddit_generated = redditResult.summary
          enhancementScore += 2
          result.redditEnhanced = true
          console.log(`✅ Reddit enhancement successful (+2 score points)`)
        } else if (redditResult && redditResult.summary && redditResult.summary.includes('NO_RELEVANT_INFO')) {
          updates.reddit_generated = redditResult.summary
          console.log(`✅ Reddit enhancement completed - no relevant content found`)
        } else {
          updates.reddit_generated = 'not found'
          console.log(`✅ Reddit enhancement completed - no discussions found`)
        }

        // Store raw data if available
        if (redditResult && redditResult.rawData) {
          updates.reddit_data = redditResult.rawData
        }
      } catch (error) {
        const errorMsg = `Reddit enhancement failed: ${error}`
        console.error(`❌ ${errorMsg}`)
        result.errors.push(errorMsg)
      }
    } else {
      console.log(`🌐 Reddit enhancement skipped - already enhanced`)
      if (place.reddit_generated && !place.reddit_generated.toLowerCase().includes('no_relevant_info')) {
        enhancementScore += 2
      }
    }

    // 3. Wikipedia Enhancement
    if (!place.wikipedia_generated || force) {
      try {
        console.log(`📚 Enhancing Wikipedia info...`)

        let wikipediaResult: {
          summary: string | null
          rawContent: string | null
          mentionedPlaces: string[]
        } | null = null

        // First check if place has a wikipedia field in metadata
        const metadata = place.metadata as any
        if (metadata && metadata.wikipedia) {
          wikipediaResult = await wikipediaService.fetchAndSummarizeWikipedia(
            place.name || 'Unknown',
            metadata.wikipedia,
          )
        }

        // If no metadata wikipedia, try searching by place name
        if (!wikipediaResult || (!wikipediaResult.summary && !wikipediaResult.rawContent)) {
          wikipediaResult = await wikipediaService.searchWikipediaByPlaceName(place.name || 'Unknown')
        }

        if (wikipediaResult && (wikipediaResult.summary || wikipediaResult.rawContent)) {
          if (wikipediaResult.summary && !wikipediaResult.summary.includes('NO_RELEVANT_INFO')) {
            updates.wikipedia_generated = wikipediaResult.summary
            enhancementScore += 4
            result.wikipediaEnhanced = true
            console.log(`✅ Wikipedia enhancement successful (+4 score points)`)
          } else if (wikipediaResult.summary && wikipediaResult.summary.includes('NO_RELEVANT_INFO')) {
            updates.wikipedia_generated = wikipediaResult.summary
            console.log(`✅ Wikipedia enhancement completed - no relevant content found`)
          } else if (wikipediaResult.rawContent) {
            // AI failed but we have raw content - store a placeholder and let AI retry later
            updates.wikipedia_generated = null // Don't set to "not found" - leave for retry
            console.log(`⚠️ Wikipedia content found but AI processing failed - stored raw content for later retry`)
          }

          // Save mentioned places if any were extracted
          if (wikipediaResult.mentionedPlaces && wikipediaResult.mentionedPlaces.length > 0) {
            updates.wikipedia_places_generated = wikipediaResult.mentionedPlaces
            console.log(`✅ Saved ${wikipediaResult.mentionedPlaces.length} mentioned places from Wikipedia`)
          }

          if (wikipediaResult.rawContent) {
            updates.wikipedia_raw = wikipediaResult.rawContent
          }
        } else {
          updates.wikipedia_generated = 'not found'
          console.log(`❌ Wikipedia enhancement failed - no relevant content`)
        }
      } catch (error) {
        const errorMsg = `Wikipedia enhancement failed: ${error}`
        console.error(`❌ ${errorMsg}`)
        result.errors.push(errorMsg)
      }
    } else {
      console.log(`🌐 Wikipedia enhancement skipped - already enhanced`)
      if (place.wikipedia_generated && !place.wikipedia_generated.toLowerCase().includes('no_relevant_info')) {
        enhancementScore += 4
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
