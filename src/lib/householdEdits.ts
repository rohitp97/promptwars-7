import type { Activity, ActivityKind, Condition, Household, Member, Room } from '../types'
import { DEFAULT_EFFORT, defaultRoom, newId, TRAVEL_KINDS } from './household'

/**
 * Every change the household editor can make, as small pure functions: (household, …) → new
 * household. The components only wire inputs to these, so the editing rules are tested without a UI.
 */

const DEFAULT_TRIP = { mode: 'car_petrol', km: 5, tripsPerWeek: 5 } as const

export const blankMember = (index: number, name = `Person ${index + 1}`): Member => ({
  id: newId('m'),
  name,
  age: 'adult',
  conditions: [],
  mask: 'none',
  activities: [],
})

export const blankRoom = (index: number): Room => ({
  id: newId('r'),
  name: `Room ${index + 1}`,
  areaSqft: 150,
  heightFt: 10,
  purifierCadr: 0,
})

export const blankActivity = (): Activity => ({
  id: newId('a'),
  kind: 'walk',
  label: 'Walk',
  hour: 7,
  minutes: 30,
  effort: 'light',
  flexible: true,
})

/** A household with one person and one default room, for "start blank". */
export const blankHousehold = (): Household => ({
  members: [blankMember(0, 'Me')],
  home: { rooms: [defaultRoom()], sources: [], leakiness: 'average' },
})

// ── Household level ─────────────────────────────────────────────────────────
export const addMember = (h: Household): Household => ({ ...h, members: [...h.members, blankMember(h.members.length)] })

export const removeMember = (h: Household, id: string): Household =>
  h.members.length > 1 ? { ...h, members: h.members.filter((m) => m.id !== id) } : h

export const updateMember = (h: Household, next: Member): Household => ({
  ...h,
  members: h.members.map((m) => (m.id === next.id ? next : m)),
})

export const addRoom = (h: Household): Household => ({
  ...h,
  home: { ...h.home, rooms: [...h.home.rooms, blankRoom(h.home.rooms.length)] },
})

// ── Member level ────────────────────────────────────────────────────────────
export const toggleCondition = (m: Member, c: Condition): Member => ({
  ...m,
  conditions: m.conditions.includes(c) ? m.conditions.filter((x) => x !== c) : [...m.conditions, c],
})

export const addActivity = (m: Member): Member => ({ ...m, activities: [...m.activities, blankActivity()] })

export const updateActivity = (m: Member, next: Activity): Member => ({
  ...m,
  activities: m.activities.map((a) => (a.id === next.id ? next : a)),
})

export const removeActivity = (m: Member, id: string): Member => ({
  ...m,
  activities: m.activities.filter((a) => a.id !== id),
})

// ── Activity level ──────────────────────────────────────────────────────────
/** Turns travel details on (with sensible defaults) or off. */
export function setTravel(a: Activity, travel: boolean): Activity {
  if (travel) {
    return {
      ...a,
      mode: a.mode ?? DEFAULT_TRIP.mode,
      km: a.km ?? DEFAULT_TRIP.km,
      tripsPerWeek: a.tripsPerWeek ?? DEFAULT_TRIP.tripsPerWeek,
    }
  }
  return { ...a, mode: undefined, km: undefined, tripsPerWeek: undefined }
}

/** Changing the kind resets the effort to that kind's typical one; commutes and school runs involve travel. */
export const setKind = (a: Activity, kind: ActivityKind): Activity =>
  setTravel({ ...a, kind, effort: DEFAULT_EFFORT[kind] }, TRAVEL_KINDS.includes(kind))
