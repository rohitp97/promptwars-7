import { clampNumber, type Range } from '../lib/numbers'
import { inputCls } from './ui'

/** A labelled number input that only ever reports values inside its range. */
export function NumberField({
  label,
  value,
  range,
  onChange,
  step,
  integer = false,
  className = '',
  inputClassName = '',
}: {
  label: string
  value: number | undefined
  range: Range
  onChange: (value: number) => void
  step?: number
  integer?: boolean
  className?: string
  /** Extra classes for the input itself (e.g. a fixed width in a row of fields). */
  inputClassName?: string
}) {
  return (
    <label className={className}>
      {label}
      <input
        type="number"
        className={`${inputCls} ${inputClassName}`}
        min={range.min}
        max={range.max}
        step={step}
        value={value ?? ''}
        onChange={(e) => onChange(clampNumber(e.target.value, range, { integer }))}
      />
    </label>
  )
}
