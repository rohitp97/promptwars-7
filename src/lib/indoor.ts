import { DEPOSITION_PER_H, INFILTRATION_ACH, PENETRATION, TARGET_PURIFIER_ACH } from '../data/factors'
import type { Home, IndoorSource, Room } from '../types'

const SQFT_TO_M2 = 0.092903
const FT_TO_M = 0.3048

export const roomVolumeM3 = (room: Pick<Room, 'areaSqft' | 'heightFt'>): number =>
  Math.round(room.areaSqft * SQFT_TO_M2 * room.heightFt * FT_TO_M * 10) / 10

/**
 * Steady-state indoor PM2.5 with the windows shut, from a single-room mass balance:
 *   C_in = P · a · C_out / (a + k + CADR / V)
 * a = infiltration (air changes/h), P = penetration, k = deposition, CADR/V = purifier air changes.
 * Indoor sources (cooking, incense) are left out: they add on top, which the advice covers.
 */
export function indoorPm25(
  outdoor: number,
  room: Room,
  leakiness: Home['leakiness'],
  purifierCadr = room.purifierCadr,
): number {
  const a = INFILTRATION_ACH[leakiness]
  const v = roomVolumeM3(room)
  const purifierAch = v > 0 ? purifierCadr / v : 0
  return Math.round((PENETRATION * a * outdoor) / (a + DEPOSITION_PER_H + purifierAch))
}

/** CADR (m³/h) needed for the target air changes in this room, rounded up to the next 10. */
export const recommendedCadr = (room: Room): number => Math.ceil((roomVolumeM3(room) * TARGET_PURIFIER_ACH) / 10) * 10

/**
 * Minutes for the purifier to remove most (90%) of the excess after the room is closed up — e.g.
 * after airing it or after cooking. Exponential decay at rate (a + k + CADR/V).
 */
export function minutesToClear(room: Room, leakiness: Home['leakiness']): number | null {
  const v = roomVolumeM3(room)
  if (v <= 0) return null
  const rate = INFILTRATION_ACH[leakiness] + DEPOSITION_PER_H + room.purifierCadr / v
  return Math.round((Math.log(10) / rate) * 60)
}

export interface RoomVerdict {
  room: Room
  volumeM3: number
  indoorNow: number
  indoorWithout: number
  recommendedCadr: number
  /** 'none' | 'undersized' | 'ok' */
  purifier: 'none' | 'undersized' | 'ok'
  /** Indoor PM2.5 if the purifier were the recommended size (for undersized/none). */
  indoorIfRightSized: number
  minutesToClear: number | null
}

export function assessRoom(room: Room, outdoor: number, leakiness: Home['leakiness']): RoomVerdict {
  const rec = recommendedCadr(room)
  const purifier = room.purifierCadr <= 0 ? 'none' : room.purifierCadr < rec * 0.8 ? 'undersized' : 'ok'
  return {
    room,
    volumeM3: roomVolumeM3(room),
    indoorNow: indoorPm25(outdoor, room, leakiness),
    indoorWithout: indoorPm25(outdoor, room, leakiness, 0),
    recommendedCadr: rec,
    purifier,
    indoorIfRightSized: indoorPm25(outdoor, room, leakiness, Math.max(rec, room.purifierCadr)),
    minutesToClear: room.purifierCadr > 0 ? minutesToClear(room, leakiness) : null,
  }
}

export interface SourceTip {
  source: IndoorSource
  label: string
  tip: string
  why: string
}

/** Indoor sources the family can control, with a concrete swap and the reason for it. */
export const SOURCE_TIPS: Record<IndoorSource, SourceTip> = {
  gas_stove: {
    source: 'gas_stove',
    label: 'Gas stove cooking',
    tip: 'Run the chimney or exhaust fan during cooking and for 15 minutes after; prefer lids, pressure cooking and less deep-frying on the worst days.',
    why: 'Frying and tadka release a burst of fine particles and the stove adds NO2; with windows shut the burst has nowhere to go.',
  },
  incense: {
    source: 'incense',
    label: 'Agarbatti / dhoop',
    tip: 'Light one stick instead of several, near an open window or exhaust, or switch to a diya or electric diffuser during smog weeks.',
    why: 'Burning incense is a strong indoor PM2.5 source; in a closed room one session can push indoor levels above the outdoor smog.',
  },
  mosquito_coil: {
    source: 'mosquito_coil',
    label: 'Mosquito coil',
    tip: 'Use a mosquito net or a plug-in liquid vaporiser instead of coils, especially in bedrooms.',
    why: 'A burning coil gives off as much fine smoke as a pack of cigarettes over a night, right where people sleep.',
  },
  smoking: {
    source: 'smoking',
    label: 'Smoking indoors',
    tip: 'Keep smoking fully outside the home, never in bedrooms or the car with children.',
    why: 'Tobacco smoke is the largest indoor PM2.5 source in homes where it occurs and no purifier keeps up with it.',
  },
  chulha: {
    source: 'chulha',
    label: 'Wood / coal / chulha',
    tip: 'Switch to LPG (Ujjwala refills) or an induction plate for daily cooking; if not possible, cook with the door open and keep children away.',
    why: 'Solid-fuel smoke inside the home exposes the cook and children to many times the outdoor level.',
  },
  candles: {
    source: 'candles',
    label: 'Candles / camphor',
    tip: 'Keep to short use in a ventilated spot; LED diyas give the same light without smoke.',
    why: 'Open flames add soot and fine particles in a closed room.',
  },
}

export const SOURCE_ORDER: readonly IndoorSource[] = [
  'gas_stove',
  'incense',
  'mosquito_coil',
  'smoking',
  'chulha',
  'candles',
]
