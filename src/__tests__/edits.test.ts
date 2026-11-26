// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { PRESETS } from '../data/presets'
import { sanitizeHousehold } from '../lib/household'
import {
  addActivity,
  addMember,
  addRoom,
  blankHousehold,
  removeActivity,
  removeMember,
  setKind,
  setTravel,
  toggleCondition,
  updateActivity,
  updateMember,
} from '../lib/householdEdits'
import { clampNumber } from '../lib/numbers'

const family = () => structuredClone(PRESETS[0].household)

describe('clampNumber', () => {
  const range = { min: 1, max: 14 }
  it('bounds and rounds', () => {
    expect(clampNumber('20', range)).toBe(14)
    expect(clampNumber(-3, range)).toBe(1)
    expect(clampNumber('2.6', range, { integer: true })).toBe(3)
    expect(clampNumber(2.6, range)).toBe(2.6)
  })
  it('non-numbers fall back', () => {
    expect(clampNumber('', range)).toBe(1)
    expect(clampNumber('abc', range, { fallback: 5 })).toBe(5)
    expect(clampNumber(null, range, { fallback: 5 })).toBe(5)
    expect(clampNumber(Number.POSITIVE_INFINITY, range, { fallback: 5 })).toBe(5)
  })
})

describe('household edits', () => {
  it('blank household is valid and has one person', () => {
    const h = blankHousehold()
    expect(h.members).toHaveLength(1)
    expect(h.members[0].name).toBe('Me')
    expect(sanitizeHousehold(h)).toEqual(h)
  })

  it('adds and removes people, never below one', () => {
    const h = addMember(family())
    expect(h.members).toHaveLength(6)
    expect(h.members[5].name).toBe('Person 6')
    const one = blankHousehold()
    expect(removeMember(one, one.members[0].id)).toBe(one)
    expect(removeMember(h, h.members[0].id).members).toHaveLength(5)
  })

  it('updates one person without touching the others', () => {
    const h = family()
    const next = updateMember(h, { ...h.members[1], name: 'Neha Ji' })
    expect(next.members[1].name).toBe('Neha Ji')
    expect(next.members[0]).toBe(h.members[0])
  })

  it('adds a room with the next number', () => {
    expect(addRoom(family()).home.rooms.at(-1)?.name).toBe('Room 3')
  })

  it('toggles health conditions', () => {
    const m = family().members[4]
    expect(toggleCondition(m, 'asthma').conditions).toEqual([])
    expect(toggleCondition(m, 'heart').conditions).toEqual(['asthma', 'heart'])
  })

  it('adds, updates and removes activities', () => {
    const m = family().members[1]
    const added = addActivity(m)
    expect(added.activities).toHaveLength(2)
    const id = added.activities[1].id
    expect(updateActivity(added, { ...added.activities[1], hour: 9 }).activities[1].hour).toBe(9)
    expect(removeActivity(added, id).activities).toHaveLength(1)
  })

  it('travel on/off keeps or clears trip details', () => {
    const walk = family().members[1].activities[0]
    const trip = setTravel(walk, true)
    expect(trip).toMatchObject({ mode: 'car_petrol', km: 5, tripsPerWeek: 5 })
    expect(setTravel({ ...trip, km: 12 }, true).km).toBe(12)
    expect(setTravel(trip, false)).toMatchObject({ mode: undefined, km: undefined, tripsPerWeek: undefined })
  })

  it('changing kind resets effort and travel', () => {
    const walk = family().members[1].activities[0]
    const commute = setKind(walk, 'commute')
    expect(commute).toMatchObject({ kind: 'commute', effort: 'rest', mode: 'car_petrol' })
    expect(setKind(commute, 'outdoor_play')).toMatchObject({ effort: 'vigorous', mode: undefined })
  })
})
