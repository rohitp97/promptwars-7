import { inputCls } from './ui'

import type { Option } from './options'

/** A labelled select that reports the chosen option's own value (string or number), not the DOM string. */
export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className = '',
  selectClassName = '',
}: {
  label: string
  value: T
  options: readonly Option<T>[]
  onChange: (value: T) => void
  className?: string
  selectClassName?: string
}) {
  return (
    <label className={className}>
      {label}
      <select
        className={`${inputCls} ${selectClassName}`}
        value={String(value)}
        onChange={(e) => {
          const picked = options.find((o) => String(o.value) === e.target.value)
          if (picked) onChange(picked.value)
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
