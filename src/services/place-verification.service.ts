import { getGeneratedPlacesBySourceId } from '../db/generated-places'
import { getSourceById } from '../db/sources'
import { getPlaceById, updatePlace } from '../db/places'
import { batchUpsert } from '../utils/common'
import { formatPlaceObject } from '../utils/common'
import { overpassService } from './overpass.service'
import { supabase } from '../services/supabase.service'

export interface VerificationResult {
  generatedPlaceId: string
  generatedPlaceName: string
  verified: boolean
  placeId?: string
  osmId?: number
  error?: string
}

export interface VerificationOptions {
  sourceId?: string
  generatedPlaceId?: string
  scoreBump?: number
}

/**
 * Search for a place in OSM by name and create/update a real place
 */
async function searchAndCreatePlace(
  placeName: string,
  description: string | null,
  sourceId: string,
  sourceUrl: string,
  scoreBump: number = 2,
): Promise<{ placeId?: string; osmId?: number; error?: string }> {
  try {
    // Search OSM for the place
    const osmElements = await overpassService.searchPlaceByName(placeName)

    if (!osmElements || osmElements.length === 0) {
      return { error: 'Place not found in OSM' }
    }

    // Process elements and find best match
    const processedPlaces = overpassService.processElements(osmElements)

    if (processedPlaces.length === 0) {
      return { error: 'No valid places found in OSM results' }
    }

    // Find best match by name similarity
    let bestMatch = processedPlaces[0]
    let bestScore = 0

    const normalizedPlaceName = placeName.toLowerCase().trim()

    for (const place of processedPlaces) {
      const normalizedOsmName = place.name.toLowerCase().trim()
      let score = 0

      // Exact match
      if (normalizedOsmName === normalizedPlaceName) {
        score = 100
      }
      // Contains the place name
      else if (normalizedOsmName.includes(normalizedPlaceName) || normalizedPlaceName.includes(normalizedOsmName)) {
        score = 50
        // Prefer shorter names (more specific)
        if (normalizedOsmName.length < normalizedPlaceName.length + 10) {
          score += 20
        }
      }
      // Similarity based on common words
      else {
        const placeWords = normalizedPlaceName.split(/\s+/)
        const osmWords = normalizedOsmName.split(/\s+/)
        const commonWords = placeWords.filter((word) => osmWords.includes(word))
        score = (commonWords.length / Math.max(placeWords.length, osmWords.length)) * 30
      }

      if (score > bestScore) {
        bestScore = score
        bestMatch = place
      }
    }

    if (bestScore < 20) {
      return { error: 'No good match found in OSM' }
    }

    console.log(`✅ Found OSM match: ${bestMatch.name} (score: ${bestScore}, OSM ID: ${bestMatch.osm_id})`)

    // Check if place already exists by OSM ID
    const { data: existingPlace } = await supabase
      .from('places')
      .select('*')
      .eq('osm_id', String(bestMatch.osm_id))
      .single()

    if (existingPlace) {
      // Update existing place: bump score and add source reference
      const currentScore = existingPlace.source_score || 0
      const newSourceScore = currentScore + scoreBump
      const newTotalScore = newSourceScore + (existingPlace.enhancement_score || 0)

      await updatePlace(existingPlace.id, {
        source_score: newSourceScore,
        score: newTotalScore,
        description: description || existingPlace.description,
        source_id: sourceId,
      })

      console.log(`🔄 Updated existing place: ${existingPlace.name} (score: ${currentScore} → ${newSourceScore})`)
      return { placeId: existingPlace.id, osmId: bestMatch.osm_id }
    }

    // Create new place
    const placeData = formatPlaceObject({
      source: sourceUrl,
      sourceId: sourceId,
      osm_id: bestMatch.osm_id,
      name: bestMatch.name,
      type: bestMatch.type,
      location: bestMatch.latitude && bestMatch.longitude
        ? `POINT(${bestMatch.longitude} ${bestMatch.latitude})`
        : null,
      geometry: bestMatch.geometry,
      description: description,
      source_score: scoreBump,
      score: scoreBump,
      country: 'France', // Default, could be improved
    })

    // Insert the place
    const { data: newPlace, error: insertError } = await supabase
      .from('places')
      .insert(placeData)
      .select()
      .single()

    if (insertError) {
      console.error(`❌ Error creating place:`, insertError)
      return { error: `Failed to create place: ${insertError.message}` }
    }

    console.log(`✅ Created new place: ${newPlace.name} (score: ${scoreBump})`)
    return { placeId: newPlace.id, osmId: bestMatch.osm_id }
  } catch (error) {
    console.error(`❌ Error searching/creating place "${placeName}":`, error)
    return { error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Core place verification logic - shared between API and scripts
 */
export async function verifyPlacesCore(
  options: VerificationOptions = {},
): Promise<{ results: VerificationResult[]; error: string | null }> {
  try {
    const { sourceId, generatedPlaceId, scoreBump = 2 } = options

    if (!sourceId && !generatedPlaceId) {
      return {
        results: [],
        error: 'Either sourceId or generatedPlaceId must be provided',
      }
    }

    let generatedPlaces: Array<{ id: string; name: string; description: string | null; source_id: string }> = []
    let sourceUrl = 'unknown'

    if (generatedPlaceId) {
      // Verify a single generated place
      const { data: place, error } = await supabase
        .from('generated_places')
        .select('*')
        .eq('id', generatedPlaceId)
        .single()

      if (error || !place) {
        return {
          results: [],
          error: `Generated place not found: ${generatedPlaceId}`,
        }
      }

      // Get source URL
      const sourceResponse = await getSourceById(place.source_id)
      if (sourceResponse.data) {
        sourceUrl = sourceResponse.data.url
      }

      generatedPlaces = [
        {
          id: place.id,
          name: place.name,
          description: place.description,
          source_id: place.source_id,
        },
      ]
    } else if (sourceId) {
      // Verify all places for a source
      const sourceResponse = await getSourceById(sourceId)
      if (sourceResponse.error || !sourceResponse.data) {
        return {
          results: [],
          error: `Source not found: ${sourceId}`,
        }
      }

      sourceUrl = sourceResponse.data.url
      const places = await getGeneratedPlacesBySourceId(sourceId)
      generatedPlaces = places.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        source_id: p.source_id,
      }))
    }

    if (generatedPlaces.length === 0) {
      return {
        results: [],
        error: 'No generated places found to verify',
      }
    }

    console.log(`\n🔍 Verifying ${generatedPlaces.length} generated place(s)...`)

    const results: VerificationResult[] = []

    for (const generatedPlace of generatedPlaces) {
      console.log(`\n--- Verifying: ${generatedPlace.name} ---`)

      const verification = await searchAndCreatePlace(
        generatedPlace.name,
        generatedPlace.description,
        generatedPlace.source_id,
        sourceUrl,
        scoreBump,
      )

      results.push({
        generatedPlaceId: generatedPlace.id,
        generatedPlaceName: generatedPlace.name,
        verified: !!verification.placeId,
        placeId: verification.placeId,
        osmId: verification.osmId,
        error: verification.error,
      })
    }

    return {
      results,
      error: null,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      results: [],
      error: `Internal error: ${errorMessage}`,
    }
  }
}

