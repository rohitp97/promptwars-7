import type { AirSnapshot, ForecastHour, Place, StationReading } from '../types'
import { fetchNearbyStations, SAMPLE_KEY } from './cpcb'
import type { FetchFn } from './geo'
import { istHourKey } from './time'
import { withTimeout } from './withTimeout'

interface OpenMeteoHourly {
  hourly?: { time?: string[]; [k: string]: (number | null)[] | string[] | undefined }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * Hourly PM2.5 / PM10 / NO2 from Open-Meteo's air-quality API (Copernicus CAMS model, refreshed
 * hourly) joined with wind and mixing height from its weather API. Yesterday is included so a
 * 24-hour average exists for "now" (CPCB reports 24-hour averages).
 */
export async function fetchForecast(
  place: Pick<Place, 'lat' | 'lon'>,
  fetchFn: FetchFn = fetch,
): Promise<ForecastHour[]> {
  const common = `latitude=${place.lat}&longitude=${place.lon}&timezone=Asia%2FKolkata&past_days=1&forecast_days=3`
  const [airRes, wxRes] = await Promise.all([
    fetchFn(`https://air-quality-api.open-meteo.com/v1/air-quality?${common}&hourly=pm2_5,pm10,nitrogen_dioxide`),
    fetchFn(`https://api.open-meteo.com/v1/forecast?${common}&hourly=wind_speed_10m,boundary_layer_height`).catch(
      () => null,
    ),
  ])
  if (!airRes.ok) throw new Error(`Air forecast request failed (${airRes.status})`)
  const air = (await airRes.json()) as OpenMeteoHourly
  // Weather only adds the "why"; the forecast still works without it.
  const wx = wxRes?.ok ? ((await wxRes.json()) as OpenMeteoHourly) : {}
  return joinForecast(air, wx)
}

export function joinForecast(air: OpenMeteoHourly, wx: OpenMeteoHourly): ForecastHour[] {
  const times = (air.hourly?.time ?? []) as string[]
  const wxTimes = (wx.hourly?.time ?? []) as string[]
  const wxIndex = new Map(wxTimes.map((t, i) => [t, i]))
  const col = (src: OpenMeteoHourly, key: string, i: number | undefined): number | null =>
    i === undefined ? null : num((src.hourly?.[key] as (number | null)[] | undefined)?.[i])
  const hours: ForecastHour[] = []
  times.forEach((time, i) => {
    const pm25 = col(air, 'pm2_5', i)
    if (pm25 === null) return
    const w = wxIndex.get(time)
    hours.push({
      time,
      pm25,
      pm10: col(air, 'pm10', i) ?? pm25,
      no2: col(air, 'nitrogen_dioxide', i) ?? 0,
      wind: col(wx, 'wind_speed_10m', w) ?? 0,
      mixing: col(wx, 'boundary_layer_height', w),
    })
  })
  return hours
}

/** Mean PM2.5 of the 24 hours ending at `nowKey` (inclusive), or null when fewer than 18 exist. */
export function trailing24hPm25(hours: readonly ForecastHour[], nowKey: string): number | null {
  const end = hours.findIndex((h) => h.time === nowKey)
  if (end < 0) return null
  const window = hours.slice(Math.max(0, end - 23), end + 1)
  if (window.length < 18) return null
  return window.reduce((s, h) => s + h.pm25, 0) / window.length
}

export const CALIBRATION_LIMITS = { min: 0.4, max: 3 } as const

/**
 * Global models smooth out local smog, so the forecast is scaled to agree with what nearby CPCB
 * stations measured over the same 24 hours. Uses the median of the three nearest stations within
 * 25 km that report PM2.5, and clamps the factor so one odd station can't distort the forecast.
 * Returns 1 when there is nothing to compare against.
 */
export function calibrationFactor(stations: readonly StationReading[], modelMean: number | null): number {
  if (modelMean === null || modelMean <= 0) return 1
  const observed = stations
    .filter((s) => s.pm25 !== null && s.distanceKm <= 25)
    .slice(0, 3)
    .map((s) => s.pm25 as number)
    .sort((a, b) => a - b)
  if (observed.length === 0) return 1
  const median = observed[Math.floor(observed.length / 2)]
  const factor = median / modelMean
  const clamped = Math.min(CALIBRATION_LIMITS.max, Math.max(CALIBRATION_LIMITS.min, factor))
  return Math.round(clamped * 100) / 100
}

export function applyCalibration(hours: readonly ForecastHour[], factor: number): ForecastHour[] {
  if (factor === 1) return [...hours]
  return hours.map((h) => ({
    ...h,
    pm25: Math.round(h.pm25 * factor * 10) / 10,
    pm10: Math.round(h.pm10 * factor * 10) / 10,
  }))
}

const TIMEOUT_MS = 20_000

/** The data key: a registered data.gov.in key from the environment, else the public sample key. */
export const dataGovKey = (): string => String(import.meta.env.VITE_DATA_GOV_IN_KEY ?? '').trim() || SAMPLE_KEY

/** Recent snapshots by place, so re-renders and double effects don't re-hit rate-limited APIs. */
const cache = new Map<string, { at: number; promise: Promise<AirSnapshot> }>()
const CACHE_MS = 5 * 60 * 1000

export const clearSnapshotCache = (): void => cache.clear()

/** Cached loadSnapshot: reuses a request for the same place made in the last 5 minutes unless `force`. */
export function getSnapshot(place: Place, force = false): Promise<AirSnapshot> {
  const key = `${place.lat.toFixed(3)},${place.lon.toFixed(3)}`
  const hit = cache.get(key)
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit.promise
  const promise = loadSnapshot(place)
  cache.set(key, { at: Date.now(), promise })
  promise.catch(() => cache.delete(key))
  return promise
}

/**
 * Everything the app knows about the air at a place, fetched live. The forecast is required; CPCB
 * stations are best-effort (the snapshot says why they are missing, and the forecast stays uncalibrated).
 */
export async function loadSnapshot(
  place: Place,
  fetchFn: FetchFn = fetch,
  now: Date = new Date(),
): Promise<AirSnapshot> {
  const [forecastResult, stationResult] = await Promise.allSettled([
    withTimeout(fetchForecast(place, fetchFn), TIMEOUT_MS, 'The forecast service did not answer in time'),
    withTimeout(fetchNearbyStations(place, dataGovKey(), fetchFn), TIMEOUT_MS, 'CPCB did not answer in time'),
  ])
  if (forecastResult.status === 'rejected') throw forecastResult.reason
  const raw = forecastResult.value
  const stations = stationResult.status === 'fulfilled' ? stationResult.value : []
  const nowKey = istHourKey(now)
  const factor = calibrationFactor(stations, trailing24hPm25(raw, nowKey))
  let stationNote: string | undefined
  if (stationResult.status === 'rejected') {
    stationNote = `Live CPCB station data could not be loaded (${(stationResult.reason as Error).message}). The forecast below is the model's, uncorrected.`
  } else if (stations.length === 0) {
    stationNote =
      'No CPCB monitoring station reports within 40 km of this place. The forecast below is the model’s, uncorrected.'
  }
  return {
    place,
    stations,
    hours: applyCalibration(raw, factor),
    calibration: factor,
    fetchedAt: now.toISOString(),
    stationNote,
  }
}
