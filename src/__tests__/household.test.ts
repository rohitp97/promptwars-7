// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { haversineKm, inIndia, placeFromCoords, reverseGeocode, searchPlaces, toCpcbName } from '../lib/geo'
import { PRESETS, sanitizeActivity, sanitizeHousehold, sanitizeMember } from '../lib/household'
import { parsePlace, parseSaved } from '../lib/storage'
import { fakeFetch } from './fixtures'

describe('sanitizeHousehold', () => {
  it('every preset is already valid (round-trips unchanged)', () => {
    for (const p of PRESETS) expect(sanitizeHousehold(p.household)).toEqual(p.household)
  })
  it('rejects input without people', () => {
    expect(sanitizeHousehold(null)).toBeNull()
    expect(sanitizeHousehold({ members: [] })).toBeNull()
    expect(sanitizeHousehold('members')).toBeNull()
  })
  it('fills defaults: a room, average leakiness', () => {
    const h = sanitizeHousehold({ members: [{}] })!
    expect(h.members[0]).toMatchObject({ name: 'Person 1', age: 'adult', mask: 'none', conditions: [], activities: [] })
    expect(h.home.rooms).toHaveLength(1)
    expect(h.home.leakiness).toBe('average')
  })
  it('caps list lengths', () => {
    const h = sanitizeHousehold({
      members: Array.from({ length: 30 }, () => ({ activities: Array.from({ length: 20 }, () => ({})) })),
    })!
    expect(h.members).toHaveLength(10)
    expect(h.members[0].activities).toHaveLength(6)
  })
  it('activities: travel gets mode/km/trips, leisure does not', () => {
    expect(sanitizeActivity({ kind: 'walk' })).not.toHaveProperty('mode')
    expect(sanitizeActivity({ kind: 'commute' })).toMatchObject({
      mode: 'car_petrol',
      km: 5,
      tripsPerWeek: 5,
      flexible: false,
    })
    expect(sanitizeActivity({ kind: 'errand', mode: 'auto', km: '3' })).toMatchObject({ mode: 'auto', km: 3 })
    expect(sanitizeActivity(7)).toBeNull()
  })
  it('names are trimmed and bounded', () => {
    expect(sanitizeMember({ name: '   ' + 'x'.repeat(100) }, 0)?.name).toHaveLength(24)
    expect(sanitizeMember(null, 0)).toBeNull()
  })
})

describe('storage', () => {
  it('rejects corrupt or tampered data', () => {
    expect(parseSaved('{not json')).toEqual({ place: null, household: null, lang: 'en' })
    expect(parseSaved(null).lang).toBe('en')
    const s = parseSaved(
      JSON.stringify({ place: { name: 'Paris', lat: 48.8, lon: 2.3 }, household: { members: [] }, lang: 'fr' }),
    )
    expect(s).toEqual({ place: null, household: null, lang: 'en' })
  })
  it('keeps valid data', () => {
    const saved = {
      place: { name: 'Delhi', state: 'Delhi', lat: 28.6, lon: 77.2 },
      household: PRESETS[1].household,
      lang: 'hi',
    }
    const s = parseSaved(JSON.stringify(saved))
    expect(s.place?.name).toBe('Delhi')
    expect(s.household?.members[0].name).toBe('Priya')
    expect(s.lang).toBe('hi')
    expect(parsePlace({ name: '', lat: 28, lon: 77 })).toBeNull()
  })
})

describe('geo', () => {
  it('distance and India bounds', () => {
    expect(haversineKm(28.6139, 77.209, 19.076, 72.8777)).toBeCloseTo(1150, -1)
    expect(inIndia(28.6, 77.2)).toBe(true)
    expect(inIndia(51.5, -0.1)).toBe(false)
  })
  it('CPCB name mapping', () => {
    expect(toCpcbName('National Capital Territory of Delhi')).toBe('Delhi')
    expect(toCpcbName('Bangalore')).toBe('Bengaluru')
    expect(toCpcbName(' Patna ')).toBe('Patna')
  })
  it('searches Indian places only', async () => {
    const { fn, calls } = fakeFetch([
      [
        'geocoding-api',
        {
          results: [
            {
              name: 'Noida',
              latitude: 28.58,
              longitude: 77.33,
              country_code: 'IN',
              admin1: 'Uttar Pradesh',
              admin2: 'Gautam Buddha Nagar',
            },
            { name: 'Noidan', latitude: 47.3, longitude: 4.4, country_code: 'FR' },
          ],
        },
      ],
    ])
    const r = await searchPlaces('Noida', fn)
    expect(r).toEqual([
      { name: 'Noida', district: 'Gautam Buddha Nagar', state: 'Uttar Pradesh', lat: 28.58, lon: 77.33 },
    ])
    expect(calls[0]).toContain('country=IN')
    expect(await searchPlaces('a', fn)).toEqual([])
  })
  it('search errors surface', async () => {
    const { fn } = fakeFetch([['geocoding', {}, 500]])
    await expect(searchPlaces('Delhi', fn)).rejects.toThrow('500')
  })
  it('reverse geocodes with rounded coordinates, and falls back offline', async () => {
    const { fn, calls } = fakeFetch([
      ['bigdatacloud', { city: 'Gurugram', principalSubdivision: 'Haryana', countryCode: 'IN' }],
    ])
    expect(await reverseGeocode(28.46789, 77.03123, fn)).toEqual({
      name: 'Gurugram',
      state: 'Haryana',
      lat: 28.47,
      lon: 77.03,
    })
    expect(calls[0]).toContain('latitude=28.47&')
    const offline = await reverseGeocode(28.6, 77.25, fakeFetch([]).fn)
    expect(offline.name).toBe('Near Delhi')
    expect(placeFromCoords(10, 77).name).toBe('Your location')
  })
})
