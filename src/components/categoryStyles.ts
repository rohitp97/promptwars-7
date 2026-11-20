import type { Category } from '../lib/aqi'

/** Text + tint per AQI category (pairs checked for contrast in tests). */
export const CATEGORY_CLASS: Record<Category, string> = {
  good: 'bg-goodSoft text-good',
  satisfactory: 'bg-satisfactorySoft text-satisfactory',
  moderate: 'bg-moderateSoft text-moderate',
  poor: 'bg-poorSoft text-poor',
  very_poor: 'bg-veryPoorSoft text-veryPoor',
  severe: 'bg-severeSoft text-severe',
}

/** Solid fills for chart bars (shapes, not text, so only 3:1 against white matters). */
export const CATEGORY_FILL: Record<Category, string> = {
  good: '#2f8f4e',
  satisfactory: '#6f9a1c',
  moderate: '#c79a00',
  poor: '#d9700f',
  very_poor: '#cc2f38',
  severe: '#7d1238',
}
