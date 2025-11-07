import { getGeneratedPlacesBySourceId, updateGeneratedPlace } from '../db/generated-places'
import { updatePlace } from '../db/places'
import { getSourceById } from '../db/sources'
import { supabase } from '../services/supabase.service'
import { formatPlaceObject } from '../utils/common'
import { overpassService } from './overpass.service'

export enum VerificationStatus {
  ADDED = 'ADDED',
  NO_MATCH = 'NO_MATCH',
  MULTIPLE_MATCHES = 'MULTIPLE_MATCHES',
}

export interface VerificationResult {
  generatedPlaceId: string
  generatedPlaceName: string
  status: VerificationStatus
  placeId?: string
  osmId?: number
  error?: string
}

export interface VerificationOptions {
  sourceId?: string
  generatedPlaceId?: string
  scoreBump?: number
  limit?: number
}

/**
 * Search for a place in OSM by name and create/update a real place
 * Returns status and place information
 */
async function searchAndCreatePlace(
  placeName: string,
  description: string | null,
  sourceId: string,
  sourceUrl: string,
  scoreBump: number = 2,
): Promise<{
  status: VerificationStatus
  placeId?: string
  osmId?: number
  error?: string
}> {
  try {
    // Search OSM for the place
    const osmElements = await overpassService.searchPlaceByName(placeName)

    if (!osmElements || osmElements.length === 0) {
      return { status: VerificationStatus.NO_MATCH, error: 'Place not found in OSM' }
    }

    // Process elements and find best match
    const processedPlaces = overpassService.processElements(osmElements)

    if (processedPlaces.length === 0) {
      return { status: VerificationStatus.NO_MATCH, error: 'No valid places found in OSM results' }
    }

    // If multiple matches found, mark as MULTIPLE_MATCHES
    if (processedPlaces.length > 1) {
      console.log(
        `⚠️  Multiple matches found for "${placeName}" (${processedPlaces.length} results) - requires manual review`,
      )
      return {
        status: VerificationStatus.MULTIPLE_MATCHES,
        error: `Multiple matches found: ${processedPlaces.length} results`,
      }
    }

    // Single match - proceed with verification
    const match = processedPlaces[0]

    // Verify name similarity to ensure it's a good match
    const normalizedPlaceName = placeName.toLowerCase().trim()
    const normalizedOsmName = match.name.toLowerCase().trim()

    let similarityScore = 0

    // Exact match
    if (normalizedOsmName === normalizedPlaceName) {
      similarityScore = 100
    }
    // Contains the place name
    else if (normalizedOsmName.includes(normalizedPlaceName) || normalizedPlaceName.includes(normalizedOsmName)) {
      similarityScore = 50
      // Prefer shorter names (more specific)
      if (normalizedOsmName.length < normalizedPlaceName.length + 10) {
        similarityScore += 20
      }
    }
    // Similarity based on common words
    else {
      const placeWords = normalizedPlaceName.split(/\s+/)
      const osmWords = normalizedOsmName.split(/\s+/)
      const commonWords = placeWords.filter((word) => osmWords.includes(word))
      similarityScore = (commonWords.length / Math.max(placeWords.length, osmWords.length)) * 30
    }

    // Require high confidence (at least 50) for a single match to be considered valid
    if (similarityScore < 50) {
      console.log(
        `⚠️  Low similarity score (${similarityScore}) for "${placeName}" → "${match.name}" - requires manual review`,
      )
      return {
        status: VerificationStatus.MULTIPLE_MATCHES,
        error: `Low confidence match: similarity score ${similarityScore}`,
      }
    }

    console.log(`✅ Found OSM match: ${match.name} (similarity: ${similarityScore}, OSM ID: ${match.osm_id})`)

    // Verify uniqueness by OSM ID before adding/updating
    const { data: existingPlace, error: findError } = await supabase
      .from('places')
      .select('*')
      .eq('osm_id', String(match.osm_id))
      .maybeSingle()

    if (findError && findError.code !== 'PGRST116') {
      // PGRST116 is "not found" which is expected, other errors are real issues
      console.error(`❌ Error checking for existing place:`, findError)
      return { status: VerificationStatus.NO_MATCH, error: `Database error: ${findError.message}` }
    }

    if (existingPlace) {
      // Place already exists with this OSM ID - update it instead of creating duplicate
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
      return { status: VerificationStatus.ADDED, placeId: existingPlace.id, osmId: match.osm_id }
    }

    // Create new place
    const placeData = formatPlaceObject({
      source: sourceUrl,
      sourceId: sourceId,
      osm_id: String(match.osm_id),
      name: match.name,
      type: match.type,
      location: match.latitude && match.longitude ? `POINT(${match.longitude} ${match.latitude})` : null,
      geometry: match.geometry,
      description: description,
      source_score: scoreBump,
      score: scoreBump,
      country: 'France', // Default, could be improved
    })

    // Insert the place
    const { data: newPlace, error: insertError } = await supabase.from('places').insert(placeData).select().single()

    if (insertError) {
      console.error(`❌ Error creating place:`, insertError)
      return { status: VerificationStatus.NO_MATCH, error: `Failed to create place: ${insertError.message}` }
    }

    console.log(`✅ Created new place: ${newPlace.name} (score: ${scoreBump})`)
    return { status: VerificationStatus.ADDED, placeId: newPlace.id, osmId: match.osm_id }
  } catch (error) {
    console.error(`❌ Error searching/creating place "${placeName}":`, error)
    return { status: VerificationStatus.NO_MATCH, error: error instanceof Error ? error.message : 'Unknown error' }
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

      // Check if place already has a status
      if (place.status) {
        return {
          results: [],
          error: `Generated place already has status "${place.status}" - requires special handling`,
        }
      }

      // Validate required fields
      if (!place.name || !place.source_id) {
        return {
          results: [],
          error: `Generated place missing required fields (name or source_id)`,
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
      // Only process places without a status (null status) and with required fields
      generatedPlaces = places
        .filter((p) => !p.status && p.name && p.source_id)
        .map((p) => ({
          id: p.id,
          name: p.name!,
          description: p.description,
          source_id: p.source_id!,
        }))
    }

    if (generatedPlaces.length === 0) {
      return {
        results: [],
        error: 'No generated places found to verify (all places already have a status)',
      }
    }

    // Apply limit if specified
    const limit = options.limit
    const placesToVerify = limit ? generatedPlaces.slice(0, limit) : generatedPlaces

    if (limit && generatedPlaces.length > limit) {
      console.log(`\n⚠️  Limiting verification to ${limit} places (${generatedPlaces.length} total places available)`)
    }

    console.log(`\n🔍 Verifying ${placesToVerify.length} generated place(s) (without status)...`)

    const results: VerificationResult[] = []

    for (const generatedPlace of placesToVerify) {
      console.log(`\n--- Verifying: ${generatedPlace.name} ---`)

      const verification = await searchAndCreatePlace(
        generatedPlace.name,
        generatedPlace.description,
        generatedPlace.source_id,
        sourceUrl,
        scoreBump,
      )

      // Update the generated place status
      await updateGeneratedPlace(generatedPlace.id, {
        status: verification.status,
        place_id: verification.placeId || null,
      })

      results.push({
        generatedPlaceId: generatedPlace.id,
        generatedPlaceName: generatedPlace.name,
        status: verification.status,
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
