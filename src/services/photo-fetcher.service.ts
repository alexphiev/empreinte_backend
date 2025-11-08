import { calculateGeometryCenter } from '../utils/common'
import { createPlacePhotos, setPrimaryPhoto } from '../db/place-photos'
import { updatePlace } from '../db/places'
import { googlePlacesPhotosService, GooglePlacesPhoto } from './google-places-photos.service'
import { wikimediaPhotosService, WikimediaPhoto } from './wikimedia-photos.service'
import { Place } from '../db/places'

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
        await this.markPhotosFetched(place.id)
        return result
      }

      // Fallback to Google Places
      console.log(`2️⃣ No Wikimedia photos found, trying Google Places...`)
      if (latitude === null || longitude === null) {
        console.log(`⚠️ No coordinates available, skipping Google Places search`)
        result.error = 'No coordinates available for Google Places search'
        await this.markPhotosFetched(place.id)
        return result
      }

      const googlePhotos = await googlePlacesPhotosService.searchPlacePhotos(
        place.name,
        latitude,
        longitude,
      )

      if (googlePhotos.length > 0) {
        console.log(`✅ Found ${googlePhotos.length} photos from Google Places`)
        await this.savePhotos(place.id, googlePhotos, 'google_places')
        result.success = true
        result.photosFound = googlePhotos.length
        result.source = 'google_places'
        await this.markPhotosFetched(place.id)
        return result
      }

      console.log(`❌ No photos found from any source`)
      result.error = 'No photos found'
      await this.markPhotosFetched(place.id)
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`❌ Error fetching photos:`, errorMessage)
      result.error = errorMessage
      await this.markPhotosFetched(place.id)
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
   */
  private async markPhotosFetched(placeId: string): Promise<void> {
    try {
      await updatePlace(placeId, {
        photos_fetched_at: new Date().toISOString(),
      })
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

