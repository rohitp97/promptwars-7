import type { ForecastHour } from '../types'
import { hourlyLevel } from './aqi'
import { dayOf, hourOf } from './time'

/** Hours from now (inclusive) to the end of tomorrow — what the planner can still act on. */
export function upcoming(hours: readonly ForecastHour[], nowKey: string): ForecastHour[] {
  const start = hours.findIndex((h) => h.time >= nowKey)
  if (start < 0) return []
  const today = dayOf(nowKey)
  const tomorrow = new Date(Date.parse(today + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10)
  return hours.slice(start).filter((h) => dayOf(h.time) <= tomorrow)
}

/**
 * Smog is trapped near the ground when the air is still and the mixing layer is shallow (winter
 * nights and early mornings). Thresholds: under 300 m of mixing height, or wind under 4 km/h.
 */
export function isStagnant(h: ForecastHour): boolean {
  return (h.mixing !== null && h.mixing < 300) || h.wind < 4
}

export interface Window {
  start: string
  /** Number of consecutive hours. */
  length: number
  meanPm25: number
  level: number
}

const mean = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length

/**
 * The cleanest run of `length` consecutive hours among `hours`, limited to waking hours
 * [fromHour, toHour) so the app never suggests a 3 am walk. Ties go to the earliest.
 */
export function cleanestWindow(
  hours: readonly ForecastHour[],
  length: number,
  fromHour = 6,
  toHour = 21,
): Window | null {
  let best: Window | null = null
  for (let i = 0; i + length <= hours.length; i++) {
    const run = hours.slice(i, i + length)
    if (run.some((h) => hourOf(h.time) < fromHour || hourOf(h.time) >= toHour)) continue
    if (dayOf(run[0].time) !== dayOf(run[run.length - 1].time)) continue
    const m = mean(run.map((h) => h.pm25))
    if (!best || m < best.meanPm25 - 1e-9) {
      best = { start: run[0].time, length, meanPm25: Math.round(m), level: hourlyLevel(m) }
    }
  }
  return best
}

/** Same, limited to one calendar day. */
export function cleanestWindowOn(
  hours: readonly ForecastHour[],
  day: string,
  length: number,
  fromHour = 6,
  toHour = 21,
): Window | null {
  return cleanestWindow(
    hours.filter((h) => dayOf(h.time) === day),
    length,
    fromHour,
    toHour,
  )
}

/** Mean PM2.5 over `length` hours starting at `startKey` (or null if the forecast doesn't cover it). */
export function meanAt(hours: readonly ForecastHour[], startKey: string, length: number): number | null {
  const i = hours.findIndex((h) => h.time === startKey)
  if (i < 0 || i + length > hours.length) return null
  return mean(hours.slice(i, i + length).map((h) => h.pm25))
}

export interface DaySummary {
  day: string
  worst: ForecastHour
  best: ForecastHour
  meanPm25: number
  stagnantHours: number
}

/** Per-day highs and lows over waking hours (6 am - 9 pm). */
export function summariseDays(hours: readonly ForecastHour[]): DaySummary[] {
  const byDay = new Map<string, ForecastHour[]>()
  for (const h of hours) {
    if (hourOf(h.time) < 6 || hourOf(h.time) >= 21) continue
    const list = byDay.get(dayOf(h.time)) ?? []
    list.push(h)
    byDay.set(dayOf(h.time), list)
  }
  return [...byDay.entries()].map(([day, list]) => ({
    day,
    worst: list.reduce((a, b) => (b.pm25 > a.pm25 ? b : a)),
    best: list.reduce((a, b) => (b.pm25 < a.pm25 ? b : a)),
    meanPm25: Math.round(mean(list.map((h) => h.pm25))),
    stagnantHours: list.filter(isStagnant).length,
  }))
}
