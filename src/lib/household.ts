import { MODES } from '../data/factors'
import { clampNumber } from './numbers'
import type {
  Activity,
  ActivityKind,
  AgeGroup,
  Condition,
  Effort,
  Home,
  Household,
  IndoorSource,
  Mask,
  Member,
  Mode,
  Room,
} from '../types'

export const AGE_GROUPS: readonly AgeGroup[] = ['child', 'teen', 'adult', 'elder']
export const CONDITIONS: readonly Condition[] = ['asthma', 'copd', 'heart', 'pregnant', 'diabetes']
export const MASKS: readonly Mask[] = ['none', 'cloth', 'surgical', 'n95']
export const EFFORTS: readonly Effort[] = ['rest', 'light', 'moderate', 'vigorous']
export const MODE_IDS = Object.keys(MODES) as Mode[]
export const SOURCES: readonly IndoorSource[] = [
  'gas_stove',
  'incense',
  'mosquito_coil',
  'smoking',
  'chulha',
  'candles',
]
export const KINDS: readonly ActivityKind[] = [
  'commute',
  'school_run',
  'outdoor_play',
  'walk',
  'exercise',
  'errand',
  'outdoor_work',
]

export const AGE_LABEL: Record<AgeGroup, string> = {
  child: 'Child (under 12)',
  teen: 'Teen',
  adult: 'Adult',
  elder: 'Elder (60+)',
}
export const CONDITION_LABEL: Record<Condition, string> = {
  asthma: 'Asthma',
  copd: 'COPD / bronchitis',
  heart: 'Heart condition',
  pregnant: 'Pregnant',
  diabetes: 'Diabetes',
}
export const KIND_LABEL: Record<ActivityKind, string> = {
  commute: 'Commute',
  school_run: 'School run',
  outdoor_play: 'Outdoor play',
  walk: 'Walk',
  exercise: 'Exercise / sport',
  errand: 'Errand / market',
  outdoor_work: 'Outdoor work',
}
export const TRAVEL_KINDS: readonly ActivityKind[] = ['commute', 'school_run']
export const DEFAULT_EFFORT: Record<ActivityKind, Effort> = {
  commute: 'rest',
  school_run: 'light',
  outdoor_play: 'vigorous',
  walk: 'light',
  exercise: 'vigorous',
  errand: 'light',
  outdoor_work: 'moderate',
}

let counter = 0
export const newId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`

const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback
const clamp = (v: unknown, min: number, max: number, fallback: number): number =>
  clampNumber(v, { min, max }, { fallback })
const text = (v: unknown, fallback: string, max = 40): string =>
  typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : fallback

export const LIMITS = {
  members: 10,
  activitiesPerMember: 6,
  rooms: 6,
  km: { min: 0.2, max: 80 },
  minutes: { min: 5, max: 600 },
  tripsPerWeek: { min: 1, max: 14 },
  areaSqft: { min: 40, max: 1500 },
  heightFt: { min: 7, max: 16 },
  cadr: { min: 0, max: 1500 },
} as const

export function sanitizeActivity(raw: unknown): Activity | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const kind = oneOf(KINDS, r.kind, 'walk')
  const isTravel = TRAVEL_KINDS.includes(kind) || typeof r.mode === 'string'
  const activity: Activity = {
    id: typeof r.id === 'string' && r.id ? r.id.slice(0, 40) : newId('a'),
    kind,
    label: text(r.label, KIND_LABEL[kind]),
    hour: Math.round(clamp(r.hour, 0, 23, 8)),
    minutes: Math.round(clamp(r.minutes, LIMITS.minutes.min, LIMITS.minutes.max, 30)),
    effort: oneOf(EFFORTS, r.effort, DEFAULT_EFFORT[kind]),
    flexible: typeof r.flexible === 'boolean' ? r.flexible : !TRAVEL_KINDS.includes(kind),
  }
  if (isTravel) {
    activity.mode = oneOf(MODE_IDS, r.mode, 'car_petrol')
    activity.km = Math.round(clamp(r.km, LIMITS.km.min, LIMITS.km.max, 5) * 10) / 10
    activity.tripsPerWeek = Math.round(clamp(r.tripsPerWeek, LIMITS.tripsPerWeek.min, LIMITS.tripsPerWeek.max, 5))
  }
  return activity
}

export function sanitizeMember(raw: unknown, index: number): Member | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const conditions = Array.isArray(r.conditions)
    ? [...new Set(r.conditions.filter((c): c is Condition => (CONDITIONS as readonly unknown[]).includes(c)))]
    : []
  const activities = Array.isArray(r.activities)
    ? r.activities
        .map(sanitizeActivity)
        .filter((a): a is Activity => a !== null)
        .slice(0, LIMITS.activitiesPerMember)
    : []
  return {
    id: typeof r.id === 'string' && r.id ? r.id.slice(0, 40) : newId('m'),
    name: text(r.name, `Person ${index + 1}`, 24),
    age: oneOf(AGE_GROUPS, r.age, 'adult'),
    conditions,
    mask: oneOf(MASKS, r.mask, 'none'),
    activities,
  }
}

export function sanitizeRoom(raw: unknown, index: number): Room | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  return {
    id: typeof r.id === 'string' && r.id ? r.id.slice(0, 40) : newId('r'),
    name: text(r.name, `Room ${index + 1}`, 24),
    areaSqft: Math.round(clamp(r.areaSqft, LIMITS.areaSqft.min, LIMITS.areaSqft.max, 150)),
    heightFt: Math.round(clamp(r.heightFt, LIMITS.heightFt.min, LIMITS.heightFt.max, 10)),
    purifierCadr: Math.round(clamp(r.purifierCadr, LIMITS.cadr.min, LIMITS.cadr.max, 0)),
  }
}

/**
 * Turns anything (saved JSON, model output) into a valid household, or null if it has no members.
 * Unknown values fall back to safe defaults and out-of-range numbers are clamped, so nothing
 * downstream ever sees a bad value.
 */
export function sanitizeHousehold(raw: unknown): Household | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const members = Array.isArray(r.members)
    ? r.members
        .map(sanitizeMember)
        .filter((m): m is Member => m !== null)
        .slice(0, LIMITS.members)
    : []
  if (members.length === 0) return null
  const h = (r.home && typeof r.home === 'object' ? r.home : {}) as Record<string, unknown>
  const rooms = Array.isArray(h.rooms)
    ? h.rooms
        .map(sanitizeRoom)
        .filter((x): x is Room => x !== null)
        .slice(0, LIMITS.rooms)
    : []
  const sources = Array.isArray(h.sources)
    ? [...new Set(h.sources.filter((s): s is IndoorSource => (SOURCES as readonly unknown[]).includes(s)))]
    : []
  const home: Home = {
    rooms: rooms.length > 0 ? rooms : [defaultRoom()],
    sources,
    leakiness: oneOf(['sealed', 'average', 'leaky'] as const, h.leakiness, 'average'),
  }
  return { members, home }
}

export const defaultRoom = (): Room => ({
  id: newId('r'),
  name: 'Bedroom',
  areaSqft: 150,
  heightFt: 10,
  purifierCadr: 0,
})
