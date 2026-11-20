import type { Household, Place } from '../types'
import { sanitizeHousehold } from './household'
import { inIndia } from './geo'
import type { Lang } from './prompts'

/**
 * The household and place live in this browser only (localStorage). Nothing about the family is
 * sent anywhere except, when they use the AI features, the computed facts to Gemini.
 */
const KEY = 'saans:v1'

export interface Saved {
  place: Place | null
  household: Household | null
  lang: Lang
}

const EMPTY: Saved = { place: null, household: null, lang: 'en' }

export function parsePlace(raw: unknown): Place | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const lat = Number(r.lat)
  const lon = Number(r.lon)
  if (typeof r.name !== 'string' || !r.name.trim() || !inIndia(lat, lon)) return null
  return {
    name: r.name.trim().slice(0, 60),
    district: typeof r.district === 'string' ? r.district.slice(0, 60) : undefined,
    state: typeof r.state === 'string' ? r.state.slice(0, 60) : '',
    lat,
    lon,
  }
}

/** Corrupt or tampered storage is rejected field by field, never trusted. */
export function parseSaved(text: string | null): Saved {
  if (!text) return { ...EMPTY }
  try {
    const raw = JSON.parse(text) as Record<string, unknown>
    return {
      place: parsePlace(raw.place),
      household: sanitizeHousehold(raw.household),
      lang: raw.lang === 'hi' ? 'hi' : 'en',
    }
  } catch {
    return { ...EMPTY }
  }
}

export function load(): Saved {
  try {
    return parseSaved(localStorage.getItem(KEY))
  } catch {
    return { ...EMPTY }
  }
}

export function save(saved: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved))
  } catch {
    // Private mode or full storage: the app still works for this visit.
  }
}

export function clearSaved(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
