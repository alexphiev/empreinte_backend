/**
 * Geometry utilities for coordinate manipulation and GeoJSON operations
 */

export interface Point {
  lat: number
  lon: number
}

export interface BoundingBox {
  south: number
  west: number
  north: number
  east: number
}

/**
 * Douglas-Peucker algorithm for line simplification
 * Reduces the number of points in a polyline while preserving its general shape
 */
export function simplifyCoordinates(
  coordinates: Array<[number, number]>,
  tolerance: number = 0.001,
): Array<[number, number]> {
  if (coordinates.length <= 2) return coordinates

  const simplifyDouglasPeucker = (points: Array<[number, number]>, tolerance: number): Array<[number, number]> => {
    if (points.length <= 2) return points

    // Find the point with maximum distance from line between first and last
    let maxDistance = 0
    let maxIndex = 0
    const start = points[0]
    const end = points[points.length - 1]

    for (let i = 1; i < points.length - 1; i++) {
      const distance = perpendicularDistance(points[i], start, end)
      if (distance > maxDistance) {
        maxDistance = distance
        maxIndex = i
      }
    }

    // If max distance is greater than tolerance, recursively simplify
    if (maxDistance > tolerance) {
      const left = simplifyDouglasPeucker(points.slice(0, maxIndex + 1), tolerance)
      const right = simplifyDouglasPeucker(points.slice(maxIndex), tolerance)
      return [...left.slice(0, -1), ...right]
    }

    return [start, end]
  }

  return simplifyDouglasPeucker(coordinates, tolerance)
}

/**
 * Calculate perpendicular distance from a point to a line segment
 */
export function perpendicularDistance(
  point: [number, number],
  lineStart: [number, number],
  lineEnd: [number, number],
): number {
  const [x, y] = point
  const [x1, y1] = lineStart
  const [x2, y2] = lineEnd

  const A = x - x1
  const B = y - y1
  const C = x2 - x1
  const D = y2 - y1

  const dot = A * C + B * D
  const lenSq = C * C + D * D

  if (lenSq === 0) return Math.sqrt(A * A + B * B)

  const param = dot / lenSq
  let xx, yy

  if (param < 0) {
    xx = x1
    yy = y1
  } else if (param > 1) {
    xx = x2
    yy = y2
  } else {
    xx = x1 + param * C
    yy = y1 + param * D
  }

  const dx = x - xx
  const dy = y - yy
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Order ways to form a continuous path
 * Used for connecting multiple way segments in OSM relations
 */
export function orderWays(
  ways: Array<{ coordinates: Array<[number, number]> }>,
): Array<{ coordinates: Array<[number, number]> }> {
  if (ways.length <= 1) return ways

  const ordered = [ways[0]]
  const remaining = ways.slice(1)

  while (remaining.length > 0) {
    const lastWay = ordered[ordered.length - 1]
    const lastPoint = lastWay.coordinates[lastWay.coordinates.length - 1]

    // Find next way that connects to the end of the current way
    const nextIndex = remaining.findIndex((way) => {
      const firstPoint = way.coordinates[0]
      return firstPoint[0] === lastPoint[0] && firstPoint[1] === lastPoint[1]
    })

    if (nextIndex >= 0) {
      ordered.push(remaining.splice(nextIndex, 1)[0])
    } else {
      // Try to find a way that connects if we reverse it
      const reverseIndex = remaining.findIndex((way) => {
        const lastPointOfWay = way.coordinates[way.coordinates.length - 1]
        return lastPointOfWay[0] === lastPoint[0] && lastPointOfWay[1] === lastPoint[1]
      })

      if (reverseIndex >= 0) {
        const wayToReverse = remaining.splice(reverseIndex, 1)[0]
        wayToReverse.coordinates = wayToReverse.coordinates.reverse()
        ordered.push(wayToReverse)
      } else {
        console.warn(`⚠️ Could not find connecting way, ${remaining.length} ways remaining unconnected`)
        break
      }
    }
  }

  return ordered
}

/**
 * Calculate the center point of a coordinate array
 */
export function calculateCenterFromCoordinates(coordinates: Array<Point>): Point | null {
  if (!coordinates || coordinates.length === 0) return null

  try {
    const lats = coordinates.map((p) => p.lat).filter((lat) => typeof lat === 'number' && !isNaN(lat))
    const lons = coordinates.map((p) => p.lon).filter((lon) => typeof lon === 'number' && !isNaN(lon))

    if (lats.length === 0 || lons.length === 0) return null

    return {
      lat: (Math.min(...lats) + Math.max(...lats)) / 2,
      lon: (Math.min(...lons) + Math.max(...lons)) / 2,
    }
  } catch (error) {
    console.warn('⚠️ Failed to calculate center from coordinates:', error)
    return null
  }
}

/**
 * Check if a polygon is closed (first and last points are the same)
 */
export function isClosedPolygon(coordinates: Array<[number, number]>): boolean {
  if (coordinates.length < 4) return false

  const first = coordinates[0]
  const last = coordinates[coordinates.length - 1]

  return first[0] === last[0] && first[1] === last[1]
}

/**
 * Close a polygon by adding the first point to the end if not already closed
 */
export function closePolygon(coordinates: Array<[number, number]>): Array<[number, number]> {
  if (coordinates.length < 3) return coordinates

  if (!isClosedPolygon(coordinates)) {
    return [...coordinates, coordinates[0]]
  }

  return coordinates
}

/**
 * Create a PostGIS POINT string from coordinates
 */
export function createPointWKT(lon: number, lat: number): string {
  return `POINT(${lon} ${lat})`
}

/**
 * Validate coordinate values
 */
export function isValidCoordinate(lat: number, lon: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    !isNaN(lat) &&
    !isNaN(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  )
}

/**
 * Calculate distance between two points using Haversine formula
 */
export function calculateDistance(point1: Point, point2: Point): number {
  const R = 6371 // Earth's radius in kilometers
  const dLat = ((point2.lat - point1.lat) * Math.PI) / 180
  const dLon = ((point2.lon - point1.lon) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((point1.lat * Math.PI) / 180) *
      Math.cos((point2.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}
