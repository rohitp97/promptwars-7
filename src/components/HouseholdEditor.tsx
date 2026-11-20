import { Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { MASK_LABEL, MODES } from '../data/factors'
import { intakeHousehold, MAX_INTAKE_CHARS } from '../lib/aiTasks'
import {
  AGE_GROUPS,
  AGE_LABEL,
  CONDITION_LABEL,
  CONDITIONS,
  DEFAULT_EFFORT,
  KIND_LABEL,
  KINDS,
  LIMITS,
  MASKS,
  MODE_IDS,
  newId,
  PRESETS,
  sanitizeHousehold,
  TRAVEL_KINDS,
} from '../lib/household'
import { formatHour } from '../lib/time'
import type { Activity, ActivityKind, AiProvider, Household, Member } from '../types'
import { Alert, Button, Card, H2, inputCls, Note } from './ui'

const clampInt = (v: string, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(Number(v) || min)))

/** Starting points: one click for an evaluator, or a description the AI turns into a household. */
export function HouseholdStart({ ai, onSet }: { ai: AiProvider | null; onSet: (h: Household) => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const describe = async (): Promise<void> => {
    if (!ai) return
    setBusy(true)
    setError(null)
    try {
      onSet(await intakeHousehold(ai, text))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that description.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card labelledBy="who">
      <H2 id="who">Who lives at home?</H2>
      <p className="mt-1 text-sm">
        Advice depends on who is breathing: a child playing cricket and a parent driving to work need different plans.
        Pick a sample family or describe yours.
      </p>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSet(sanitizeHousehold(structuredClone(p.household))!)}
            className="rounded-xl border border-line p-3 text-left hover:border-brand hover:bg-brandSoft"
          >
            <span className="block font-semibold text-brand">{p.title}</span>
            <span className="mt-1 block text-sm">{p.blurb}</span>
          </button>
        ))}
      </div>
      <div className="mt-4">
        <label htmlFor="describe" className="text-sm font-semibold">
          Or describe your household in your own words (English or Hindi)
        </label>
        <textarea
          id="describe"
          className={`${inputCls} mt-1 min-h-[110px]`}
          maxLength={MAX_INTAKE_CHARS}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PRESETS[0].sampleText}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button onClick={describe} disabled={!ai || busy || text.trim().length < 10}>
            <span className="inline-flex items-center gap-1">
              <Sparkles size={16} aria-hidden /> {busy ? 'Reading…' : 'Build my household'}
            </span>
          </Button>
          <Button variant="ghost" onClick={() => setText(PRESETS[0].sampleText)}>
            Paste a sample description
          </Button>
          <Button
            variant="ghost"
            onClick={() => onSet(sanitizeHousehold({ members: [{ name: 'Me', activities: [] }] })!)}
          >
            Start blank and fill it in myself
          </Button>
        </div>
        {!ai && <Note>AI is not configured here; use a sample family or start blank.</Note>}
        <div aria-live="polite" className="mt-2">
          {error && <Alert tone="error">{error}</Alert>}
        </div>
        <Note>
          Your household stays in this browser. Only when you use the AI is the description sent to Gemini to be read.
        </Note>
      </div>
    </Card>
  )
}

function ActivityRow({
  a,
  onChange,
  onRemove,
}: {
  a: Activity
  onChange: (a: Activity) => void
  onRemove: () => void
}) {
  const travel = a.mode !== undefined
  const setKind = (kind: ActivityKind): void => {
    const isTravel = TRAVEL_KINDS.includes(kind)
    onChange({
      ...a,
      kind,
      effort: DEFAULT_EFFORT[kind],
      mode: isTravel ? (a.mode ?? 'car_petrol') : undefined,
      km: isTravel ? (a.km ?? 5) : undefined,
      tripsPerWeek: isTravel ? (a.tripsPerWeek ?? 5) : undefined,
    })
  }
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
        <label>
          Type
          <select className={inputCls} value={a.kind} onChange={(e) => setKind(e.target.value as ActivityKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Starts
          <select
            className={inputCls}
            value={a.hour}
            onChange={(e) => onChange({ ...a, hour: Number(e.target.value) })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {formatHour(h)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Minutes
          <input
            type="number"
            className={inputCls}
            min={LIMITS.minutes.min}
            max={LIMITS.minutes.max}
            value={a.minutes}
            onChange={(e) =>
              onChange({ ...a, minutes: clampInt(e.target.value, LIMITS.minutes.min, LIMITS.minutes.max) })
            }
          />
        </label>
        <label className="flex items-end gap-2 pb-2">
          <input
            type="checkbox"
            checked={a.flexible}
            onChange={(e) => onChange({ ...a, flexible: e.target.checked })}
          />{' '}
          Time can move
        </label>
        <label className="flex items-end gap-2 pb-2">
          <input
            type="checkbox"
            checked={travel}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? { ...a, mode: 'car_petrol', km: 5, tripsPerWeek: 5 }
                  : { ...a, mode: undefined, km: undefined, tripsPerWeek: undefined },
              )
            }
          />{' '}
          Involves travel
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
        {travel && (
          <>
            <label>
              By
              <select
                className={inputCls}
                value={a.mode}
                onChange={(e) => onChange({ ...a, mode: e.target.value as Activity['mode'] })}
              >
                {MODE_IDS.map((m) => (
                  <option key={m} value={m}>
                    {MODES[m].label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              km one way
              <input
                type="number"
                className={inputCls}
                min={LIMITS.km.min}
                max={LIMITS.km.max}
                step={0.5}
                value={a.km}
                onChange={(e) =>
                  onChange({
                    ...a,
                    km: Math.min(LIMITS.km.max, Math.max(LIMITS.km.min, Number(e.target.value) || LIMITS.km.min)),
                  })
                }
              />
            </label>
            <label>
              Round trips/week
              <input
                type="number"
                className={inputCls}
                min={1}
                max={14}
                value={a.tripsPerWeek}
                onChange={(e) => onChange({ ...a, tripsPerWeek: clampInt(e.target.value, 1, 14) })}
              />
            </label>
          </>
        )}
      </div>
    </fieldset>
  )
}

function MemberCard({
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
  const toggle = (c: (typeof CONDITIONS)[number]): void =>
    onChange({
      ...m,
      conditions: m.conditions.includes(c) ? m.conditions.filter((x) => x !== c) : [...m.conditions, c],
    })
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
        <label>
          Age group
          <select
            className={inputCls}
            value={m.age}
            onChange={(e) => onChange({ ...m, age: e.target.value as Member['age'] })}
          >
            {AGE_GROUPS.map((g) => (
              <option key={g} value={g}>
                {AGE_LABEL[g]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Usual mask
          <select
            className={inputCls}
            value={m.mask}
            onChange={(e) => onChange({ ...m, mask: e.target.value as Member['mask'] })}
          >
            {MASKS.map((k) => (
              <option key={k} value={k}>
                {MASK_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
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
              <input type="checkbox" checked={m.conditions.includes(c)} onChange={() => toggle(c)} />{' '}
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
            onChange={(next) => onChange({ ...m, activities: m.activities.map((x) => (x.id === a.id ? next : x)) })}
            onRemove={() => onChange({ ...m, activities: m.activities.filter((x) => x.id !== a.id) })}
          />
        ))}
      </div>
      {m.activities.length < LIMITS.activitiesPerMember && (
        <Button
          variant="ghost"
          className="mt-2"
          onClick={() =>
            onChange({
              ...m,
              activities: [
                ...m.activities,
                { id: newId('a'), kind: 'walk', label: 'Walk', hour: 7, minutes: 30, effort: 'light', flexible: true },
              ],
            })
          }
        >
          <span className="inline-flex items-center gap-1">
            <Plus size={14} aria-hidden /> Add activity
          </span>
        </Button>
      )}
    </article>
  )
}

export function HouseholdEditor({
  household,
  onChange,
  onReset,
}: {
  household: Household
  onChange: (h: Household) => void
  onReset: () => void
}) {
  const setMember = (id: string, m: Member): void =>
    onChange({ ...household, members: household.members.map((x) => (x.id === id ? m : x)) })
  return (
    <Card labelledBy="household">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <H2 id="household">Your household</H2>
        <Button variant="ghost" onClick={onReset}>
          Start over
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted">Changes apply instantly to the plan. Saved in this browser only.</p>
      <div className="mt-3 space-y-3">
        {household.members.map((m) => (
          <MemberCard
            key={m.id}
            m={m}
            canRemove={household.members.length > 1}
            onChange={(next) => setMember(m.id, next)}
            onRemove={() => onChange({ ...household, members: household.members.filter((x) => x.id !== m.id) })}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {household.members.length < LIMITS.members && (
          <Button
            variant="ghost"
            onClick={() =>
              onChange({
                ...household,
                members: [
                  ...household.members,
                  {
                    id: newId('m'),
                    name: `Person ${household.members.length + 1}`,
                    age: 'adult',
                    conditions: [],
                    mask: 'none',
                    activities: [],
                  },
                ],
              })
            }
          >
            <span className="inline-flex items-center gap-1">
              <Plus size={14} aria-hidden /> Add person
            </span>
          </Button>
        )}
        {household.home.rooms.length < LIMITS.rooms && (
          <Button
            variant="ghost"
            onClick={() =>
              onChange({
                ...household,
                home: {
                  ...household.home,
                  rooms: [
                    ...household.home.rooms,
                    {
                      id: newId('r'),
                      name: `Room ${household.home.rooms.length + 1}`,
                      areaSqft: 150,
                      heightFt: 10,
                      purifierCadr: 0,
                    },
                  ],
                },
              })
            }
          >
            <span className="inline-flex items-center gap-1">
              <Plus size={14} aria-hidden /> Add room
            </span>
          </Button>
        )}
      </div>
    </Card>
  )
}
