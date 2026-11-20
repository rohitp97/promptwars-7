import type { Pollutant } from '../types'

/**
 * India's National Air Quality Index (CPCB, 2014). Each pollutant's concentration is mapped onto a
 * 0-500 sub-index by linear interpolation inside its breakpoint band; the AQI is the highest
 * sub-index. Bands are written with shared edges ([0,30],[30,60]…) so the curve is continuous.
 * Units: µg/m³, except CO in mg/m³. The top band is open-ended in the standard; it is capped here
 * at the value CPCB's own calculator uses so a sub-index never exceeds 500.
 */
type Band = readonly [cLo: number, cHi: number, iLo: number, iHi: number]

const BANDS: Record<Pollutant, readonly Band[]> = {
  'PM2.5': [
    [0, 30, 0, 50],
    [30, 60, 50, 100],
    [60, 90, 100, 200],
    [90, 120, 200, 300],
    [120, 250, 300, 400],
    [250, 380, 400, 500],
  ],
  PM10: [
    [0, 50, 0, 50],
    [50, 100, 50, 100],
    [100, 250, 100, 200],
    [250, 350, 200, 300],
    [350, 430, 300, 400],
    [430, 510, 400, 500],
  ],
  NO2: [
    [0, 40, 0, 50],
    [40, 80, 50, 100],
    [80, 180, 100, 200],
    [180, 280, 200, 300],
    [280, 400, 300, 400],
    [400, 800, 400, 500],
  ],
  OZONE: [
    [0, 50, 0, 50],
    [50, 100, 50, 100],
    [100, 168, 100, 200],
    [168, 208, 200, 300],
    [208, 748, 300, 400],
    [748, 1000, 400, 500],
  ],
  CO: [
    [0, 1, 0, 50],
    [1, 2, 50, 100],
    [2, 10, 100, 200],
    [10, 17, 200, 300],
    [17, 34, 300, 400],
    [34, 50, 400, 500],
  ],
  SO2: [
    [0, 40, 0, 50],
    [40, 80, 50, 100],
    [80, 380, 100, 200],
    [380, 800, 200, 300],
    [800, 1600, 300, 400],
    [1600, 2400, 400, 500],
  ],
  NH3: [
    [0, 200, 0, 50],
    [200, 400, 50, 100],
    [400, 800, 100, 200],
    [800, 1200, 200, 300],
    [1200, 1800, 300, 400],
    [1800, 2400, 400, 500],
  ],
}

const round = (n: number): number => Math.round(n)

/** Concentration → sub-index (0-500). Negative or non-finite input is treated as missing (null). */
export function subIndex(pollutant: Pollutant, concentration: number): number | null {
  if (!Number.isFinite(concentration) || concentration < 0) return null
  for (const [cLo, cHi, iLo, iHi] of BANDS[pollutant]) {
    if (concentration <= cHi) return round(iLo + ((concentration - cLo) * (iHi - iLo)) / (cHi - cLo))
  }
  return 500
}

/** Sub-index → concentration: the exact inverse of subIndex, used to read µg/m³ back out of CPCB data. */
export function concentrationFromIndex(pollutant: Pollutant, index: number): number | null {
  if (!Number.isFinite(index) || index < 0) return null
  for (const [cLo, cHi, iLo, iHi] of BANDS[pollutant]) {
    if (index <= iHi) return cLo + ((index - iLo) * (cHi - cLo)) / (iHi - iLo)
  }
  return BANDS[pollutant][BANDS[pollutant].length - 1][1]
}

/**
 * CPCB's rule: an AQI is only reported when at least three pollutants have data and one of them is
 * PM2.5 or PM10. Returns the AQI and the pollutant that set it, or null when the rule is not met.
 */
export function overallAqi(subs: Partial<Record<Pollutant, number>>): { aqi: number; dominant: Pollutant } | null {
  const entries = (Object.entries(subs) as [Pollutant, number][]).filter(([, v]) => Number.isFinite(v))
  if (entries.length < 3) return null
  if (!entries.some(([p]) => p === 'PM2.5' || p === 'PM10')) return null
  const [dominant, aqi] = entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best))
  return { aqi: round(aqi), dominant }
}

export type Category = 'good' | 'satisfactory' | 'moderate' | 'poor' | 'very_poor' | 'severe'

export interface CategoryInfo {
  id: Category
  label: string
  /** CPCB's published health impact for the band. */
  impact: string
}

const CATEGORIES: readonly (CategoryInfo & { max: number })[] = [
  { id: 'good', max: 50, label: 'Good', impact: 'Minimal impact.' },
  {
    id: 'satisfactory',
    max: 100,
    label: 'Satisfactory',
    impact: 'Minor breathing discomfort to sensitive people.',
  },
  {
    id: 'moderate',
    max: 200,
    label: 'Moderate',
    impact: 'Breathing discomfort to people with lung disease such as asthma, and to children and older adults.',
  },
  {
    id: 'poor',
    max: 300,
    label: 'Poor',
    impact: 'Breathing discomfort to most people on prolonged exposure.',
  },
  {
    id: 'very_poor',
    max: 400,
    label: 'Very Poor',
    impact: 'Respiratory illness on prolonged exposure.',
  },
  {
    id: 'severe',
    max: Number.POSITIVE_INFINITY,
    label: 'Severe',
    impact: 'Affects healthy people and seriously impacts those with existing diseases.',
  },
]

export function category(aqi: number): CategoryInfo {
  const found = CATEGORIES.find((c) => aqi <= c.max) ?? CATEGORIES[CATEGORIES.length - 1]
  return { id: found.id, label: found.label, impact: found.impact }
}

/** Hourly "level" for planning: the PM2.5 sub-index of one hour's concentration (not the official 24-h AQI). */
export const hourlyLevel = (pm25: number): number => subIndex('PM2.5', pm25) ?? 0
