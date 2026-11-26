import type { Place, Pollutant, Station, StationReading } from '../types'
import { concentrationFromIndex, overallAqi } from './aqi'
import { haversineKm, toCpcbName, type FetchFn } from './geo'
import { parseCpcbTime } from './time'

/**
 * CPCB "Real time Air Quality Index from various locations", published hourly on data.gov.in.
 * Each record is one pollutant at one station; min/avg/max are that pollutant's SUB-INDEX over the
 * last 24 hours (already on the 0-500 scale), so the station AQI is simply the highest avg.
 */
export const CPCB_RESOURCE = '3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69'

/** data.gov.in's public sample key. Works, but returns only 10 records per request. */
export const SAMPLE_KEY = '579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b'

export interface CpcbRecord {
  state?: string
  city?: string
  station?: string
  last_update?: string
  latitude?: string
  longitude?: string
  pollutant_id?: string
  avg_value?: string
}

const POLLUTANTS: readonly Pollutant[] = ['PM2.5', 'PM10', 'NO2', 'SO2', 'CO', 'OZONE', 'NH3']
const isPollutant = (p: string): p is Pollutant => (POLLUTANTS as readonly string[]).includes(p)

/** Group pollutant rows into stations. Rows with 'NA', bad numbers or bad coordinates are skipped. */
export function parseStations(records: readonly CpcbRecord[]): Station[] {
  const byName = new Map<string, Station>()
  for (const r of records) {
    const name = r.station?.trim()
    const lat = Number(r.latitude)
    const lon = Number(r.longitude)
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue
    let station = byName.get(name)
    if (!station) {
      station = {
        name,
        city: r.city?.trim() ?? '',
        state: r.state?.trim() ?? '',
        lat,
        lon,
        updated: parseCpcbTime(r.last_update ?? '') ?? '',
        subIndex: {},
      }
      byName.set(name, station)
    }
    const pollutant = r.pollutant_id?.trim().toUpperCase() ?? ''
    const value = Number(r.avg_value)
    if (isPollutant(pollutant) && r.avg_value !== 'NA' && Number.isFinite(value) && value >= 0) {
      station.subIndex[pollutant] = value
    }
  }
  return [...byName.values()]
}

/** Station → reading for a place: distance, AQI by CPCB's rule, and PM2.5 back in µg/m³. */
export function readStation(station: Station, place: Pick<Place, 'lat' | 'lon'>): StationReading {
  const result = overallAqi(station.subIndex)
  const pmIndex = station.subIndex['PM2.5']
  return {
    station,
    distanceKm: Math.round(haversineKm(place.lat, place.lon, station.lat, station.lon) * 10) / 10,
    aqi: result?.aqi ?? null,
    dominant: result?.dominant ?? null,
    pm25: pmIndex === undefined ? null : Math.round(concentrationFromIndex('PM2.5', pmIndex) ?? 0),
  }
}

/** Stations within reach of the place, nearest first. Stations without a valid AQI are dropped. */
export function nearestReadings(
  stations: readonly Station[],
  place: Pick<Place, 'lat' | 'lon'>,
  maxKm = 40,
  max = 5,
): StationReading[] {
  return stations
    .map((s) => readStation(s, place))
    .filter((r) => r.aqi !== null && r.distanceKm <= maxKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, max)
}

/**
 * The sample key is shared by everyone and rate-limited (a burst of ~8 requests, then refusals),
 * so in sample mode the app makes as few requests as possible and never pages through a big city.
 */
const MAX_PAGES = 5
const CONCURRENCY = 4

type Filters = Partial<Record<'city' | 'state' | 'station' | 'pollutant_id', string>>

export function cpcbUrl(key: string, filters: Filters, offset = 0): string {
  const f = Object.entries(filters)
    .filter(([, v]) => v)
    .map(([k, v]) => `&filters%5B${k}%5D=${encodeURIComponent(v as string)}`)
    .join('')
  return `https://api.data.gov.in/resource/${CPCB_RESOURCE}?api-key=${encodeURIComponent(key)}&format=json&limit=1000&offset=${offset}${f}`
}

async function page(fetchFn: FetchFn, u: string): Promise<{ total: number; records: CpcbRecord[] }> {
  const res = await fetchFn(u)
  if (!res.ok) throw new Error(`CPCB data request failed (${res.status})`)
  const body = (await res.json()) as { total?: number | string; records?: CpcbRecord[] }
  return { total: Number(body.total) || 0, records: Array.isArray(body.records) ? body.records : [] }
}

/**
 * All records for one city or state. A registered key returns up to 1000 rows at once; the sample
 * key returns 10, so the rest are fetched in parallel pages (capped, so a huge state can't run away).
 */
export async function fetchRecords(
  fetchFn: FetchFn,
  key: string,
  filters: Filters,
  maxPages = MAX_PAGES,
): Promise<CpcbRecord[]> {
  const first = await page(fetchFn, cpcbUrl(key, filters))
  const records = [...first.records]
  const step = first.records.length
  if (step === 0 || records.length >= first.total) return records
  const offsets: number[] = []
  for (let o = step; o < first.total && offsets.length < maxPages - 1; o += step) offsets.push(o)
  for (let i = 0; i < offsets.length; i += CONCURRENCY) {
    const batch = await Promise.all(
      offsets.slice(i, i + CONCURRENCY).map((o) => page(fetchFn, cpcbUrl(key, filters, o))),
    )
    for (const b of batch) records.push(...b.records)
  }
  return records
}

/** Stations (location only) nearest first, from any rows. */
function nearestStations(
  records: readonly CpcbRecord[],
  place: Pick<Place, 'lat' | 'lon'>,
  maxKm: number,
  max: number,
): Station[] {
  return parseStations(records)
    .map((s) => ({ s, d: haversineKm(place.lat, place.lon, s.lat, s.lon) }))
    .filter((x) => x.d <= maxKm)
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((x) => x.s)
}

/**
 * Rows for the stations nearest the place within one city/state filter.
 * - Registered key: one request returns every row for the area.
 * - Sample key: list the area's PM2.5 rows only (one row per station, few pages) to find the
 *   nearest three stations, then fetch just those stations' rows — about 5 requests in total.
 */
async function areaReadings(fetchFn: FetchFn, key: string, area: Filters, place: Place): Promise<StationReading[]> {
  if (key !== SAMPLE_KEY) return nearestReadings(parseStations(await fetchRecords(fetchFn, key, area, 2)), place)
  const pmRows = await fetchRecords(fetchFn, key, { ...area, pollutant_id: 'PM2.5' })
  const near = nearestStations(pmRows, place, 40, 3)
  if (near.length === 0) return []
  const rows = await Promise.all(near.map((s) => fetchRecords(fetchFn, key, { ...area, station: s.name }, 1)))
  return nearestReadings(parseStations(rows.flat()), place)
}

/**
 * Live CPCB readings near a place. Tries the town, then its district, then the whole state, and
 * stops at the first that has a station within reach.
 */
export async function fetchNearbyStations(
  place: Place,
  key: string,
  fetchFn: FetchFn = fetch,
): Promise<StationReading[]> {
  const attempts: ['city' | 'state', string][] = []
  const seen = new Set<string>()
  const add = (filter: 'city' | 'state', raw: string | undefined): void => {
    const value = raw ? toCpcbName(raw.replace(/^Near /, '')) : ''
    if (value && !seen.has(filter + value)) {
      seen.add(filter + value)
      attempts.push([filter, value])
    }
  }
  add('city', place.name)
  add('city', place.district)
  add('state', place.state)

  const search = async (): Promise<StationReading[]> => {
    for (const [filter, value] of attempts) {
      const readings = await withRetry(() => areaReadings(fetchFn, key, { [filter]: value }, place), retryDelayMs)
      if (readings.length > 0) return readings
    }
    return []
  }
  const first = await search()
  if (first.length > 0) return first
  // CPCB republishes the whole table every hour, and for a minute or so a city can come back with
  // few or no rows (seen live: Delhi returned nothing at 21:30 IST, then 392 rows moments later).
  // One delayed second pass avoids showing "no station" for a city that has dozens.
  await new Promise((r) => setTimeout(r, retryDelayMs))
  return search()
}

/** The shared sample key is refused for a few seconds after a burst; one patient retry usually gets through. */
let retryDelayMs = 2500
export const setRetryDelay = (ms: number): void => {
  retryDelayMs = ms
}

async function withRetry<T>(task: () => Promise<T>, delayMs: number): Promise<T> {
  try {
    return await task()
  } catch {
    await new Promise((r) => setTimeout(r, delayMs))
    return task()
  }
}
