import { AGE_BREATHING, BREATHING_M3_PER_H, MASK_PROTECTION, MODES, SMOG_SEASON_WEEKS } from '../data/factors'
import type { AgeGroup, Effort, Mask, Mode } from '../types'

/**
 * Inhaled PM2.5 dose in micrograms: concentration × how much air you breathe × time, reduced by
 * where you are (the micro-environment ratio) and by a mask. This is the number behind every
 * "breathe X% less smog" claim in the app.
 */
export function inhaledDose(args: {
  pm25: number
  minutes: number
  effort: Effort
  age: AgeGroup
  mask: Mask
  /** PM2.5 where you are, relative to the city background (1 = open air). */
  ratio?: number
}): number {
  const rate = BREATHING_M3_PER_H[args.effort] * AGE_BREATHING[args.age]
  const protection = MASK_PROTECTION[args.mask]
  return Math.max(0, args.pm25 * (args.ratio ?? 1) * rate * (args.minutes / 60) * (1 - protection))
}

/** Percentage reduction from `before` to `after`, rounded; 0 when there is nothing to reduce. */
export function pctLess(before: number, after: number): number {
  if (before <= 0) return 0
  return Math.round(((before - after) / before) * 100)
}

/** Door-to-door minutes for one way of a trip. */
export const tripMinutes = (mode: Mode, km: number): number => Math.max(5, Math.round((km / MODES[mode].speedKmh) * 60))

export interface TripOption {
  mode: Mode
  /** People sharing the vehicle (carpool). Emissions are split between them; exposure is not. */
  occupants: number
  label: string
  minutesOneWay: number
  /** µg PM2.5 inhaled on one round trip at the given background concentration. */
  doseRoundTrip: number
  /** Per week, for this person's share. */
  co2KgWeek: number
  pm25GWeek: number
}

export function tripOption(args: {
  mode: Mode
  occupants?: number
  km: number
  tripsPerWeek: number
  pm25: number
  age: AgeGroup
  mask: Mask
}): TripOption {
  const info = MODES[args.mode]
  const occupants = Math.max(1, args.occupants ?? 1)
  const minutes = tripMinutes(args.mode, args.km)
  const dose =
    2 *
    inhaledDose({
      pm25: args.pm25,
      minutes,
      effort: info.effort,
      age: args.age,
      mask: info.maskable ? args.mask : 'none',
      ratio: info.exposureRatio,
    })
  const kmWeek = 2 * args.km * args.tripsPerWeek
  return {
    mode: args.mode,
    occupants,
    label: occupants > 1 ? `${info.label} pool (${occupants} people)` : info.label,
    minutesOneWay: minutes,
    doseRoundTrip: Math.round(dose),
    co2KgWeek: Math.round(((info.co2Kg * kmWeek) / occupants) * 10) / 10,
    pm25GWeek: Math.round(((info.pm25G * kmWeek) / occupants) * 10) / 10,
  }
}

const isCar = (m: Mode): boolean => m.startsWith('car_') || m === 'ev_car'

/**
 * Realistic alternatives to a trip: carpool if it's a car, public transport always, EV when it's a
 * car, cycling up to 8 km and walking up to 2.5 km. Same-mode is included first as the baseline.
 */
export function alternatives(args: {
  mode: Mode
  km: number
  tripsPerWeek: number
  pm25: number
  age: AgeGroup
  mask: Mask
}): TripOption[] {
  const base = { km: args.km, tripsPerWeek: args.tripsPerWeek, pm25: args.pm25, age: args.age, mask: args.mask }
  const list: TripOption[] = [tripOption({ ...base, mode: args.mode })]
  if (isCar(args.mode)) list.push(tripOption({ ...base, mode: args.mode, occupants: 3 }))
  const candidates: Mode[] = ['metro', 'bus', 'ev_car', 'cycle', 'walk']
  for (const mode of candidates) {
    if (mode === args.mode || !MODES[mode].suggestable) continue
    if (mode === 'ev_car' && !isCar(args.mode)) continue
    if (mode === 'cycle' && args.km > 8) continue
    if (mode === 'walk' && args.km > 2.5) continue
    list.push(tripOption({ ...base, mode }))
  }
  return list
}

/** Savings of `option` against `baseline` for one week and for a smog season. */
export function savings(
  baseline: TripOption,
  option: TripOption,
): {
  co2KgWeek: number
  pm25GWeek: number
  co2KgSeason: number
  pm25GSeason: number
  dosePct: number
} {
  const co2 = baseline.co2KgWeek - option.co2KgWeek
  const pm = baseline.pm25GWeek - option.pm25GWeek
  return {
    co2KgWeek: Math.round(co2 * 10) / 10,
    pm25GWeek: Math.round(pm * 10) / 10,
    co2KgSeason: Math.round(co2 * SMOG_SEASON_WEEKS),
    pm25GSeason: Math.round(pm * SMOG_SEASON_WEEKS),
    dosePct: pctLess(baseline.doseRoundTrip, option.doseRoundTrip),
  }
}
