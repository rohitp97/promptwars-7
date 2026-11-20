import { MASK_LABEL, MODES } from '../data/factors'
import type { Activity, ActivityKind, ForecastHour, Member } from '../types'
import { category, hourlyLevel } from './aqi'
import { inhaledDose, pctLess } from './exposure'
import { dayLabel, dayOf, formatHour, hourOf, istHourKey } from './time'
import { cleanestWindowOn, isStagnant, meanAt } from './windows'

/** Children, elders, and anyone with a heart/lung condition or pregnancy get the cautious thresholds. */
export function isSensitive(m: Member): boolean {
  return m.age === 'child' || m.age === 'elder' || m.conditions.length > 0
}

/**
 * Hourly level (PM2.5 sub-index) at which advice changes, per person. Based on CPCB's categories:
 * sensitive people should limit exertion from "Moderate" (101) and avoid it from "Poor" (201);
 * everyone else from "Poor" and "Very Poor". Vigorous effort lowers both by one band.
 */
export function thresholds(m: Member, effort: Activity['effort']): { caution: number; avoid: number } {
  const base = isSensitive(m) ? { caution: 100, avoid: 200 } : { caution: 200, avoid: 300 }
  if (effort === 'vigorous') return { caution: base.caution - 50, avoid: base.avoid - 100 }
  return base
}

export type Verdict = 'go' | 'shift' | 'protect' | 'indoors'

export interface ActivityAdvice {
  member: Member
  activity: Activity
  /** When the activity happens next (today, or tomorrow if today's time has passed). */
  at: string
  pm25At: number
  levelAt: number
  verdict: Verdict
  /** Best time on the same day, if moving it helps. */
  bestAt?: string
  bestPm25?: number
  /** % less PM2.5 inhaled by following the advice (moving and/or masking). */
  doseCutPct: number
  headline: string
  /** Plain reasons, each grounded in a computed number. */
  reasons: string[]
  actions: string[]
}

const OUTDOOR_LEISURE: readonly ActivityKind[] = ['outdoor_play', 'walk', 'exercise']

const INDOOR_SWAP: Partial<Record<ActivityKind, string>> = {
  outdoor_play: 'Indoor play instead: carrom, board games, dancing or a covered court with the doors shut.',
  walk: 'Walk indoors instead: a mall, a covered corridor, or 20 minutes of stairs at home.',
  exercise: 'Exercise indoors instead: yoga, skipping or a home workout in a purifier room.',
}

/** The next occurrence of an activity's start hour, at or after now. */
export function nextOccurrence(hours: readonly ForecastHour[], nowKey: string, hour: number): string | null {
  const found = hours.find((h) => h.time >= nowKey.slice(0, 13) + ':00' && hourOf(h.time) === hour)
  return found?.time ?? null
}

/** 'today at 5 pm' / 'tomorrow at 8 am' for an hourly key. */
export const whenText = (key: string, nowKey: string): string =>
  `${dayLabel(key, nowKey).toLowerCase()} at ${formatHour(hourOf(key))}`

/**
 * Hours an activity may move within. Trips (commute, school run, errands by vehicle, outdoor work)
 * have fixed obligations, so only ±2 hours; leisure can go anywhere in waking hours.
 */
export function shiftRange(a: Activity): { from: number; to: number } {
  const leisure = OUTDOOR_LEISURE.includes(a.kind)
  if (leisure) return { from: 6, to: 21 }
  return { from: Math.max(5, a.hour - 2), to: Math.min(22, a.hour + 3) }
}

/** Rounded hours an activity spans (at least 1) — the forecast's resolution. */
const spanHours = (minutes: number): number => Math.max(1, Math.round(minutes / 60))

export function adviseActivity(
  member: Member,
  activity: Activity,
  hours: readonly ForecastHour[],
  nowKey: string,
): ActivityAdvice | null {
  const at = nextOccurrence(hours, nowKey, activity.hour)
  if (!at) return null
  const span = spanHours(activity.minutes)
  const pm25At = meanAt(hours, at, span) ?? hours.find((h) => h.time === at)!.pm25
  const levelAt = hourlyLevel(pm25At)
  const { caution, avoid } = thresholds(member, activity.effort)
  const travel = activity.mode !== undefined
  const ratio = travel ? MODES[activity.mode!].exposureRatio : 1
  const maskable = !travel || MODES[activity.mode!].maskable
  const dose = (pm: number, mask = member.mask): number =>
    inhaledDose({
      pm25: pm,
      minutes: activity.minutes,
      effort: activity.effort,
      age: member.age,
      mask: maskable ? mask : 'none',
      ratio,
    })
  const doseNow = dose(pm25At)

  const today = dayOf(at)
  const { from, to } = shiftRange(activity)
  const startFrom = at.slice(0, 10) === nowKey.slice(0, 10) ? Math.max(from, hourOf(nowKey)) : from
  const best = activity.flexible ? cleanestWindowOn(hours, today, span, startFrom, to) : null
  const bestHelps = best !== null && best.start !== at && best.meanPm25 <= pm25At * 0.8

  const when = whenText(at, nowKey)
  const cat = category(levelAt).label
  const reasons: string[] = [
    `${when[0].toUpperCase()}${when.slice(1)} the air is forecast at PM2.5 ${Math.round(pm25At)} µg/m³ (${cat}, level ${levelAt}).`,
  ]
  if (isSensitive(member))
    reasons.push(`${member.name} is in a sensitive group, so the cautious limit (level ${caution}) applies.`)
  const atHour = hours.find((h) => h.time === at)
  if (atHour && isStagnant(atHour))
    reasons.push('Still air and a shallow mixing layer at that hour keep the smog trapped near the ground.')

  const actions: string[] = []
  let verdict: Verdict = 'go'
  let after = doseNow
  let bestAt: string | undefined
  let bestPm25: number | undefined

  const leisure = OUTDOOR_LEISURE.includes(activity.kind)
  // Leisure is only moved to a time that is actually acceptable; a commute is moved to any clearly better time.
  const shiftable = bestHelps && (!leisure || best!.level <= avoid)

  if (levelAt <= caution) {
    verdict = 'go'
    actions.push('Go ahead as planned.')
  } else if (shiftable) {
    verdict = 'shift'
    bestAt = best!.start
    bestPm25 = best!.meanPm25
    after = dose(best!.meanPm25)
    actions.push(
      `Move it to ${formatHour(hourOf(best!.start))}: PM2.5 ${best!.meanPm25} µg/m³ instead of ${Math.round(pm25At)}.`,
    )
    if (best!.level > caution && maskable && member.mask !== 'n95') {
      actions.push('Wear a well-fitted N95 as well.')
      after = dose(best!.meanPm25, 'n95')
    }
  } else if (levelAt > avoid && leisure) {
    verdict = 'indoors'
    actions.push(INDOOR_SWAP[activity.kind] ?? 'Do it indoors today.')
    after = inhaledDose({
      pm25: pm25At * 0.35,
      minutes: activity.minutes,
      effort: activity.effort,
      age: member.age,
      mask: 'none',
    })
    reasons.push(
      'Assumes a closed room at about a third of outdoor PM2.5 (typical with windows shut; lower with a purifier).',
    )
  } else {
    verdict = 'protect'
    if (maskable && member.mask !== 'n95') {
      actions.push(`Wear a well-fitted N95 (instead of ${MASK_LABEL[member.mask]}).`)
      after = dose(pm25At, 'n95')
    }
    if (travel && MODES[activity.mode!].exposureRatio > 1) {
      actions.push(
        'If you can, take the metro or a closed vehicle on the worst days: on-road air is dirtier than the city average.',
      )
    }
    if (activity.effort !== 'rest') actions.push('Keep the pace easy: harder breathing pulls in more smog.')
    if (actions.length === 0) actions.push('Keep windows up and the AC on recirculation.')
  }

  const doseCutPct = pctLess(doseNow, after)
  const headline =
    verdict === 'go'
      ? `${activity.label}: fine as planned`
      : verdict === 'shift'
        ? `${activity.label}: move to ${formatHour(hourOf(bestAt!))}`
        : verdict === 'indoors'
          ? `${activity.label}: keep it indoors`
          : `${activity.label}: go, but protect`

  return {
    member,
    activity,
    at,
    pm25At: Math.round(pm25At),
    levelAt,
    verdict,
    bestAt,
    bestPm25,
    doseCutPct,
    headline,
    reasons,
    actions,
  }
}

export function adviseHousehold(
  members: readonly Member[],
  hours: readonly ForecastHour[],
  now: Date = new Date(),
): ActivityAdvice[] {
  const nowKey = istHourKey(now)
  return members.flatMap((m) =>
    m.activities.map((a) => adviseActivity(m, a, hours, nowKey)).filter((x): x is ActivityAdvice => x !== null),
  )
}

export type Part = 'morning' | 'afternoon' | 'evening'

export const partOfDay = (hour: number): Part => (hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening')

/** Group advice into morning / afternoon / evening, earliest first. */
export function byPartOfDay(advice: readonly ActivityAdvice[]): Record<Part, ActivityAdvice[]> {
  const out: Record<Part, ActivityAdvice[]> = { morning: [], afternoon: [], evening: [] }
  for (const a of [...advice].sort((x, y) => (x.bestAt ?? x.at).localeCompare(y.bestAt ?? y.at))) {
    out[partOfDay(hourOf(a.bestAt ?? a.at))].push(a)
  }
  return out
}
