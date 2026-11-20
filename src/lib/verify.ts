/**
 * The model may explain numbers but never supply them. Every number it writes must already be in
 * the facts the code computed; a sentence with any other number is removed and reported.
 */

const NUMBER_RE = /\d+(?:[.,]\d+)?/g

/** Numbers that are part of names, not quantities: PM2.5, PM10, NO2, N95, 24-hour, CO2. */
const ALWAYS_ALLOWED = [2.5, 10, 2, 95, 24]

/** Small counts and clock hours ("2 children", "at 5 pm") are not claims about the air. */
const SMALL_INT_MAX = 12

const normalise = (raw: string): number => Number(raw.replace(/,(?=\d{3}\b)/g, '').replace(',', '.'))

export function numbersIn(text: string): number[] {
  return (text.match(NUMBER_RE) ?? []).map(normalise).filter(Number.isFinite)
}

/** Every number anywhere in a facts object: numeric fields and numbers inside strings. */
export function allowedNumbers(facts: unknown): Set<number> {
  const out = new Set<number>(ALWAYS_ALLOWED)
  const walk = (v: unknown): void => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      out.add(v)
      out.add(Math.round(v))
      out.add(Math.round(v * 10) / 10)
    } else if (typeof v === 'string') {
      for (const n of numbersIn(v)) out.add(n)
    } else if (Array.isArray(v)) {
      v.forEach(walk)
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(walk)
    }
  }
  walk(facts)
  return out
}

export function isAllowed(n: number, allowed: Set<number>): boolean {
  if (Number.isInteger(n) && n >= 0 && n <= SMALL_INT_MAX) return true
  return allowed.has(n)
}

/** Sentence split that keeps the end mark (also the Devanagari danda). */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export interface Checked {
  text: string
  removed: string[]
}

/** Drops each sentence that contains a number the facts do not contain. */
export function checkText(text: string, allowed: Set<number>): Checked {
  const kept: string[] = []
  const removed: string[] = []
  for (const s of sentences(text)) {
    if (numbersIn(s).every((n) => isAllowed(n, allowed))) kept.push(s)
    else removed.push(s)
  }
  return { text: kept.join(' '), removed }
}
