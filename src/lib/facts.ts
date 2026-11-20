import type { AirSnapshot, Household } from '../types'
import { category, hourlyLevel } from './aqi'
import { alternatives, savings } from './exposure'
import { assessRoom, SOURCE_TIPS } from './indoor'
import { adviseHousehold, isSensitive, whenText, type ActivityAdvice } from './plan'
import { dayLabel, formatHour, hourOf, istHourKey } from './time'
import { cleanestWindowOn, summariseDays, upcoming } from './windows'

/** The cleanest daytime hour to air the house (10 minutes of cross-ventilation), today or tomorrow. */
export function airingHour(snapshot: AirSnapshot, now: Date = new Date()): { at: string; pm25: number } | null {
  const nowKey = istHourKey(now)
  const ahead = upcoming(snapshot.hours, nowKey)
  if (ahead.length === 0) return null
  const today = nowKey.slice(0, 10)
  const startHour = Math.max(9, hourOf(nowKey))
  const todayWin = startHour < 18 ? cleanestWindowOn(ahead, today, 1, startHour, 18) : null
  const win = todayWin ?? cleanestWindowOn(ahead, ahead[ahead.length - 1].time.slice(0, 10), 1, 9, 18)
  return win ? { at: win.start, pm25: win.meanPm25 } : null
}

/** The household's highest-mileage trip and its best computed swap. */
export function mainCommuteSwap(household: Household, pm25: number) {
  const trips = household.members.flatMap((m) =>
    m.activities.filter((a) => a.mode && a.km).map((a) => ({ m, a, kmWeek: a.km! * 2 * (a.tripsPerWeek ?? 1) })),
  )
  if (trips.length === 0) return null
  const { m, a } = trips.reduce((x, y) => (y.kmWeek > x.kmWeek ? y : x))
  const options = alternatives({
    mode: a.mode!,
    km: a.km!,
    tripsPerWeek: a.tripsPerWeek ?? 5,
    pm25,
    age: m.age,
    mask: m.mask,
  })
  const [baseline, ...rest] = options
  if (rest.length === 0) return null
  const best = rest.reduce((x, y) => (y.co2KgWeek < x.co2KgWeek ? y : x))
  return { member: m.name, activity: a.label, from: baseline.label, to: best.label, ...savings(baseline, best) }
}

const adviceFact = (a: ActivityAdvice, nowKey: string) => ({
  activity: a.activity.label,
  planned: whenText(a.at, nowKey),
  pm25AtPlanned: a.pm25At,
  levelAtPlanned: a.levelAt,
  category: category(a.levelAt).label,
  verdict: a.verdict,
  betterTime: a.bestAt ? formatHour(hourOf(a.bestAt)) : null,
  pm25AtBetterTime: a.bestPm25 ?? null,
  percentLessSmogInhaled: a.doseCutPct,
  actions: a.actions,
  reasons: a.reasons,
})

/**
 * Everything the model is allowed to talk about, computed by code from live data. The model sees
 * only this; the verifier then checks its numbers against it.
 */
export function buildFacts(snapshot: AirSnapshot, household: Household, now: Date = new Date()) {
  const nowKey = istHourKey(now)
  const current = snapshot.hours.find((h) => h.time === nowKey) ?? snapshot.hours[0]
  const nearest = snapshot.stations[0]
  const advice = adviseHousehold(household.members, snapshot.hours, now)
  const outdoorNow = current ? current.pm25 : 0
  const airing = airingHour(snapshot, now)
  return {
    place: snapshot.place.name,
    state: snapshot.place.state,
    measuredByCpcb: nearest
      ? {
          station: nearest.station.name,
          distanceKm: nearest.distanceKm,
          aqi: nearest.aqi,
          category: category(nearest.aqi ?? 0).label,
          mainPollutant: nearest.dominant,
          pm25_24hAverage: nearest.pm25,
          updated: nearest.station.updated,
        }
      : null,
    stationNote: snapshot.stationNote ?? null,
    forecastNow: current
      ? {
          pm25: Math.round(current.pm25),
          level: hourlyLevel(current.pm25),
          category: category(hourlyLevel(current.pm25)).label,
        }
      : null,
    days: summariseDays(upcoming(snapshot.hours, nowKey)).map((d) => ({
      day: dayLabel(d.day + 'T00:00', nowKey),
      cleanestHour: formatHour(hourOf(d.best.time)),
      cleanestPm25: Math.round(d.best.pm25),
      worstHour: formatHour(hourOf(d.worst.time)),
      worstPm25: Math.round(d.worst.pm25),
      stagnantHours: d.stagnantHours,
    })),
    members: household.members.map((m) => ({
      name: m.name,
      age: m.age,
      sensitive: isSensitive(m),
      conditions: m.conditions,
      advice: advice.filter((a) => a.member.id === m.id).map((a) => adviceFact(a, nowKey)),
    })),
    home: {
      outdoorPm25Now: Math.round(outdoorNow),
      rooms: household.home.rooms.map((r) => {
        const v = assessRoom(r, outdoorNow, household.home.leakiness)
        return {
          room: r.name,
          indoorPm25WithWindowsShut: v.indoorNow,
          indoorPm25WithoutPurifier: v.indoorWithout,
          purifier: v.purifier,
          purifierCadr: r.purifierCadr,
          recommendedCadr: v.recommendedCadr,
          indoorPm25IfRightSized: v.indoorIfRightSized,
        }
      }),
      airTheHouseAt: airing ? whenText(airing.at, nowKey) : null,
      airingPm25: airing?.pm25 ?? null,
      sources: household.home.sources.map((s) => ({ source: SOURCE_TIPS[s].label, tip: SOURCE_TIPS[s].tip })),
    },
    commuteSwap: mainCommuteSwap(household, outdoorNow),
  }
}

export type Facts = ReturnType<typeof buildFacts>
