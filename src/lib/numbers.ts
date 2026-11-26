/** An inclusive numeric range, as used by LIMITS in household.ts. */
export interface Range {
  readonly min: number
  readonly max: number
}

/**
 * Any input (typed text, saved JSON, model output) → a number inside `range`. Non-numeric input
 * becomes `fallback` (the range minimum by default); `integer` rounds to whole numbers.
 * The single place where untrusted numbers are made safe, used by the sanitiser and every form field.
 */
export function clampNumber(
  value: unknown,
  range: Range,
  options: { fallback?: number; integer?: boolean } = {},
): number {
  const n =
    typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  const finite = Number.isFinite(n) ? n : (options.fallback ?? range.min)
  const bounded = Math.min(range.max, Math.max(range.min, finite))
  return options.integer ? Math.round(bounded) : bounded
}
