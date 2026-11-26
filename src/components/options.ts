import { MODES } from '../data/factors'
import { MODE_IDS } from '../lib/household'
import type { Mode } from '../types'

/** One choice in a SelectField. */
export interface Option<T extends string | number> {
  value: T
  label: string
}

/** Options from an id list and a label map. */
export const optionsFrom = <T extends string>(ids: readonly T[], labels: Record<T, string>): Option<T>[] =>
  ids.map((value) => ({ value, label: labels[value] }))

/** Every travel mode, labelled. */
export const MODE_OPTIONS: readonly Option<Mode>[] = MODE_IDS.map((m) => ({ value: m, label: MODES[m].label }))
