import type { ForecastHour, Member } from '../types'

/** IST hourly keys starting at `day`T00:00 for `count` hours. */
export function hourKeys(day: string, count: number): string[] {
  const start = Date.parse(day + 'T00:00:00Z')
  return Array.from({ length: count }, (_, i) => new Date(start + i * 3_600_000).toISOString().slice(0, 13) + ':00')
}

/**
 * A typical winter-smog day shape: very high at night and early morning, cleanest around 2 pm.
 * pm25(hour) = base + amp * cos(2π (hour - 2) / 24)  →  peak at 2 am, minimum at 2 pm.
 */
export function smogHours(day: string, days = 3, base = 150, amp = 100): ForecastHour[] {
  return hourKeys(day, 24 * days).map((time) => {
    const h = Number(time.slice(11, 13))
    const pm25 = Math.round(base + amp * Math.cos((2 * Math.PI * (h - 2)) / 24))
    return {
      time,
      pm25,
      pm10: pm25 * 1.6,
      no2: 60,
      wind: h >= 11 && h <= 16 ? 8 : 2,
      mixing: h >= 11 && h <= 16 ? 900 : 120,
    }
  })
}

export const flatHours = (day: string, pm25: number, days = 3): ForecastHour[] =>
  hourKeys(day, 24 * days).map((time) => ({ time, pm25, pm10: pm25 * 1.5, no2: 40, wind: 10, mixing: 800 }))

/** A Date whose IST wall-clock time is `day`T`hh`:30. */
export const istDate = (day: string, hh: number): Date =>
  new Date(Date.parse(`${day}T${String(hh).padStart(2, '0')}:30:00+05:30`))

export const adult = (over: Partial<Member> = {}): Member => ({
  id: 'm1',
  name: 'Asha',
  age: 'adult',
  conditions: [],
  mask: 'none',
  activities: [],
  ...over,
})

/** A fetch stub that answers by URL substring. Unmatched URLs reject like a network failure. */
export function fakeFetch(routes: Array<[match: string | RegExp, body: unknown, status?: number]>) {
  const calls: string[] = []
  const fn = async (url: string): Promise<Response> => {
    calls.push(url)
    const route = routes.find(([m]) => (typeof m === 'string' ? url.includes(m) : m.test(url)))
    if (!route) throw new TypeError('Failed to fetch')
    const [, body, status = 200] = route
    const value = typeof body === 'function' ? (body as (u: string) => unknown)(url) : body
    return new Response(JSON.stringify(value), { status })
  }
  return { fn, calls }
}
