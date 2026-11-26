// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import {
  cpcbUrl,
  fetchNearbyStations,
  nearestReadings,
  parseStations,
  readStation,
  SAMPLE_KEY,
  setRetryDelay,
  type CpcbRecord,
} from '../lib/cpcb'
import type { Place } from '../types'
import { fakeFetch } from './fixtures'

beforeAll(() => setRetryDelay(1))

const row = (
  station: string,
  pollutant: string,
  avg: string,
  lat = '28.62',
  lon = '77.19',
  city = 'Delhi',
): CpcbRecord => ({
  state: 'Delhi',
  city,
  station,
  last_update: '20-11-2026 22:00:00',
  latitude: lat,
  longitude: lon,
  pollutant_id: pollutant,
  avg_value: avg,
})

const talkatora = [
  row('Talkatora', 'PM2.5', '323'),
  row('Talkatora', 'PM10', '215'),
  row('Talkatora', 'NO2', '104'),
  row('Talkatora', 'NH3', 'NA'),
]
const narela = [
  row('Narela', 'PM2.5', '280', '28.85', '77.09'),
  row('Narela', 'PM10', '188', '28.85', '77.09'),
  row('Narela', 'SO2', '11', '28.85', '77.09'),
]
const delhi: Place = { name: 'Delhi', state: 'Delhi', lat: 28.6519, lon: 77.2315 }

describe('parseStations', () => {
  it('groups pollutant rows into stations and skips NA', () => {
    const [s] = parseStations(talkatora)
    expect(s.name).toBe('Talkatora')
    expect(s.subIndex).toEqual({ 'PM2.5': 323, PM10: 215, NO2: 104 })
    expect(s.updated).toBe('2026-11-20T22:00')
  })
  it('drops rows with bad coordinates or unknown pollutants', () => {
    expect(parseStations([row('X', 'PM2.5', '100', 'abc')])).toEqual([])
    expect(parseStations([row('Y', 'BENZENE', '5')])[0].subIndex).toEqual({})
  })
})

describe('readStation / nearestReadings', () => {
  it('computes AQI, distance and PM2.5 concentration', () => {
    const r = readStation(parseStations(talkatora)[0], delhi)
    expect(r.aqi).toBe(323)
    expect(r.dominant).toBe('PM2.5')
    expect(r.pm25).toBe(150)
    expect(r.distanceKm).toBeGreaterThan(3)
    expect(r.distanceKm).toBeLessThan(6)
  })
  it('sorts by distance, drops invalid AQI and far stations', () => {
    const stations = parseStations([
      ...narela,
      ...talkatora,
      row('Far', 'PM2.5', '100', '19.0', '72.8'),
      row('Thin', 'PM2.5', '90'),
    ])
    const near = nearestReadings(stations, delhi)
    expect(near.map((r) => r.station.name)).toEqual(['Talkatora', 'Narela'])
  })
})

describe('cpcbUrl', () => {
  it('encodes filters and the key', () => {
    const u = cpcbUrl('k y', { city: 'Navi Mumbai', pollutant_id: 'PM2.5' }, 20)
    expect(u).toContain('api-key=k%20y')
    expect(u).toContain('filters%5Bcity%5D=Navi%20Mumbai')
    expect(u).toContain('filters%5Bpollutant_id%5D=PM2.5')
    expect(u).toContain('offset=20')
  })
})

describe('fetchNearbyStations', () => {
  it('uses one request with a registered key', async () => {
    const { fn, calls } = fakeFetch([['filters%5Bcity%5D=Delhi', { total: 7, records: [...talkatora, ...narela] }]])
    const readings = await fetchNearbyStations(delhi, 'registered-key', fn)
    expect(calls).toHaveLength(1)
    expect(readings[0].station.name).toBe('Talkatora')
  })

  it('with the sample key lists PM2.5 rows, then fetches only the nearest stations', async () => {
    const { fn, calls } = fakeFetch([
      ['filters%5Bpollutant_id%5D=PM2.5', { total: 2, records: [talkatora[0], narela[0]] }],
      ['filters%5Bstation%5D=Talkatora', { total: 4, records: talkatora }],
      ['filters%5Bstation%5D=Narela', { total: 3, records: narela }],
    ])
    const readings = await fetchNearbyStations(delhi, SAMPLE_KEY, fn)
    expect(readings.map((r) => r.aqi)).toEqual([323, 280])
    expect(calls.length).toBeLessThanOrEqual(8)
  })

  it('pages through a large listing but caps the number of pages', async () => {
    const page = Array.from({ length: 10 }, (_, i) => row(`S${i}`, 'PM2.5', '200', String(28.6 + i / 100)))
    const { fn, calls } = fakeFetch([
      ['pollutant_id', { total: 500, records: page }],
      ['filters%5Bstation%5D', { total: 0, records: [] }],
    ])
    await fetchNearbyStations(delhi, SAMPLE_KEY, fn)
    // Five pages for the town per pass (no station found → one delayed second pass), never the full 50.
    expect(calls.filter((c) => c.includes('pollutant_id') && c.includes('city')).length).toBe(10)
  })

  it('falls back from the town to the state', async () => {
    const noida: Place = { name: 'Sector 62', state: 'Uttar Pradesh', lat: 28.62, lon: 77.36 }
    const { fn, calls } = fakeFetch([
      ['filters%5Bcity%5D=Sector', { total: 0, records: [] }],
      [
        'filters%5Bstate%5D=Uttar',
        { total: 3, records: narela.map((r) => ({ ...r, latitude: '28.6', longitude: '77.37' })) },
      ],
    ])
    const readings = await fetchNearbyStations(noida, 'k', fn)
    expect(readings).toHaveLength(1)
    expect(calls.some((c) => c.includes('state'))).toBe(true)
  })

  it('maps geocoder names onto CPCB spellings', async () => {
    const { fn, calls } = fakeFetch([[/./, { total: 0, records: [] }]])
    await fetchNearbyStations({ name: 'Gurgaon', state: 'Haryana', lat: 28.46, lon: 77.03 }, 'k', fn)
    expect(calls[0]).toContain('Gurugram')
  })

  it('retries once after a refusal (sample key rate limit)', async () => {
    let n = 0
    const fn = async (): Promise<Response> => {
      n++
      if (n === 1) throw new TypeError('Failed to fetch')
      return new Response(JSON.stringify({ total: 7, records: [...talkatora, ...narela] }))
    }
    const readings = await fetchNearbyStations(delhi, 'k', fn)
    expect(readings).toHaveLength(2)
  })

  it('searches again when CPCB is mid-refresh and returns no rows', async () => {
    let n = 0
    const fn = async (): Promise<Response> => {
      n++
      const records = n <= 2 ? [] : [...talkatora, ...narela] // city + state empty, then data is back
      return new Response(JSON.stringify({ total: records.length, records }))
    }
    const readings = await fetchNearbyStations(delhi, 'k', fn)
    expect(readings.map((r) => r.station.name)).toEqual(['Talkatora', 'Narela'])
  })

  it('throws on HTTP errors after the retry', async () => {
    const { fn } = fakeFetch([[/./, {}, 403]])
    await expect(fetchNearbyStations(delhi, 'k', fn)).rejects.toThrow('403')
  })
})
