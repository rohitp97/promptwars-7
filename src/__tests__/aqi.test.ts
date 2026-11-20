// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { category, concentrationFromIndex, hourlyLevel, overallAqi, subIndex } from '../lib/aqi'
import type { Pollutant } from '../types'

describe('subIndex (CPCB National AQI breakpoints)', () => {
  it.each([
    ['PM2.5', 0, 0],
    ['PM2.5', 30, 50],
    ['PM2.5', 60, 100],
    ['PM2.5', 90, 200],
    ['PM2.5', 120, 300],
    ['PM2.5', 250, 400],
    ['PM2.5', 380, 500],
    ['PM10', 100, 100],
    ['PM10', 250, 200],
    ['PM10', 430, 400],
    ['NO2', 180, 200],
    ['CO', 2, 100],
    ['OZONE', 168, 200],
  ] as [Pollutant, number, number][])('%s %s → %s', (p, c, expected) => {
    expect(subIndex(p, c)).toBe(expected)
  })

  it('interpolates inside a band', () => {
    expect(subIndex('PM2.5', 75)).toBe(150) // halfway through 60-90 → 100-200
  })

  it('caps at 500 above the top band', () => {
    expect(subIndex('PM2.5', 999)).toBe(500)
  })

  it('treats negative and non-finite input as missing', () => {
    expect(subIndex('PM2.5', -1)).toBeNull()
    expect(subIndex('PM2.5', Number.NaN)).toBeNull()
  })

  it('is monotonic', () => {
    let last = -1
    for (let c = 0; c <= 400; c += 5) {
      const v = subIndex('PM2.5', c)!
      expect(v).toBeGreaterThanOrEqual(last)
      last = v
    }
  })
})

describe('concentrationFromIndex', () => {
  it('inverts subIndex', () => {
    for (const c of [12, 45, 75, 110, 200, 300]) {
      expect(Math.abs(concentrationFromIndex('PM2.5', subIndex('PM2.5', c)!)! - c)).toBeLessThan(1)
    }
  })
  it('reads CPCB sub-indices back into µg/m³', () => {
    expect(concentrationFromIndex('PM2.5', 323)).toBeCloseTo(149.9, 1)
    expect(concentrationFromIndex('PM2.5', -5)).toBeNull()
    expect(concentrationFromIndex('PM2.5', 600)).toBe(380)
  })
})

describe('overallAqi', () => {
  it('is the highest sub-index and names the pollutant', () => {
    expect(overallAqi({ 'PM2.5': 323, PM10: 215, NO2: 104 })).toEqual({ aqi: 323, dominant: 'PM2.5' })
  })
  it('needs at least three pollutants (CPCB rule)', () => {
    expect(overallAqi({ 'PM2.5': 300, NO2: 100 })).toBeNull()
  })
  it('needs PM2.5 or PM10 among them', () => {
    expect(overallAqi({ NO2: 100, SO2: 20, CO: 80 })).toBeNull()
  })
})

describe('category', () => {
  it.each([
    [0, 'Good'],
    [50, 'Good'],
    [51, 'Satisfactory'],
    [101, 'Moderate'],
    [201, 'Poor'],
    [301, 'Very Poor'],
    [401, 'Severe'],
    [500, 'Severe'],
  ])('%i → %s', (aqi, label) => {
    expect(category(aqi).label).toBe(label)
  })
  it('hourlyLevel is the PM2.5 sub-index', () => {
    expect(hourlyLevel(60)).toBe(100)
  })
})
