import { createPlacePhotos, hasPlacePhotos, setPrimaryPhoto } from '../db/place-photos'
import { Place, updatePlace } from '../db/places'
import { calculateGeometryCenter } from '../utils/common'
import { GooglePlacesPhoto, googlePlacesPhotosService } from './google-places.service'
import { WikimediaPhoto, wikimediaPhotosService } from './wikimedia-photos.service'

export interface PhotoFetchResult {
  placeId: string
  placeName: string
  success: boolean
  photosFound: number
  source: 'wikimedia' | 'google_places' | 'none'
  error?: string
}

export class PhotoFetcherService {
  /**
   * Fetch photos for a place, trying Wikimedia first, then Google Places
   */
  public async fetchPhotosForPlace(place: Place): Promise<PhotoFetchResult> {
    const result: PhotoFetchResult = {
      placeId: place.id,
      placeName: place.name || 'Unknown',
      success: false,
      photosFound: 0,
      source: 'none',
    }

    try {
      // Get coordinates from geometry or location
      const center = calculateGeometryCenter(place.geometry)
      const latitude = center?.lat || null
      const longitude = center?.lon || null

      if (!place.name) {
        result.error = 'Place has no name'
        return result
      }

      console.log(`\n📸 Fetching photos for: ${place.name}`)
      if (latitude !== null && longitude !== null) {
        console.log(`📍 Location: ${latitude}, ${longitude}`)
      }

      // Check if this is the first time fetching photos (before we save any)
      const hadPhotosBefore = await hasPlacePhotos(place.id)

      // Try Wikimedia first (free)
      console.log(`1️⃣ Trying Wikimedia Commons...`)
      const wikimediaPhotos = await wikimediaPhotosService.searchPlacePhotos(
        place.name,
        latitude,
        longitude,
        place.osm_id || null,
      )

      if (wikimediaPhotos.length > 0) {
        console.log(`✅ Found ${wikimediaPhotos.length} photos from Wikimedia Commons`)
        await this.savePhotos(place.id, wikimediaPhotos, 'wikimedia')
        result.success = true
        result.photosFound = wikimediaPhotos.length
        result.source = 'wikimedia'
        await this.markPhotosFetched(place.id, true, hadPhotosBefore)
        return result
      }

      // Fallback to Google Places
      console.log(`2️⃣ No Wikimedia photos found, trying Google Places...`)
      if (latitude === null || longitude === null) {
        console.log(`⚠️ No coordinates available, skipping Google Places search`)
        result.error = 'No coordinates available for Google Places search'
        // Mark as fetched to avoid repeated attempts (no coordinates available)
        await this.markPhotosFetched(place.id, false, hadPhotosBefore)
        return result
      }

      // Check if place already has a Google Places ID
      // Note: google_places_id will be available after running the schema migration
      const existingGooglePlacesId = (place as any).google_places_id || null

      const { photos: googlePhotos, googlePlacesId } = await googlePlacesPhotosService.searchPlacePhotos(
        place.name,
        latitude,
        longitude,
        existingGooglePlacesId,
      )

      if (googlePhotos.length > 0) {
        console.log(`✅ Found ${googlePhotos.length} photos from Google Places`)
        await this.savePhotos(place.id, googlePhotos, 'google_places')
        result.success = true
        result.photosFound = googlePhotos.length
        result.source = 'google_places'

        // Store Google Places ID if we found one and it's different from existing
        if (googlePlacesId && googlePlacesId !== existingGooglePlacesId) {
          console.log(`💾 Storing Google Places ID: ${googlePlacesId}`)
          await updatePlace(place.id, {
            google_places_id: googlePlacesId,
          })
        }

        await this.markPhotosFetched(place.id, true, hadPhotosBefore)
        return result
      }

      // Even if no photos found, store the Google Places ID if we found one
      if (googlePlacesId && googlePlacesId !== existingGooglePlacesId) {
        console.log(`💾 Storing Google Places ID (no photos found): ${googlePlacesId}`)
        await updatePlace(place.id, {
          google_places_id: googlePlacesId,
        })
      }

      console.log(`❌ No photos found from any source`)
      result.error = 'No photos found'
      // Mark as fetched to avoid repeated attempts (even though no photos found)
      await this.markPhotosFetched(place.id, false, hadPhotosBefore)
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`❌ Error fetching photos:`, errorMessage)
      result.error = errorMessage
      // Check if photos existed before in case of error
      const hadPhotosBefore = await hasPlacePhotos(place.id)
      await this.markPhotosFetched(place.id, false, hadPhotosBefore)
      return result
    }
  }

  /**
   * Save photos to database and set the first one as primary
   */
  private async savePhotos(
    placeId: string,
    photos: WikimediaPhoto[] | GooglePlacesPhoto[],
    source: 'wikimedia' | 'google_places',
  ): Promise<void> {
    if (photos.length === 0) {
      return
    }

    try {
      // Convert to database format
      const photosToInsert = photos.map((photo, index) => ({
        place_id: placeId,
        source,
        url: photo.url,
        attribution: photo.attribution,
        is_primary: index === 0, // First photo is primary
      }))

      const { data, error } = await createPlacePhotos(photosToInsert)

      if (error) {
        console.error(`❌ Error saving photos:`, error)
        throw error
      }

      console.log(`✅ Saved ${photosToInsert.length} photos to database`)

      // Ensure first photo is marked as primary (in case of duplicates)
      if (data && data.length > 0) {
        await setPrimaryPhoto(placeId, data[0].id)
      }
    } catch (error) {
      console.error(`❌ Error in savePhotos:`, error)
      throw error
    }
  }

  /**
   * Mark that photos have been fetched for this place
   * If photos were successfully fetched for the first time, bump scores by +2
   */
  private async markPhotosFetched(placeId: string, photosFound: boolean, hadPhotosBefore: boolean): Promise<void> {
    try {
      // Check if this is the first time photos are being fetched
      const isFirstTime = !hadPhotosBefore && photosFound

      let updates: Partial<Place> = {
        photos_fetched_at: new Date().toISOString(),
      }

      // If this is the first time photos are fetched, bump scores
      if (isFirstTime) {
        const { supabase } = await import('../services/supabase.service')
        const { data: place, error: fetchError } = await supabase
          .from('places')
          .select('score, enhancement_score')
          .eq('id', placeId)
          .single()

        if (!fetchError && place) {
          const currentScore = place.score || 0
          const currentEnhancementScore = place.enhancement_score || 0
          const newEnhancementScore = currentEnhancementScore + 2
          const newScore = currentScore + 2

          updates.score = newScore
          updates.enhancement_score = newEnhancementScore

          console.log(
            `📈 Bumped scores: ${currentScore} → ${newScore} (+2 total), ${currentEnhancementScore} → ${newEnhancementScore} (+2 enhancement)`,
          )
        }
      }

      await updatePlace(placeId, updates)
    } catch (error) {
      console.error(`❌ Error marking photos as fetched:`, error)
      // Don't throw - this is not critical
    }
  }

  /**
   * Add delay between API requests (1 second as requested)
   */
  public async delay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

export const photoFetcherService = new PhotoFetcherService()
