import { MODES } from '../data/factors'
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
const clamp = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}
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

export interface Preset {
  id: string
  title: string
  blurb: string
  /** Text an evaluator can paste into "Describe your household" to test the AI intake. */
  sampleText: string
  household: Household
}

/** Sample households: the evaluator's one-click starting points (and the test fixtures). */
export const PRESETS: readonly Preset[] = [
  {
    id: 'delhi-family',
    title: 'Family with kids and a grandparent',
    blurb: 'Two school-age children, grandmother with asthma, a parent who drives 18 km to work.',
    sampleText:
      'We are five. I drive my petrol car 18 km to Gurgaon at 8:30 and back, five days a week. My wife works from home and takes a 30 minute evening walk at 6. Our kids are 8 and 11, they play cricket downstairs from 5 to 6. My mother is 68 and has asthma, she walks in the park at 7 in the morning. We use agarbatti every morning and cook on gas. Bedroom is about 150 sq ft with a small purifier.',
    household: {
      members: [
        {
          id: 'm-papa',
          name: 'Rahul',
          age: 'adult',
          conditions: [],
          mask: 'none',
          activities: [
            {
              id: 'a-commute',
              kind: 'commute',
              label: 'Drive to office',
              hour: 8,
              minutes: 50,
              effort: 'rest',
              flexible: true,
              mode: 'car_petrol',
              km: 18,
              tripsPerWeek: 5,
            },
          ],
        },
        {
          id: 'm-mummy',
          name: 'Neha',
          age: 'adult',
          conditions: [],
          mask: 'surgical',
          activities: [
            {
              id: 'a-walk',
              kind: 'walk',
              label: 'Evening walk',
              hour: 18,
              minutes: 30,
              effort: 'light',
              flexible: true,
            },
          ],
        },
        {
          id: 'm-kid1',
          name: 'Aarav',
          age: 'child',
          conditions: [],
          mask: 'none',
          activities: [
            {
              id: 'a-cricket',
              kind: 'outdoor_play',
              label: 'Cricket downstairs',
              hour: 17,
              minutes: 60,
              effort: 'vigorous',
              flexible: true,
            },
          ],
        },
        {
          id: 'm-kid2',
          name: 'Myra',
          age: 'child',
          conditions: [],
          mask: 'none',
          activities: [
            {
              id: 'a-play2',
              kind: 'outdoor_play',
              label: 'Play in the park',
              hour: 17,
              minutes: 60,
              effort: 'vigorous',
              flexible: true,
            },
          ],
        },
        {
          id: 'm-dadi',
          name: 'Dadi',
          age: 'elder',
          conditions: ['asthma'],
          mask: 'cloth',
          activities: [
            {
              id: 'a-morning',
              kind: 'walk',
              label: 'Morning park walk',
              hour: 7,
              minutes: 40,
              effort: 'light',
              flexible: true,
            },
          ],
        },
      ],
      home: {
        rooms: [
          { id: 'r-bed', name: 'Bedroom', areaSqft: 150, heightFt: 10, purifierCadr: 150 },
          { id: 'r-living', name: 'Living room', areaSqft: 250, heightFt: 10, purifierCadr: 0 },
        ],
        sources: ['incense', 'gas_stove'],
        leakiness: 'average',
      },
    },
  },
  {
    id: 'solo-commuter',
    title: 'Young professional, two-wheeler',
    blurb: 'Rides 12 km each way, runs in the morning, lives in a 1BHK with no purifier.',
    sampleText:
      "I'm 27, live alone in a 1BHK. I ride my scooter 12 km to office at 9:30, six days a week, with a cloth mask. I go for a 45 minute run at 6:30 am. No air purifier, I use a mosquito coil at night.",
    household: {
      members: [
        {
          id: 'm-solo',
          name: 'Priya',
          age: 'adult',
          conditions: [],
          mask: 'cloth',
          activities: [
            {
              id: 'a-ride',
              kind: 'commute',
              label: 'Scooter to office',
              hour: 9,
              minutes: 30,
              effort: 'light',
              flexible: false,
              mode: 'two_wheeler',
              km: 12,
              tripsPerWeek: 6,
            },
            {
              id: 'a-run',
              kind: 'exercise',
              label: 'Morning run',
              hour: 6,
              minutes: 45,
              effort: 'vigorous',
              flexible: true,
            },
          ],
        },
      ],
      home: {
        rooms: [{ id: 'r-1bhk', name: 'Bedroom-cum-living', areaSqft: 220, heightFt: 10, purifierCadr: 0 }],
        sources: ['mosquito_coil', 'gas_stove'],
        leakiness: 'leaky',
      },
    },
  },
  {
    id: 'elder-couple',
    title: 'Retired couple',
    blurb: 'Both over 65, one with a heart condition; morning walk and a market run.',
    sampleText:
      'We are a retired couple, both 67. My husband has a heart condition. We walk in the colony park at 6:30 am for 45 minutes and go to the sabzi market at 10 by auto, 3 km, three times a week.',
    household: {
      members: [
        {
          id: 'm-nana',
          name: 'Suresh',
          age: 'elder',
          conditions: ['heart'],
          mask: 'surgical',
          activities: [
            { id: 'a-w1', kind: 'walk', label: 'Morning walk', hour: 6, minutes: 45, effort: 'light', flexible: true },
          ],
        },
        {
          id: 'm-nani',
          name: 'Kamla',
          age: 'elder',
          conditions: [],
          mask: 'surgical',
          activities: [
            {
              id: 'a-mkt',
              kind: 'errand',
              label: 'Sabzi market',
              hour: 10,
              minutes: 60,
              effort: 'light',
              flexible: true,
              mode: 'auto',
              km: 3,
              tripsPerWeek: 3,
            },
          ],
        },
      ],
      home: {
        rooms: [{ id: 'r-b', name: 'Bedroom', areaSqft: 160, heightFt: 10, purifierCadr: 0 }],
        sources: ['incense', 'gas_stove'],
        leakiness: 'average',
      },
    },
  },
]
