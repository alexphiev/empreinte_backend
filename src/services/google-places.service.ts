export interface GooglePlacesPhoto {
  url: string
  attribution: string
  width?: number
  height?: number
}

export class GooglePlacesPhotosService {
  private readonly apiKey: string

  constructor() {
    if (!process.env.GOOGLE_PLACES_API_KEY) {
      throw new Error('GOOGLE_PLACES_API_KEY environment variable is required')
    }
    this.apiKey = process.env.GOOGLE_PLACES_API_KEY
  }

  /**
   * Search for a place using Google Places API Text Search
   * Returns place_id if found
   */
  public async findPlaceId(
    placeName: string,
    latitude: number | null,
    longitude: number | null,
  ): Promise<string | null> {
    try {
      console.log(`🔍 Searching Google Places for: ${placeName}`)

      const baseUrl = 'https://places.googleapis.com/v1/places:searchText'
      const body: any = {
        textQuery: placeName,
        maxResultCount: 1,
      }

      // Add location bias if coordinates available
      if (latitude !== null && longitude !== null) {
        body.locationBias = {
          circle: {
            center: {
              latitude,
              longitude,
            },
            radius: 5000.0, // 5km radius
          },
        }
      }

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Google Places API error: ${response.status} - ${errorText}`)
      }

      const data = (await response.json()) as {
        places?: Array<{
          id: string
          displayName?: { text: string }
        }>
      }

      if (data.places && data.places.length > 0) {
        const placeId = data.places[0].id
        console.log(`✅ Found Google Place ID: ${placeId}`)
        return placeId
      }

      console.log(`❌ No Google Place found for: ${placeName}`)
      return null
    } catch (error) {
      console.error(`❌ Error searching Google Places:`, error)
      return null
    }
  }

  /**
   * Get photos for a place using Google Places API
   */
  public async getPlacePhotos(placeId: string): Promise<GooglePlacesPhoto[]> {
    try {
      console.log(`📸 Fetching photos for Google Place ID: ${placeId}`)

      const baseUrl = `https://places.googleapis.com/v1/places/${placeId}`

      const response = await fetch(baseUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': 'photos',
        },
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Google Places API error: ${response.status} - ${errorText}`)
      }

      const data = (await response.json()) as {
        photos?: Array<{
          name: string
          widthPx?: number
          heightPx?: number
          authorAttributions?: Array<{
            displayName?: string
            uri?: string
          }>
        }>
      }

      if (!data.photos || data.photos.length === 0) {
        console.log(`❌ No photos found for Google Place ID: ${placeId}`)
        return []
      }

      const photos: GooglePlacesPhoto[] = []

      // Get up to 5 photos
      const photosToFetch = data.photos.slice(0, 5)

      for (const photo of photosToFetch) {
        // Build photo URL using the photo name
        // Format: https://places.googleapis.com/v1/{photo.name}/media?maxHeightPx=800&maxWidthPx=800&key={API_KEY}
        const photoUrl = `https://places.googleapis.com/v1/${photo.name}/media?maxHeightPx=800&maxWidthPx=800&key=${this.apiKey}`

        // Build attribution
        const author = photo.authorAttributions?.[0]
        const attribution = author?.displayName
          ? `Photo by ${author.displayName} via Google Places`
          : 'Photo via Google Places'

        photos.push({
          url: photoUrl,
          attribution,
          width: photo.widthPx,
          height: photo.heightPx,
        })
      }

      console.log(`✅ Found ${photos.length} photos from Google Places`)
      return photos
    } catch (error) {
      console.error(`❌ Error fetching Google Places photos:`, error)
      return []
    }
  }

  /**
   * Search for photos of a place by name and coordinates
   * Returns photos and the Google Places ID (if found)
   */
  public async searchPlacePhotos(
    placeName: string,
    latitude: number | null,
    longitude: number | null,
    existingGooglePlacesId?: string | null,
  ): Promise<{ photos: GooglePlacesPhoto[]; googlePlacesId: string | null }> {
    // Use existing Google Places ID if available
    let placeId: string | null = existingGooglePlacesId || null

    // If no existing ID, search for it
    if (!placeId) {
      placeId = await this.findPlaceId(placeName, latitude, longitude)
    } else {
      console.log(`✅ Using existing Google Places ID: ${placeId}`)
    }

    if (!placeId) {
      return { photos: [], googlePlacesId: null }
    }

    const photos = await this.getPlacePhotos(placeId)
    return { photos, googlePlacesId: placeId }
  }

  /**
   * Get ratings for a place using Google Places API
   */
  public async getPlaceRatings(placeId: string): Promise<{ rating: number | null; ratingCount: number | null }> {
    try {
      console.log(`⭐ Fetching ratings for Google Place ID: ${placeId}`)

      const baseUrl = `https://places.googleapis.com/v1/places/${placeId}`

      const response = await fetch(baseUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': 'rating,userRatingCount',
        },
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Google Places API error: ${response.status} - ${errorText}`)
      }

      const data = (await response.json()) as {
        rating?: number
        userRatingCount?: number
      }

      const rating = data.rating ?? null
      const ratingCount = data.userRatingCount ?? null

      if (rating !== null) {
        console.log(`✅ Found rating: ${rating} (${ratingCount || 0} reviews)`)
      } else {
        console.log(`❌ No rating found for Google Place ID: ${placeId}`)
      }

      return { rating, ratingCount }
    } catch (error) {
      console.error(`❌ Error fetching Google Places ratings:`, error)
      return { rating: null, ratingCount: null }
    }
  }

  /**
   * Search for ratings of a place by name and coordinates
   * Returns ratings and the Google Places ID (if found)
   */
  public async searchPlaceRatings(
    placeName: string,
    latitude: number | null,
    longitude: number | null,
    existingGooglePlacesId?: string | null,
  ): Promise<{ rating: number | null; ratingCount: number | null; googlePlacesId: string | null }> {
    // Use existing Google Places ID if available
    let placeId: string | null = existingGooglePlacesId || null

    // If no existing ID, search for it
    if (!placeId) {
      placeId = await this.findPlaceId(placeName, latitude, longitude)
    } else {
      console.log(`✅ Using existing Google Places ID: ${placeId}`)
    }

    if (!placeId) {
      return { rating: null, ratingCount: null, googlePlacesId: null }
    }

    const { rating, ratingCount } = await this.getPlaceRatings(placeId)
    return { rating, ratingCount, googlePlacesId: placeId }
  }
}

export const googlePlacesPhotosService = new GooglePlacesPhotosService()
export const googlePlacesService = googlePlacesPhotosService
