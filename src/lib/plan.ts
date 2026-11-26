import { MASK_LABEL, MODES } from '../data/factors'
import type { Activity, ActivityKind, ForecastHour, Mask, Member } from '../types'
import { category, hourlyLevel } from './aqi'
import { inhaledDose, pctLess } from './exposure'
import { dayLabel, dayOf, formatHour, hourOf, istHourKey } from './time'
import { cleanestWindowOn, isStagnant, meanAt, type Window } from './windows'

/**
 * Per-person decision rules for outdoor activities: given the hourly forecast, decide whether each
 * activity goes ahead, moves to a cleaner hour, needs protection, or should happen indoors, and
 * say why in sentences built only from computed numbers.
 */

// ── Thresholds (PM2.5 sub-index, CPCB categories) ────────────────────────────
/** Sensitive people limit exertion from "Moderate" (101) and avoid it from "Poor" (201). */
const SENSITIVE_LIMITS = { caution: 100, avoid: 200 } as const
/** Everyone else from "Poor" (201) and "Very Poor" (301). */
const GENERAL_LIMITS = { caution: 200, avoid: 300 } as const
/** Vigorous effort (sport, running) lowers both limits by about one band. */
const VIGOROUS_OFFSET = { caution: 50, avoid: 100 } as const

// ── Scheduling ────────────────────────────────────────────────────────────────
/** Leisure may move anywhere in waking hours [start, end). */
const WAKING_HOURS = { start: 6, end: 21 } as const
/** Trips have obligations: they move at most this many hours earlier or later. */
const TRIP_SHIFT_HOURS = 2
/** Never suggest a trip before 5 am or starting after 10 pm. */
const TRIP_BOUNDS = { earliest: 5, latest: 22 } as const
/** A new time is only worth suggesting if it is at least 20% cleaner. */
const CLEAR_IMPROVEMENT = 0.8
/** A closed room typically holds about a third of outdoor PM2.5 (windows shut, no purifier). */
const INDOOR_SHARE_OF_OUTDOOR = 0.35

const OUTDOOR_LEISURE: readonly ActivityKind[] = ['outdoor_play', 'walk', 'exercise']

const INDOOR_SWAP: Partial<Record<ActivityKind, string>> = {
  outdoor_play: 'Indoor play instead: carrom, board games, dancing or a covered court with the doors shut.',
  walk: 'Walk indoors instead: a mall, a covered corridor, or 20 minutes of stairs at home.',
  exercise: 'Exercise indoors instead: yoga, skipping or a home workout in a purifier room.',
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

/** Children, elders, and anyone with a heart/lung condition or pregnancy get the cautious thresholds. */
export function isSensitive(m: Member): boolean {
  return m.age === 'child' || m.age === 'elder' || m.conditions.length > 0
}

/** Hourly level (PM2.5 sub-index) at which advice changes for this person and effort. */
export function thresholds(m: Member, effort: Activity['effort']): { caution: number; avoid: number } {
  const base = isSensitive(m) ? SENSITIVE_LIMITS : GENERAL_LIMITS
  if (effort !== 'vigorous') return { ...base }
  return { caution: base.caution - VIGOROUS_OFFSET.caution, avoid: base.avoid - VIGOROUS_OFFSET.avoid }
}

/** The next occurrence of an activity's start hour, at or after now. */
export function nextOccurrence(hours: readonly ForecastHour[], nowKey: string, hour: number): string | null {
  const found = hours.find((h) => h.time >= nowKey.slice(0, 13) + ':00' && hourOf(h.time) === hour)
  return found?.time ?? null
}

/** 'today at 5 pm' / 'tomorrow at 8 am' for an hourly key. */
export const whenText = (key: string, nowKey: string): string =>
  `${dayLabel(key, nowKey).toLowerCase()} at ${formatHour(hourOf(key))}`

const isLeisure = (a: Activity): boolean => OUTDOOR_LEISURE.includes(a.kind)

/** Hours an activity may move within: anywhere in waking hours for leisure, ±2 hours for trips. */
export function shiftRange(a: Activity): { from: number; to: number } {
  if (isLeisure(a)) return { from: WAKING_HOURS.start, to: WAKING_HOURS.end }
  return {
    from: Math.max(TRIP_BOUNDS.earliest, a.hour - TRIP_SHIFT_HOURS),
    to: Math.min(TRIP_BOUNDS.latest, a.hour + TRIP_SHIFT_HOURS + 1),
  }
}

/** Rounded hours an activity spans (at least 1) — the forecast's resolution. */
const spanHours = (minutes: number): number => Math.max(1, Math.round(minutes / 60))

/** Everything the decision needs about one activity at its planned time. */
interface Situation {
  member: Member
  activity: Activity
  pm25At: number
  levelAt: number
  caution: number
  avoid: number
  maskable: boolean
  /** A cleaner time the same day, only when it is clearly better. */
  better: Window | null
  /** µg inhaled at a given PM2.5 and mask, in this activity's micro-environment. */
  dose: (pm25: number, mask?: Mask) => number
}

interface Decision {
  verdict: Verdict
  actions: string[]
  /** Dose after following the advice. */
  after: number
  extraReasons: string[]
  better?: Window
}

function needsN95(s: Situation): boolean {
  return s.maskable && s.member.mask !== 'n95'
}

function decideShift(s: Situation, better: Window): Decision {
  const actions = [
    `Move it to ${formatHour(hourOf(better.start))}: PM2.5 ${better.meanPm25} µg/m³ instead of ${Math.round(s.pm25At)}.`,
  ]
  let after = s.dose(better.meanPm25)
  if (better.level > s.caution && needsN95(s)) {
    actions.push('Wear a well-fitted N95 as well.')
    after = s.dose(better.meanPm25, 'n95')
  }
  return { verdict: 'shift', actions, after, extraReasons: [], better }
}

function decideIndoors(s: Situation): Decision {
  const { activity, member } = s
  return {
    verdict: 'indoors',
    actions: [INDOOR_SWAP[activity.kind] ?? 'Do it indoors today.'],
    after: inhaledDose({
      pm25: s.pm25At * INDOOR_SHARE_OF_OUTDOOR,
      minutes: activity.minutes,
      effort: activity.effort,
      age: member.age,
      mask: 'none',
    }),
    extraReasons: [
      'Assumes a closed room at about a third of outdoor PM2.5 (typical with windows shut; lower with a purifier).',
    ],
  }
}

function decideProtect(s: Situation): Decision {
  const { activity, member } = s
  const actions: string[] = []
  let after = s.dose(s.pm25At)
  if (needsN95(s)) {
    actions.push(`Wear a well-fitted N95 (instead of ${MASK_LABEL[member.mask]}).`)
    after = s.dose(s.pm25At, 'n95')
  }
  if (activity.mode && MODES[activity.mode].exposureRatio > 1) {
    actions.push(
      'If you can, take the metro or a closed vehicle on the worst days: on-road air is dirtier than the city average.',
    )
  }
  if (activity.effort !== 'rest') actions.push('Keep the pace easy: harder breathing pulls in more smog.')
  if (actions.length === 0) actions.push('Keep windows up and the AC on recirculation.')
  return { verdict: 'protect', actions, after, extraReasons: [] }
}

/**
 * The decision, in order: clean enough → go; a clearly cleaner time exists (and for leisure, that
 * time is itself acceptable) → move it; leisure in air above the avoid limit → indoors; else protect.
 */
function decide(s: Situation): Decision {
  if (s.levelAt <= s.caution) {
    return { verdict: 'go', actions: ['Go ahead as planned.'], after: s.dose(s.pm25At), extraReasons: [] }
  }
  const leisure = isLeisure(s.activity)
  if (s.better && (!leisure || s.better.level <= s.avoid)) return decideShift(s, s.better)
  if (leisure && s.levelAt > s.avoid) return decideIndoors(s)
  return decideProtect(s)
}

const HEADLINE: Record<Verdict, (label: string, better?: Window) => string> = {
  go: (label) => `${label}: fine as planned`,
  shift: (label, better) => `${label}: move to ${better ? formatHour(hourOf(better.start)) : 'a cleaner hour'}`,
  indoors: (label) => `${label}: keep it indoors`,
  protect: (label) => `${label}: go, but protect`,
}

function reasonsFor(s: Situation, at: string, nowKey: string, hours: readonly ForecastHour[]): string[] {
  const when = whenText(at, nowKey)
  const reasons = [
    `${when[0].toUpperCase()}${when.slice(1)} the air is forecast at PM2.5 ${Math.round(s.pm25At)} µg/m³ (${category(s.levelAt).label}, level ${s.levelAt}).`,
  ]
  if (isSensitive(s.member)) {
    reasons.push(`${s.member.name} is in a sensitive group, so the cautious limit (level ${s.caution}) applies.`)
  }
  const atHour = hours.find((h) => h.time === at)
  if (atHour && isStagnant(atHour)) {
    reasons.push('Still air and a shallow mixing layer at that hour keep the smog trapped near the ground.')
  }
  return reasons
}

/** A cleaner window on the same day within the activity's allowed range, if it is clearly better. */
function findBetter(
  activity: Activity,
  hours: readonly ForecastHour[],
  at: string,
  nowKey: string,
  pm25At: number,
): Window | null {
  if (!activity.flexible) return null
  const { from, to } = shiftRange(activity)
  const sameDay = dayOf(at) === dayOf(nowKey)
  const start = sameDay ? Math.max(from, hourOf(nowKey)) : from
  const best = cleanestWindowOn(hours, dayOf(at), spanHours(activity.minutes), start, to)
  return best && best.start !== at && best.meanPm25 <= pm25At * CLEAR_IMPROVEMENT ? best : null
}

export function adviseActivity(
  member: Member,
  activity: Activity,
  hours: readonly ForecastHour[],
  nowKey: string,
): ActivityAdvice | null {
  const at = nextOccurrence(hours, nowKey, activity.hour)
  const atHour = hours.find((h) => h.time === at)
  if (!at || !atHour) return null

  const pm25At = meanAt(hours, at, spanHours(activity.minutes)) ?? atHour.pm25
  const mode = activity.mode ? MODES[activity.mode] : undefined
  const maskable = mode?.maskable ?? true
  const situation: Situation = {
    member,
    activity,
    pm25At,
    levelAt: hourlyLevel(pm25At),
    ...thresholds(member, activity.effort),
    maskable,
    better: findBetter(activity, hours, at, nowKey, pm25At),
    dose: (pm25, mask = member.mask) =>
      inhaledDose({
        pm25,
        minutes: activity.minutes,
        effort: activity.effort,
        age: member.age,
        mask: maskable ? mask : 'none',
        ratio: mode?.exposureRatio ?? 1,
      }),
  }

  const decision = decide(situation)
  return {
    member,
    activity,
    at,
    pm25At: Math.round(pm25At),
    levelAt: situation.levelAt,
    verdict: decision.verdict,
    bestAt: decision.better?.start,
    bestPm25: decision.better?.meanPm25,
    doseCutPct: pctLess(situation.dose(pm25At), decision.after),
    headline: HEADLINE[decision.verdict](activity.label, decision.better),
    reasons: [...reasonsFor(situation, at, nowKey, hours), ...decision.extraReasons],
    actions: decision.actions,
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

/** Noon and 5 pm split the day into the three parts the plan is written in. */
export const partOfDay = (hour: number): Part => (hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening')

/** Group advice into morning / afternoon / evening, earliest first. */
export function byPartOfDay(advice: readonly ActivityAdvice[]): Record<Part, ActivityAdvice[]> {
  const out: Record<Part, ActivityAdvice[]> = { morning: [], afternoon: [], evening: [] }
  const when = (a: ActivityAdvice): string => a.bestAt ?? a.at
  for (const a of [...advice].sort((x, y) => when(x).localeCompare(when(y)))) out[partOfDay(hourOf(when(a)))].push(a)
  return out
}
