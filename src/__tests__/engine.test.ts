// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { alternatives, inhaledDose, pctLess, savings, tripMinutes, tripOption } from '../lib/exposure'
import { assessRoom, indoorPm25, minutesToClear, recommendedCadr, roomVolumeM3 } from '../lib/indoor'
import {
  adviseActivity,
  adviseHousehold,
  byPartOfDay,
  isSensitive,
  partOfDay,
  shiftRange,
  thresholds,
} from '../lib/plan'
import { dayLabel, formatHour, hoursBetween, istHourKey, parseCpcbTime } from '../lib/time'
import { cleanestWindow, isStagnant, meanAt, summariseDays, upcoming } from '../lib/windows'
import type { Activity, Room } from '../types'
import { adult, flatHours, istDate, smogHours } from './fixtures'

const DAY = '2026-11-21'

describe('time', () => {
  it('IST hour key', () => {
    expect(istHourKey(new Date('2026-11-20T17:45:00Z'))).toBe('2026-11-20T23:00')
  })
  it('formats hours', () => {
    expect([0, 7, 12, 17].map(formatHour)).toEqual(['12 midnight', '7 am', '12 noon', '5 pm'])
  })
  it('labels days', () => {
    expect(dayLabel('2026-11-21T08:00', '2026-11-20T23:00')).toBe('Tomorrow')
    expect(dayLabel('2026-11-20T08:00', '2026-11-20T23:00')).toBe('Today')
    expect(dayLabel('2026-11-19T08:00', '2026-11-20T23:00')).toBe('Yesterday')
    expect(dayLabel('2026-11-23T08:00', '2026-11-20T23:00')).toBe('Monday')
  })
  it('parses CPCB timestamps', () => {
    expect(parseCpcbTime('20-11-2026 22:00:00')).toBe('2026-11-20T22:00')
    expect(parseCpcbTime('yesterday')).toBeNull()
  })
  it('hours between keys', () => {
    expect(hoursBetween('2026-11-20T22:00', '2026-11-21T01:00')).toBe(3)
  })
})

describe('windows', () => {
  const hours = smogHours(DAY)
  it('finds the cleanest daytime window (2 pm in a winter-smog day)', () => {
    const w = cleanestWindow(hours.slice(0, 24), 1)!
    expect(w.start).toBe(`${DAY}T14:00`)
    expect(w.meanPm25).toBe(50)
  })
  it('never suggests night hours', () => {
    const w = cleanestWindow(hours.slice(0, 24), 2, 6, 10)!
    expect(Number(w.start.slice(11, 13))).toBeGreaterThanOrEqual(6)
  })
  it('returns null when nothing fits', () => {
    expect(cleanestWindow(hours.slice(0, 3), 1)).toBeNull()
  })
  it('meanAt', () => {
    expect(meanAt(flatHours(DAY, 80), `${DAY}T05:00`, 2)).toBe(80)
    expect(meanAt(flatHours(DAY, 80), 'missing', 1)).toBeNull()
  })
  it('upcoming covers now to end of tomorrow', () => {
    const u = upcoming(hours, `${DAY}T22:00`)
    expect(u[0].time).toBe(`${DAY}T22:00`)
    expect(u[u.length - 1].time).toBe('2026-11-22T23:00')
    expect(upcoming(hours, '2030-01-01T00:00')).toEqual([])
  })
  it('stagnation and day summaries', () => {
    expect(isStagnant({ time: '', pm25: 1, pm10: 1, no2: 1, wind: 2, mixing: 900 })).toBe(true)
    expect(isStagnant({ time: '', pm25: 1, pm10: 1, no2: 1, wind: 10, mixing: 900 })).toBe(false)
    const [d] = summariseDays(hours)
    expect(d.best.time).toBe(`${DAY}T14:00`)
    expect(d.worst.time).toBe(`${DAY}T06:00`)
    expect(d.stagnantHours).toBe(9)
  })
})

describe('exposure', () => {
  it('dose scales with concentration, effort, age and mask', () => {
    const base = { pm25: 100, minutes: 60, effort: 'light' as const, age: 'adult' as const, mask: 'none' as const }
    expect(inhaledDose(base)).toBe(80)
    expect(inhaledDose({ ...base, effort: 'vigorous' })).toBe(300)
    expect(inhaledDose({ ...base, age: 'child' })).toBeCloseTo(56)
    expect(inhaledDose({ ...base, mask: 'n95' })).toBeCloseTo(20)
    expect(inhaledDose({ ...base, ratio: 1.4 })).toBeCloseTo(112)
  })
  it('pctLess', () => {
    expect(pctLess(100, 25)).toBe(75)
    expect(pctLess(0, 5)).toBe(0)
  })
  it('trip time has a floor', () => {
    expect(tripMinutes('metro', 0.5)).toBe(5)
    expect(tripMinutes('car_petrol', 22)).toBe(60)
  })
  it('trip option: emissions per week and carpool split', () => {
    const solo = tripOption({ mode: 'car_petrol', km: 10, tripsPerWeek: 5, pm25: 200, age: 'adult', mask: 'none' })
    expect(solo.co2KgWeek).toBe(17)
    const pool = tripOption({
      mode: 'car_petrol',
      occupants: 2,
      km: 10,
      tripsPerWeek: 5,
      pm25: 200,
      age: 'adult',
      mask: 'none',
    })
    expect(pool.co2KgWeek).toBe(8.5)
    expect(pool.doseRoundTrip).toBe(solo.doseRoundTrip)
    expect(pool.label).toContain('pool')
  })
  it('cars are never masked; open modes are', () => {
    const car = tripOption({ mode: 'car_petrol', km: 10, tripsPerWeek: 5, pm25: 200, age: 'adult', mask: 'n95' })
    const carNoMask = tripOption({ mode: 'car_petrol', km: 10, tripsPerWeek: 5, pm25: 200, age: 'adult', mask: 'none' })
    expect(car.doseRoundTrip).toBe(carNoMask.doseRoundTrip)
    const bus = tripOption({ mode: 'bus', km: 10, tripsPerWeek: 5, pm25: 200, age: 'adult', mask: 'n95' })
    const busNoMask = tripOption({ mode: 'bus', km: 10, tripsPerWeek: 5, pm25: 200, age: 'adult', mask: 'none' })
    expect(bus.doseRoundTrip).toBeLessThan(busNoMask.doseRoundTrip)
  })
  it('alternatives are realistic for the distance and mode', () => {
    const long = alternatives({
      mode: 'car_petrol',
      km: 18,
      tripsPerWeek: 5,
      pm25: 200,
      age: 'adult',
      mask: 'none',
    }).map((o) => o.label)
    expect(long).toEqual(['Petrol car', 'Petrol car pool (3 people)', 'Metro', 'Bus', 'Electric car'])
    const short = alternatives({
      mode: 'two_wheeler',
      km: 2,
      tripsPerWeek: 5,
      pm25: 200,
      age: 'adult',
      mask: 'none',
    }).map((o) => o.mode)
    expect(short).toEqual(['two_wheeler', 'metro', 'bus', 'cycle', 'walk'])
  })
  it('savings over a week and a season', () => {
    const [car, , metro] = alternatives({
      mode: 'car_petrol',
      km: 18,
      tripsPerWeek: 5,
      pm25: 200,
      age: 'adult',
      mask: 'none',
    })
    const s = savings(car, metro)
    expect(s.co2KgWeek).toBe(26.1)
    expect(s.co2KgSeason).toBe(339)
    expect(s.pm25GWeek).toBeGreaterThan(5)
  })
})

describe('indoor', () => {
  const room: Room = { id: 'r', name: 'Bedroom', areaSqft: 150, heightFt: 10, purifierCadr: 0 }
  it('room volume', () => {
    expect(roomVolumeM3(room)).toBe(42.5)
  })
  it('indoor without purifier follows infiltration', () => {
    // 0.8 * 0.8 * 200 / (0.8 + 0.2) = 128
    expect(indoorPm25(200, room, 'average')).toBe(128)
    expect(indoorPm25(200, room, 'sealed')).toBeLessThan(indoorPm25(200, room, 'leaky'))
  })
  it('a purifier lowers it and is sized at 5 air changes', () => {
    expect(recommendedCadr(room)).toBe(220)
    expect(indoorPm25(200, { ...room, purifierCadr: 220 }, 'average')).toBe(21)
  })
  it('verdicts', () => {
    expect(assessRoom(room, 200, 'average').purifier).toBe('none')
    expect(assessRoom({ ...room, purifierCadr: 100 }, 200, 'average').purifier).toBe('undersized')
    const ok = assessRoom({ ...room, purifierCadr: 250 }, 200, 'average')
    expect(ok.purifier).toBe('ok')
    expect(ok.minutesToClear).toBeGreaterThan(10)
    expect(ok.minutesToClear).toBeLessThan(40)
  })
  it('minutesToClear handles an empty room', () => {
    expect(minutesToClear({ ...room, areaSqft: 0 }, 'average')).toBeNull()
  })
})

const walk: Activity = {
  id: 'a1',
  kind: 'walk',
  label: 'Morning walk',
  hour: 7,
  minutes: 45,
  effort: 'light',
  flexible: true,
}
const commute: Activity = {
  id: 'a2',
  kind: 'commute',
  label: 'Drive',
  hour: 8,
  minutes: 50,
  effort: 'rest',
  flexible: true,
  mode: 'car_petrol',
  km: 18,
  tripsPerWeek: 5,
}
const play: Activity = {
  id: 'a3',
  kind: 'outdoor_play',
  label: 'Cricket',
  hour: 17,
  minutes: 60,
  effort: 'vigorous',
  flexible: true,
}

describe('plan', () => {
  const nowKey = '2026-11-21T05:00'
  const hours = smogHours(DAY)

  it('sensitivity and thresholds', () => {
    expect(isSensitive(adult())).toBe(false)
    expect(isSensitive(adult({ age: 'child' }))).toBe(true)
    expect(isSensitive(adult({ conditions: ['asthma'] }))).toBe(true)
    expect(thresholds(adult(), 'light')).toEqual({ caution: 200, avoid: 300 })
    expect(thresholds(adult({ age: 'elder' }), 'vigorous')).toEqual({ caution: 50, avoid: 100 })
  })

  it('clean air: go as planned', () => {
    const a = adviseActivity(adult(), walk, flatHours(DAY, 20), nowKey)!
    expect(a.verdict).toBe('go')
    expect(a.doseCutPct).toBe(0)
  })

  it('moves a flexible walk to the cleanest hour, for a sensitive elder', () => {
    const a = adviseActivity(adult({ name: 'Dadi', age: 'elder', conditions: ['asthma'] }), walk, hours, nowKey)!
    expect(a.verdict).toBe('shift')
    expect(a.bestAt).toBe(`${DAY}T14:00`)
    expect(a.doseCutPct).toBeGreaterThan(50)
    expect(a.reasons.join(' ')).toMatch(/sensitive group/)
    expect(a.reasons.join(' ')).toMatch(/Still air/)
  })

  it('moves a commute only within ±2 hours', () => {
    expect(shiftRange(commute)).toEqual({ from: 6, to: 11 })
    const a = adviseActivity(adult(), commute, hours, nowKey)!
    expect(a.verdict).toBe('shift')
    expect(a.bestAt).toBe(`${DAY}T10:00`)
  })

  it('a fixed trip in bad air gets protection, not a new time', () => {
    const a = adviseActivity(
      adult({ mask: 'cloth' }),
      { ...commute, flexible: false, mode: 'two_wheeler' },
      flatHours(DAY, 250),
      nowKey,
    )!
    expect(a.verdict).toBe('protect')
    expect(a.actions.join(' ')).toMatch(/N95/)
    expect(a.actions.join(' ')).toMatch(/metro/)
    expect(a.doseCutPct).toBeGreaterThan(50)
  })

  it('children play indoors when no hour is acceptable', () => {
    const a = adviseActivity(adult({ age: 'child' }), play, flatHours(DAY, 200), nowKey)!
    expect(a.verdict).toBe('indoors')
    expect(a.actions[0]).toMatch(/Indoor play/)
  })

  it('a time already past today is planned for tomorrow', () => {
    const a = adviseActivity(adult(), walk, hours, '2026-11-21T20:00')!
    expect(a.at).toBe('2026-11-22T07:00')
  })

  it('returns null when the forecast does not reach the activity', () => {
    expect(adviseActivity(adult(), walk, hours.slice(0, 3), nowKey)).toBeNull()
  })

  it('advises a whole household and groups by part of day', () => {
    const members = [adult({ activities: [walk, commute] }), adult({ id: 'k', age: 'child', activities: [play] })]
    const advice = adviseHousehold(members, hours, istDate(DAY, 5))
    expect(advice).toHaveLength(3)
    const parts = byPartOfDay(advice)
    expect(parts.morning.length + parts.afternoon.length + parts.evening.length).toBe(3)
    expect([partOfDay(9), partOfDay(13), partOfDay(19)]).toEqual(['morning', 'afternoon', 'evening'])
  })
})
