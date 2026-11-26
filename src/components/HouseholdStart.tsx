import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { PRESETS } from '../data/presets'
import { intakeHousehold, MAX_INTAKE_CHARS } from '../lib/aiTasks'
import { blankHousehold } from '../lib/householdEdits'
import type { AiProvider, Household } from '../types'
import { Alert, Button, Card, H2, inputCls, Note } from './ui'

/** The shortest description worth sending to the model. */
const MIN_DESCRIPTION_CHARS = 10

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
            onClick={() => onSet(structuredClone(p.household))}
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
          <Button onClick={describe} disabled={!ai || busy || text.trim().length < MIN_DESCRIPTION_CHARS}>
            <span className="inline-flex items-center gap-1">
              <Sparkles size={16} aria-hidden /> {busy ? 'Reading…' : 'Build my household'}
            </span>
          </Button>
          <Button variant="ghost" onClick={() => setText(PRESETS[0].sampleText)}>
            Paste a sample description
          </Button>
          <Button variant="ghost" onClick={() => onSet(blankHousehold())}>
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
