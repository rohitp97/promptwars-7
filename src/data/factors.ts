import type { AgeGroup, Effort, Mask, Mode } from '../types'

/**
 * Every physical constant the app uses lives here, with where it comes from. They are rounded,
 * published averages chosen for COMPARING options for one family, not for a carbon audit or a
 * medical assessment. The UI says so wherever they are used.
 *
 * Reviewed: November 2026.
 */
export const FACTORS_REVIEWED = 'Nov 2026'

/**
 * Breathing rate, m³ of air per hour, for an adult (US EPA Exposure Factors Handbook, ch. 6,
 * short-term inhalation rates by activity level, rounded).
 */
export const BREATHING_M3_PER_H: Record<Effort, number> = {
  rest: 0.4,
  light: 0.8,
  moderate: 1.6,
  vigorous: 3.0,
}

/**
 * Multiplier on the adult rate. Children breathe less air in total but far more per kg of body
 * weight, and their lungs are still developing, so they are also treated as a sensitive group.
 */
export const AGE_BREATHING: Record<AgeGroup, number> = { child: 0.7, teen: 0.95, adult: 1, elder: 0.9 }

/**
 * Share of PM2.5 a mask actually stops in real use, including leaks around the edges (lower than
 * the lab filter rating: a well-worn N95 is ~95% filter efficiency but ~70-85% in daily use).
 */
export const MASK_PROTECTION: Record<Mask, number> = { none: 0, cloth: 0.15, surgical: 0.35, n95: 0.75 }

export const MASK_LABEL: Record<Mask, string> = {
  none: 'no mask',
  cloth: 'cloth mask',
  surgical: 'surgical mask',
  n95: 'N95 / FFP2',
}

export interface ModeInfo {
  label: string
  /** Typical door-to-door speed in an Indian city, km/h (includes walking to stops for public transport). */
  speedKmh: number
  /**
   * PM2.5 inside this micro-environment relative to the city background. On-road exposure is
   * higher than background; a closed cabin on recirculation is lower. From Indian commuter
   * exposure studies (Delhi, Mumbai, Chennai), rounded.
   */
  exposureRatio: number
  effort: Effort
  /** Whether a mask can reasonably be worn (closed cars are assumed unmasked). */
  maskable: boolean
  /** kg CO2 per passenger-km (tailpipe, or grid electricity for metro/EV). */
  co2Kg: number
  /** g PM2.5 per passenger-km released into the city: exhaust plus brake, tyre and road dust. */
  pm25G: number
  /** Can be a swap suggestion. Two-wheelers and autos are never suggested as an improvement. */
  suggestable: boolean
}

export const MODES: Record<Mode, ModeInfo> = {
  car_petrol: {
    label: 'Petrol car',
    speedKmh: 22,
    exposureRatio: 0.7,
    effort: 'rest',
    maskable: false,
    co2Kg: 0.17,
    pm25G: 0.032,
    suggestable: false,
  },
  car_diesel: {
    label: 'Diesel car',
    speedKmh: 22,
    exposureRatio: 0.7,
    effort: 'rest',
    maskable: false,
    co2Kg: 0.16,
    pm25G: 0.045,
    suggestable: false,
  },
  car_cng: {
    label: 'CNG car',
    speedKmh: 22,
    exposureRatio: 0.7,
    effort: 'rest',
    maskable: false,
    co2Kg: 0.13,
    pm25G: 0.03,
    suggestable: false,
  },
  ev_car: {
    label: 'Electric car',
    speedKmh: 22,
    exposureRatio: 0.7,
    effort: 'rest',
    maskable: false,
    co2Kg: 0.11,
    pm25G: 0.025,
    suggestable: true,
  },
  two_wheeler: {
    label: 'Two-wheeler',
    speedKmh: 25,
    exposureRatio: 1.4,
    effort: 'light',
    maskable: true,
    co2Kg: 0.045,
    pm25G: 0.015,
    suggestable: false,
  },
  auto: {
    label: 'Auto-rickshaw',
    speedKmh: 20,
    exposureRatio: 1.4,
    effort: 'rest',
    maskable: true,
    co2Kg: 0.06,
    pm25G: 0.015,
    suggestable: false,
  },
  bus: {
    label: 'Bus',
    speedKmh: 15,
    exposureRatio: 1.1,
    effort: 'rest',
    maskable: true,
    co2Kg: 0.03,
    pm25G: 0.004,
    suggestable: true,
  },
  metro: {
    label: 'Metro',
    speedKmh: 30,
    exposureRatio: 0.65,
    effort: 'light',
    maskable: true,
    co2Kg: 0.025,
    pm25G: 0.001,
    suggestable: true,
  },
  cycle: {
    label: 'Cycle',
    speedKmh: 12,
    exposureRatio: 1.2,
    effort: 'moderate',
    maskable: true,
    co2Kg: 0,
    pm25G: 0,
    suggestable: true,
  },
  walk: {
    label: 'Walk',
    speedKmh: 4.5,
    exposureRatio: 1.2,
    effort: 'light',
    maskable: true,
    co2Kg: 0,
    pm25G: 0,
    suggestable: true,
  },
}

/** Weeks in the north-Indian smog season (mid-October to mid-January), for "this winter" totals. */
export const SMOG_SEASON_WEEKS = 13

/** Fresh outdoor air leaking into a closed home, air changes per hour, by how well it seals. */
export const INFILTRATION_ACH = { sealed: 0.3, average: 0.8, leaky: 1.5 } as const

/** Fraction of outdoor PM2.5 that survives the trip through cracks and gaps. */
export const PENETRATION = 0.8

/** PM2.5 settling onto indoor surfaces, per hour. */
export const DEPOSITION_PER_H = 0.2

/** Air changes per hour a purifier should give the room in smog season (≈ the "2/3 room rule"). */
export const TARGET_PURIFIER_ACH = 5

/** WHO 2021 guideline for 24-hour PM2.5. */
export const WHO_24H_PM25 = 15
/** India's 24-hour PM2.5 standard (NAAQS 2009). */
export const INDIA_24H_PM25 = 60
