// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { setRetryDelay } from '../lib/cpcb'
import { applyCalibration, calibrationFactor, joinForecast, loadSnapshot, trailing24hPm25 } from '../lib/forecast'
import type { Place, StationReading } from '../types'
import { fakeFetch, flatHours, hourKeys, istDate } from './fixtures'

beforeAll(() => setRetryDelay(1))

const DAY = '2026-11-20'
const place: Place = { name: 'Delhi', state: 'Delhi', lat: 28.65, lon: 77.23 }
const reading = (pm25: number | null, distanceKm = 3): StationReading => ({
  station: { name: `S${pm25}-${distanceKm}`, city: 'Delhi', state: 'Delhi', lat: 0, lon: 0, updated: '', subIndex: {} },
  distanceKm,
  aqi: 300,
  dominant: 'PM2.5',
  pm25,
})

describe('joinForecast', () => {
  it('joins air and weather by time and skips hours without PM2.5', () => {
    const air = {
      hourly: { time: ['t1', 't2', 't3'], pm2_5: [100, null, 80], pm10: [150, 1, 120], nitrogen_dioxide: [50, 1, 40] },
    }
    const wx = { hourly: { time: ['t3', 't1'], wind_speed_10m: [7, 2], boundary_layer_height: [600, 90] } }
    expect(joinForecast(air, wx)).toEqual([
      { time: 't1', pm25: 100, pm10: 150, no2: 50, wind: 2, mixing: 90 },
      { time: 't3', pm25: 80, pm10: 120, no2: 40, wind: 7, mixing: 600 },
    ])
  })
  it('works without weather', () => {
    const h = joinForecast({ hourly: { time: ['t'], pm2_5: [10] } }, {})
    expect(h[0]).toMatchObject({ pm25: 10, pm10: 10, wind: 0, mixing: null })
  })
})

describe('trailing24hPm25', () => {
  it('averages the 24 hours ending now', () => {
    const hours = flatHours(DAY, 100, 2)
    expect(trailing24hPm25(hours, `2026-11-21T05:00`)).toBe(100)
  })
  it('is null with too little history or an unknown hour', () => {
    expect(trailing24hPm25(flatHours(DAY, 100), `${DAY}T05:00`)).toBeNull()
    expect(trailing24hPm25(flatHours(DAY, 100), 'nope')).toBeNull()
  })
})

describe('calibrationFactor', () => {
  it('uses the median of up to three near stations', () => {
    expect(calibrationFactor([reading(150), reading(300), reading(120)], 100)).toBe(1.5)
  })
  it('ignores far stations and stations without PM2.5', () => {
    expect(calibrationFactor([reading(500, 30), reading(null), reading(200)], 100)).toBe(2)
  })
  it('clamps extreme disagreement', () => {
    expect(calibrationFactor([reading(1000)], 100)).toBe(3)
    expect(calibrationFactor([reading(1)], 100)).toBe(0.4)
  })
  it('is 1 when there is nothing to compare', () => {
    expect(calibrationFactor([], 100)).toBe(1)
    expect(calibrationFactor([reading(100)], null)).toBe(1)
  })
  it('applyCalibration scales PM only', () => {
    const [h] = applyCalibration(flatHours(DAY, 100, 1), 1.5)
    expect(h.pm25).toBe(150)
    expect(h.no2).toBe(40)
    expect(applyCalibration(flatHours(DAY, 100, 1), 1)[0].pm25).toBe(100)
  })
})

const times = hourKeys('2026-11-19', 96)
const airBody = {
  hourly: {
    time: times,
    pm2_5: times.map(() => 100),
    pm10: times.map(() => 160),
    nitrogen_dioxide: times.map(() => 50),
  },
}
const wxBody = {
  hourly: { time: times, wind_speed_10m: times.map(() => 3), boundary_layer_height: times.map(() => 200) },
}
const cpcbRows = ['PM2.5', 'PM10', 'NO2'].map((p, i) => ({
  state: 'Delhi',
  city: 'Delhi',
  station: 'ITO',
  last_update: '20-11-2026 22:00:00',
  latitude: '28.63',
  longitude: '77.24',
  pollutant_id: p,
  avg_value: ['400', '250', '100'][i],
}))

describe('loadSnapshot', () => {
  const now = istDate(DAY, 22)

  it('combines live forecast and stations and calibrates', async () => {
    const { fn } = fakeFetch([
      ['air-quality-api', airBody],
      ['api.open-meteo.com/v1/forecast', wxBody],
      ['data.gov.in', { total: 3, records: cpcbRows }],
    ])
    const snap = await loadSnapshot(place, fn, now)
    expect(snap.stations[0].aqi).toBe(400)
    expect(snap.calibration).toBe(2.5) // station PM2.5 250 µg/m³ vs model 100
    expect(snap.hours[0].pm25).toBe(250)
    expect(snap.stationNote).toBeUndefined()
  })

  it('still works when CPCB is down, and says so', async () => {
    const { fn } = fakeFetch([
      ['air-quality-api', airBody],
      ['api.open-meteo.com/v1/forecast', wxBody],
    ])
    const snap = await loadSnapshot(place, fn, now)
    expect(snap.stations).toEqual([])
    expect(snap.calibration).toBe(1)
    expect(snap.stationNote).toMatch(/could not be loaded/)
  })

  it('notes when no station is nearby', async () => {
    const { fn } = fakeFetch([
      ['air-quality-api', airBody],
      ['api.open-meteo.com/v1/forecast', {}, 500],
      ['data.gov.in', { total: 0, records: [] }],
    ])
    const snap = await loadSnapshot(place, fn, now)
    expect(snap.stationNote).toMatch(/No CPCB monitoring station/)
    expect(snap.hours[0].mixing).toBeNull()
  })

  it('fails when the forecast itself fails', async () => {
    const { fn } = fakeFetch([['air-quality-api', {}, 503]])
    await expect(loadSnapshot(place, fn, now)).rejects.toThrow('503')
  })
})
