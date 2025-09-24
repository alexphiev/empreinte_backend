import fs from 'fs/promises'
import path from 'path'
import { supabase } from '../services/supabase.service'

export interface ProcessStats {
  processedCount: number
  insertedCount: number
  duplicateCount: number
  errorCount: number
  startTime: Date
}

export interface CacheOptions {
  baseDir?: string
  subDir?: string
}

export interface BatchUpsertOptions {
  tableName: string
  conflictColumn: string
  batchSize?: number
}

/**
 * Creates a new ProcessStats object with default values
 */
export function createProcessStats(): ProcessStats {
  return {
    processedCount: 0,
    insertedCount: 0,
    duplicateCount: 0,
    errorCount: 0,
    startTime: new Date(),
  }
}

/**
 * Prints progress statistics in a standardized format
 */
export function printProgress(stats: ProcessStats, context?: string): void {
  const runtime = Math.floor((Date.now() - stats.startTime.getTime()) / 1000)
  console.log('\n📊 --- Progress Report ---')
  if (context) {
    console.log(`🎯 Context: ${context}`)
  }
  console.log(`⏱️  Runtime: ${runtime}s`)
  console.log(`📝 Processed: ${stats.processedCount}`)
  console.log(`✅ Inserted: ${stats.insertedCount}`)
  console.log(`⚠️  Duplicates: ${stats.duplicateCount}`)
  console.log(`❌ Errors: ${stats.errorCount}`)
  console.log('-------------------------\n')
}

/**
 * Ensures a cache directory exists
 */
export async function ensureCacheDir(options: CacheOptions = {}): Promise<string> {
  const { baseDir = 'temp', subDir } = options
  const cacheDir = subDir ? path.join(process.cwd(), baseDir, subDir) : path.join(process.cwd(), baseDir)

  try {
    await fs.mkdir(cacheDir, { recursive: true })
    return cacheDir
  } catch (error) {
    console.warn('⚠️ Could not create cache directory:', error)
    throw error
  }
}

/**
 * Performs batch upsert operations with error handling and progress tracking
 */
export async function batchUpsert<T>(items: T[], options: BatchUpsertOptions, stats: ProcessStats): Promise<void> {
  const { tableName, conflictColumn, batchSize = 100 } = options

  if (items.length === 0) return

  console.log(`🔄 Upserting ${items.length} items to ${tableName} in batches of ${batchSize}...`)

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)

    try {
      const { error } = await supabase.from(tableName).upsert(batch, {
        onConflict: conflictColumn,
      })

      if (error) {
        console.error(`❌ Error upserting batch ${Math.floor(i / batchSize) + 1}:`, error.message)
        stats.errorCount += batch.length
        throw error
      }

      console.log(`✅ Upserted batch ${Math.floor(i / batchSize) + 1}: ${batch.length} items`)
      stats.insertedCount += batch.length

      // Progress reporting
      console.log(`📊 Progress: ${Math.min(i + batchSize, items.length)}/${items.length} items processed`)
    } catch (error) {
      console.error(`❌ Error upserting batch ${Math.floor(i / batchSize) + 1}:`, error)
      stats.errorCount += batch.length
      throw error
    }
  }
}

/**
 * Calculates the center point of a geometry
 */
export function calculateGeometryCenter(geometry: any): { lat: number; lon: number } | null {
  if (!geometry) return null

  try {
    if (geometry.type === 'Point') {
      return {
        lon: geometry.coordinates[0],
        lat: geometry.coordinates[1],
      }
    } else if (geometry.type === 'Polygon' && geometry.coordinates[0]) {
      // Calculate centroid of polygon
      const coords = geometry.coordinates[0]
      const lons = coords
        .map((coord: number[]) => coord[0])
        .filter((lon: number) => typeof lon === 'number' && !isNaN(lon))
      const lats = coords
        .map((coord: number[]) => coord[1])
        .filter((lat: number) => typeof lat === 'number' && !isNaN(lat))

      if (lons.length > 0 && lats.length > 0) {
        return {
          lon: (Math.min(...lons) + Math.max(...lons)) / 2,
          lat: (Math.min(...lats) + Math.max(...lats)) / 2,
        }
      }
    } else if (geometry.type === 'MultiPolygon' && geometry.coordinates[0]) {
      // Use first polygon for center calculation
      const coords = geometry.coordinates[0][0]
      const lons = coords
        .map((coord: number[]) => coord[0])
        .filter((lon: number) => typeof lon === 'number' && !isNaN(lon))
      const lats = coords
        .map((coord: number[]) => coord[1])
        .filter((lat: number) => typeof lat === 'number' && !isNaN(lat))

      if (lons.length > 0 && lats.length > 0) {
        return {
          lon: (Math.min(...lons) + Math.max(...lons)) / 2,
          lat: (Math.min(...lats) + Math.max(...lats)) / 2,
        }
      }
    } else if (geometry.type === 'LineString' && geometry.coordinates.length > 0) {
      // Calculate center of line string
      const coords = geometry.coordinates
      const lons = coords
        .map((coord: number[]) => coord[0])
        .filter((lon: number) => typeof lon === 'number' && !isNaN(lon))
      const lats = coords
        .map((coord: number[]) => coord[1])
        .filter((lat: number) => typeof lat === 'number' && !isNaN(lat))

      if (lons.length > 0 && lats.length > 0) {
        return {
          lon: (Math.min(...lons) + Math.max(...lons)) / 2,
          lat: (Math.min(...lats) + Math.max(...lats)) / 2,
        }
      }
    }
  } catch (error) {
    console.warn(`⚠️ Failed to calculate geometry center:`, error)
  }

  return null
}

/**
 * Creates a standardized place object for database insertion
 */
export interface CreatePlaceOptions {
  source: string
  sourceId: string
  name: string
  type: string
  location?: string | null
  geometry?: any
  region?: string | null
  country?: string
  description?: string | null
  quality?: number
  metadata?: any
}

export function createPlaceObject(options: CreatePlaceOptions): any {
  const {
    source,
    sourceId,
    name,
    type,
    location,
    geometry,
    region,
    country = 'France',
    description,
    quality = 1,
    metadata,
  } = options

  return {
    source,
    source_id: sourceId,
    name: name.trim(),
    type,
    location,
    geometry,
    region,
    country,
    description,
    quality,
    metadata,
  }
}

/**
 * Validates that required fields are present
 */
export function validatePlace(place: any): boolean {
  if (!place.name || place.name.trim() === '') {
    return false
  }

  if (!place.location && !place.geometry) {
    return false
  }

  return true
}

/**
 * Delay utility for rate limiting
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Format runtime duration in human readable format
 */
export function formatDuration(startTime: Date): string {
  const runtime = Math.floor((Date.now() - startTime.getTime()) / 1000)
  const minutes = Math.floor(runtime / 60)
  const seconds = runtime % 60

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}
