/** India has one time zone and no daylight saving, so IST is a fixed +05:30 offset. */
const IST_OFFSET_MS = 330 * 60 * 1000

/** 'YYYY-MM-DDTHH:00' for the current hour in IST — the same shape Open-Meteo uses for hourly times. */
export function istHourKey(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 13) + ':00'
}

/** Hour of day (0-23) from an hourly key. */
export const hourOf = (key: string): number => Number(key.slice(11, 13))

/** Date part 'YYYY-MM-DD' of an hourly key. */
export const dayOf = (key: string): string => key.slice(0, 10)

/** '7 am', '12 noon', '5 pm'. */
export function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  if (h === 0) return '12 midnight'
  if (h === 12) return '12 noon'
  return h < 12 ? `${h} am` : `${h - 12} pm`
}

/** 'Today' / 'Tomorrow' / weekday for a key, relative to `todayKey`. */
export function dayLabel(key: string, todayKey: string): string {
  const diff = Math.round((Date.parse(dayOf(key)) - Date.parse(dayOf(todayKey))) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return new Date(dayOf(key) + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' })
}

/** CPCB's 'DD-MM-YYYY HH:MM:SS' → 'YYYY-MM-DDTHH:MM' (IST). Returns null for anything else. */
export function parseCpcbTime(raw: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})/.exec(raw.trim())
  if (!m) return null
  const [, d, mo, y, h, mi] = m
  return `${y}-${mo}-${d}T${h}:${mi}`
}

/** Whole hours between two local keys (b - a). */
export function hoursBetween(a: string, b: string): number {
  return Math.round((Date.parse(b.slice(0, 16) + ':00Z') - Date.parse(a.slice(0, 16) + ':00Z')) / 3_600_000)
}
