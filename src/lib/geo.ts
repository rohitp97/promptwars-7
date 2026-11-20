import type { Place } from '../types'

export type FetchFn = (url: string) => Promise<Response>

/** Great-circle distance in km. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371
  const rad = (d: number): number => (d * Math.PI) / 180
  const dLat = rad(bLat - aLat)
  const dLon = rad(bLon - aLon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** India's bounding box (with a margin). The assistant is for Indian cities and CPCB data. */
export const inIndia = (lat: number, lon: number): boolean => lat >= 6 && lat <= 37.5 && lon >= 68 && lon <= 97.5

interface GeoResult {
  name: string
  latitude: number
  longitude: number
  country_code?: string
  admin1?: string
  admin2?: string
}

/**
 * Names differ between the geocoder (GeoNames) and CPCB. Map the common ones onto CPCB's spelling;
 * everything else passes through. Keys are lower-case.
 */
const CPCB_NAME: Record<string, string> = {
  'national capital territory of delhi': 'Delhi',
  'new delhi': 'Delhi',
  gurgaon: 'Gurugram',
  bombay: 'Mumbai',
  calcutta: 'Kolkata',
  bangalore: 'Bengaluru',
  madras: 'Chennai',
  'navi mumbai': 'Navi Mumbai',
  poona: 'Pune',
  'greater noida': 'Greater Noida',
  'gautam buddha nagar': 'Noida',
  'tamil nadu': 'TamilNadu',
  'bengaluru urban': 'Bengaluru',
}

export const toCpcbName = (name: string): string => CPCB_NAME[name.trim().toLowerCase()] ?? name.trim()

/** Search Indian places by name (Open-Meteo geocoding; free, no key, CORS-enabled). */
export async function searchPlaces(query: string, fetchFn: FetchFn = fetch): Promise<Place[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&country=IN`
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`Place search failed (${res.status})`)
  const body = (await res.json()) as { results?: GeoResult[] }
  return (body.results ?? [])
    .filter((r) => (r.country_code ?? 'IN') === 'IN' && inIndia(r.latitude, r.longitude))
    .map((r) => ({
      name: r.name,
      district: r.admin2,
      state: r.admin1 ?? '',
      lat: r.latitude,
      lon: r.longitude,
    }))
}

/** A few of India's most smog-affected cities, so an evaluator can start with one click. */
export const SAMPLE_PLACES: readonly Place[] = [
  { name: 'Delhi', state: 'Delhi', lat: 28.6519, lon: 77.2315 },
  { name: 'Noida', district: 'Gautam Buddha Nagar', state: 'Uttar Pradesh', lat: 28.58, lon: 77.33 },
  { name: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8467, lon: 80.9462 },
  { name: 'Kolkata', state: 'West Bengal', lat: 22.5726, lon: 88.3639 },
  { name: 'Mumbai', state: 'Maharashtra', lat: 19.076, lon: 72.8777 },
  { name: 'Patna', state: 'Bihar', lat: 25.5941, lon: 85.1376 },
]

/**
 * GPS coordinates → city and state (BigDataCloud's free client endpoint: no key, CORS-enabled).
 * Coordinates are rounded to ~1 km before leaving the browser. Falls back to the nearest sample
 * city if the lookup fails, so GPS still works offline from that service.
 */
export async function reverseGeocode(lat: number, lon: number, fetchFn: FetchFn = fetch): Promise<Place> {
  const rLat = Math.round(lat * 100) / 100
  const rLon = Math.round(lon * 100) / 100
  try {
    const res = await fetchFn(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${rLat}&longitude=${rLon}&localityLanguage=en`,
    )
    if (!res.ok) throw new Error(String(res.status))
    const body = (await res.json()) as {
      city?: string
      locality?: string
      principalSubdivision?: string
      countryCode?: string
    }
    const name = body.city || body.locality
    if (body.countryCode === 'IN' && name) return { name, state: body.principalSubdivision ?? '', lat: rLat, lon: rLon }
  } catch {
    // fall through to the offline guess
  }
  return placeFromCoords(rLat, rLon)
}

/**
 * A place for the browser's GPS position when no name lookup is possible: the nearest known city
 * is good enough for a label, and the coordinates themselves drive the station search and forecast.
 */
export function placeFromCoords(lat: number, lon: number, nearest: readonly Place[] = SAMPLE_PLACES): Place {
  const closest = [...nearest].sort(
    (a, b) => haversineKm(lat, lon, a.lat, a.lon) - haversineKm(lat, lon, b.lat, b.lon),
  )[0]
  const near = closest && haversineKm(lat, lon, closest.lat, closest.lon) < 40
  return {
    name: near ? `Near ${closest.name}` : 'Your location',
    state: near ? closest.state : '',
    lat: Math.round(lat * 1000) / 1000,
    lon: Math.round(lon * 1000) / 1000,
  }
}
