import type { Brief } from './aiTasks'
import type { Facts } from './facts'

type MemberFact = Facts['members'][number]
type AdviceFact = MemberFact['advice'][number]

/** Part of day from a formatted time such as 'Today 5 pm' or '12 noon'. */
export function part(planned: string, betterTime: string | null): 'morning' | 'afternoon' | 'evening' {
  const m = /(\d+)\s*(am|pm|noon|midnight)/.exec(betterTime ?? planned)
  if (!m) return 'morning'
  let h = Number(m[1]) % 12
  if (m[2] === 'pm') h += 12
  if (m[2] === 'noon') h = 12
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
}

export function adviceSentence(name: string, a: AdviceFact): string {
  const first = a.actions[0] ?? ''
  const cut =
    a.percentLessSmogInhaled > 0 ? ` That means about ${a.percentLessSmogInhaled}% less smog breathed in.` : ''
  if (a.verdict === 'go') return `${name}: ${a.activity} (${a.planned}) is fine as planned at PM2.5 ${a.pm25AtPlanned}.`
  return `${name}: ${a.activity} (${a.planned}, PM2.5 ${a.pm25AtPlanned}, ${a.category}). ${first}${cut}`
}

/** The same plan in plain template sentences, used when AI is not configured or fails. */
export function ruleBrief(facts: Facts): Brief {
  const parts = { morning: [] as string[], afternoon: [] as string[], evening: [] as string[] }
  for (const m of facts.members) {
    for (const a of m.advice) parts[part(a.planned, a.betterTime)].push(adviceSentence(m.name, a))
  }
  const station = facts.measuredByCpcb
  const headline = station
    ? `${station.station} (${station.distanceKm} km away) reports AQI ${station.aqi}, ${station.category}.`
    : facts.forecastNow
      ? `Forecast PM2.5 near ${facts.place} is ${facts.forecastNow.pm25} µg/m³ right now (${facts.forecastNow.category}).`
      : `Air data for ${facts.place}.`
  const today = facts.days[0]
  const quiet = (label: string): string =>
    today
      ? `Nothing planned in the ${label}. ${today.day}'s cleanest hour is ${today.cleanestHour} (PM2.5 ${today.cleanestPm25}).`
      : `Nothing planned in the ${label}.`

  const rooms = facts.home.rooms
    .map((r) =>
      r.purifier === 'ok'
        ? `${r.room}: purifier is big enough, indoor PM2.5 about ${r.indoorPm25WithWindowsShut} with windows shut.`
        : `${r.room}: indoor PM2.5 about ${r.indoorPm25WithWindowsShut} with windows shut; a purifier of ${r.recommendedCadr} m³/h CADR would bring it to about ${r.indoorPm25IfRightSized}.`,
    )
    .join(' ')
  const airing = facts.home.airTheHouseAt
    ? ` Air the house for 10 minutes ${facts.home.airTheHouseAt} (PM2.5 ${facts.home.airingPm25}).`
    : ''
  const source = facts.home.sources[0] ? ` ${facts.home.sources[0].tip}` : ''
  const swap = facts.commuteSwap
  const together = swap
    ? `${swap.member}: switching ${swap.activity.toLowerCase()} from ${swap.from} to ${swap.to} saves about ${swap.co2KgWeek} kg CO2 and ${swap.pm25GWeek} g of PM2.5 a week (${swap.co2KgSeason} kg CO2 over the smog season) — less smog for the whole street, not just you.`
    : 'Combine errands into one trip and avoid burning leaves or waste: every vehicle-km and fire adds to the smog your neighbours breathe.'

  return {
    headline,
    morning: parts.morning.join(' ') || quiet('morning'),
    afternoon: parts.afternoon.join(' ') || quiet('afternoon'),
    evening: parts.evening.join(' ') || quiet('evening'),
    home: (rooms + airing + source).trim(),
    together,
    removed: [],
    source: 'rules',
  }
}

/** Keyword answers for the no-AI case: point at the computed advice that matches the question. */
export function ruleAnswer(facts: Facts, question: string): string {
  const q = question.toLowerCase()
  for (const m of facts.members) {
    for (const a of m.advice) {
      const words = [
        m.name.toLowerCase(),
        ...a.activity
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3),
      ]
      if (words.some((w) => q.includes(w))) return adviceSentence(m.name, a)
    }
  }
  if (/purifier|indoor|room|home|ghar/.test(q)) return ruleBrief(facts).home
  if (/commute|car|metro|office|travel/.test(q) && facts.commuteSwap) return ruleBrief(facts).together
  const d = facts.days[0]
  return d
    ? `${d.day}'s cleanest hour is ${d.cleanestHour} (PM2.5 ${d.cleanestPm25}) and the worst is ${d.worstHour} (PM2.5 ${d.worstPm25}). Add the activity you are asking about in "Your household" for a specific answer.`
    : 'Add the activity you are asking about in "Your household" for a specific answer.'
}
