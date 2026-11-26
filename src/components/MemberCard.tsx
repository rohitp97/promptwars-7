import { Plus } from 'lucide-react'
import { MASK_LABEL } from '../data/factors'
import { AGE_GROUPS, AGE_LABEL, CONDITION_LABEL, CONDITIONS, LIMITS, MASKS } from '../lib/household'
import { addActivity, removeActivity, toggleCondition, updateActivity } from '../lib/householdEdits'
import type { Member } from '../types'
import { ActivityRow } from './ActivityRow'
import { optionsFrom } from './options'
import { SelectField } from './SelectField'
import { Button, inputCls } from './ui'

const AGE_OPTIONS = optionsFrom(AGE_GROUPS, AGE_LABEL)
const MASK_OPTIONS = optionsFrom(MASKS, MASK_LABEL)

/** One person: who they are, their health, their usual mask, and their outdoor activities. */
export function MemberCard({
  m,
  onChange,
  onRemove,
  canRemove,
}: {
  m: Member
  onChange: (m: Member) => void
  onRemove: () => void
  canRemove: boolean
}) {
  return (
    <article className="rounded-xl border border-line p-3">
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <label>
          Name
          <input
            className={inputCls}
            value={m.name}
            maxLength={24}
            onChange={(e) => onChange({ ...m, name: e.target.value })}
          />
        </label>
        <SelectField
          label="Age group"
          value={m.age}
          options={AGE_OPTIONS}
          onChange={(age) => onChange({ ...m, age })}
        />
        <SelectField
          label="Usual mask"
          value={m.mask}
          options={MASK_OPTIONS}
          onChange={(mask) => onChange({ ...m, mask })}
        />
        <div className="flex items-end justify-end">
          {canRemove && (
            <Button variant="ghost" onClick={onRemove}>
              Remove {m.name || 'person'}
            </Button>
          )}
        </div>
      </div>
      <fieldset className="mt-2">
        <legend className="text-sm font-semibold">Health</legend>
        <div className="mt-1 flex flex-wrap gap-3 text-sm">
          {CONDITIONS.map((c) => (
            <label key={c} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={m.conditions.includes(c)}
                onChange={() => onChange(toggleCondition(m, c))}
              />{' '}
              {CONDITION_LABEL[c]}
            </label>
          ))}
        </div>
      </fieldset>
      <h3 className="mt-3 text-sm font-semibold">Outdoor time and trips</h3>
      <div className="mt-1 space-y-2">
        {m.activities.map((a) => (
          <ActivityRow
            key={a.id}
            a={a}
            onChange={(next) => onChange(updateActivity(m, next))}
            onRemove={() => onChange(removeActivity(m, a.id))}
          />
        ))}
      </div>
      {m.activities.length < LIMITS.activitiesPerMember && (
        <Button variant="ghost" className="mt-2" onClick={() => onChange(addActivity(m))}>
          <span className="inline-flex items-center gap-1">
            <Plus size={14} aria-hidden /> Add activity
          </span>
        </Button>
      )}
    </article>
  )
}
