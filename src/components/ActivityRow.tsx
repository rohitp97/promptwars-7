import { Trash2 } from 'lucide-react'
import { KIND_LABEL, KINDS, LIMITS } from '../lib/household'
import { setKind, setTravel } from '../lib/householdEdits'
import { formatHour } from '../lib/time'
import type { Activity, Mode } from '../types'
import { NumberField } from './NumberField'
import { MODE_OPTIONS, optionsFrom } from './options'
import { SelectField } from './SelectField'
import { inputCls } from './ui'

const KIND_OPTIONS = optionsFrom(KINDS, KIND_LABEL)
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: formatHour(h) }))
const HOUR_RANGE = { min: 0, max: 23 } as const

/** One outdoor activity or trip: what, when, how long, and (for trips) how and how far. */
export function ActivityRow({
  a,
  onChange,
  onRemove,
}: {
  a: Activity
  onChange: (a: Activity) => void
  onRemove: () => void
}) {
  const travel = a.mode !== undefined
  return (
    <fieldset className="rounded-lg border border-line p-2">
      <legend className="sr-only">{a.label}</legend>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <label className="col-span-2">
          What
          <input
            className={inputCls}
            value={a.label}
            maxLength={40}
            onChange={(e) => onChange({ ...a, label: e.target.value })}
          />
        </label>
        <SelectField
          label="Type"
          value={a.kind}
          options={KIND_OPTIONS}
          onChange={(kind) => onChange(setKind(a, kind))}
        />
        <SelectField
          label="Starts"
          value={a.hour}
          options={HOUR_OPTIONS}
          onChange={(hour) => onChange({ ...a, hour: Math.min(HOUR_RANGE.max, Math.max(HOUR_RANGE.min, hour)) })}
        />
        <NumberField
          label="Minutes"
          value={a.minutes}
          range={LIMITS.minutes}
          integer
          onChange={(minutes) => onChange({ ...a, minutes })}
        />
        <label className="flex items-end gap-2 pb-2">
          <input
            type="checkbox"
            checked={a.flexible}
            onChange={(e) => onChange({ ...a, flexible: e.target.checked })}
          />{' '}
          Time can move
        </label>
        <label className="flex items-end gap-2 pb-2">
          <input type="checkbox" checked={travel} onChange={(e) => onChange(setTravel(a, e.target.checked))} /> Involves
          travel
        </label>
        <div className="flex items-end justify-end">
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg p-2 text-veryPoor hover:bg-veryPoorSoft"
            aria-label={`Remove ${a.label}`}
          >
            <Trash2 size={16} aria-hidden />
          </button>
        </div>
        {a.mode !== undefined && (
          <>
            <SelectField<Mode>
              label="By"
              value={a.mode}
              options={MODE_OPTIONS}
              onChange={(mode) => onChange({ ...a, mode })}
            />
            <NumberField
              label="km one way"
              value={a.km}
              range={LIMITS.km}
              step={0.5}
              onChange={(km) => onChange({ ...a, km })}
            />
            <NumberField
              label="Round trips/week"
              value={a.tripsPerWeek}
              range={LIMITS.tripsPerWeek}
              integer
              onChange={(tripsPerWeek) => onChange({ ...a, tripsPerWeek })}
            />
          </>
        )}
      </div>
    </fieldset>
  )
}
