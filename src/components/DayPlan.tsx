import { Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { writeBrief, BRIEF_PARTS, type Brief } from '../lib/aiTasks'
import type { Facts } from '../lib/facts'
import type { Lang } from '../lib/prompts'
import { ruleBrief } from '../lib/ruleBrief'
import type { AiProvider } from '../types'
import { AqiBadge, Alert, Button, Card, H2, Note } from './ui'

const VERDICT: Record<string, { label: string; cls: string }> = {
  go: { label: 'Go as planned', cls: 'bg-goodSoft text-good' },
  shift: { label: 'Move it', cls: 'bg-moderateSoft text-moderate' },
  protect: { label: 'Go, but protect', cls: 'bg-poorSoft text-poor' },
  indoors: { label: 'Keep it indoors', cls: 'bg-veryPoorSoft text-veryPoor' },
}

const PART_TITLE: Record<(typeof BRIEF_PARTS)[number], string> = {
  headline: '',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  home: 'At home',
  together: 'One choice that helps everyone',
}

export function DayPlan({
  facts,
  ai,
  lang,
  onLang,
}: {
  facts: Facts
  ai: AiProvider | null
  lang: Lang
  onLang: (l: Lang) => void
}) {
  // An AI brief (or AI error) belongs to the facts it was written from. When live data or the
  // household changes, the facts object changes and the computed plan shows again automatically.
  const [aiResult, setAiResult] = useState<{ facts: Facts; brief?: Brief; error?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const current = aiResult?.facts === facts ? aiResult : null
  const rules = useMemo(() => ruleBrief(facts), [facts])
  const brief = current?.brief ?? rules
  const error = current?.error ?? null

  const personalise = async (): Promise<void> => {
    if (!ai) return
    setBusy(true)
    try {
      setAiResult({ facts, brief: await writeBrief(ai, facts, lang) })
    } catch (err) {
      const reason = err instanceof Error ? err.message.slice(0, 120) : 'unknown error'
      setAiResult({ facts, error: `The AI could not write the plan (${reason}). Showing the computed plan instead.` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card labelledBy="brief">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <H2 id="brief">Today's plan for your family</H2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-muted" htmlFor="lang">
              Language
            </label>
            <select
              id="lang"
              className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm"
              value={lang}
              onChange={(e) => onLang(e.target.value === 'hi' ? 'hi' : 'en')}
            >
              <option value="en">English</option>
              <option value="hi">हिन्दी</option>
            </select>
            <Button onClick={personalise} disabled={!ai || busy}>
              <span className="inline-flex items-center gap-1">
                <Sparkles size={16} aria-hidden />{' '}
                {busy ? 'Writing…' : brief.source === 'ai' ? 'Rewrite with AI' : 'Explain with AI'}
              </span>
            </Button>
          </div>
        </div>
        {!ai && (
          <Note>
            AI is not configured here, so this is the computed plan in plain sentences. Every recommendation below is
            the same either way.
          </Note>
        )}
        <div aria-live="polite" className="mt-3 space-y-3">
          {error && <Alert>{error}</Alert>}
          <p className="text-base font-semibold">{brief.headline}</p>
          {BRIEF_PARTS.filter((p) => p !== 'headline' && brief[p]).map((p) => (
            <div key={p}>
              <h3 className="text-sm font-bold uppercase tracking-wide text-brand">{PART_TITLE[p]}</h3>
              <p
                className="mt-0.5 text-sm leading-relaxed"
                lang={brief.source === 'ai' && lang === 'hi' ? 'hi' : undefined}
              >
                {brief[p]}
              </p>
            </div>
          ))}
          <p className="text-xs text-muted">
            {brief.source === 'ai'
              ? `Written by Gemini from the numbers below; every number was checked against them${brief.removed.length > 0 ? `, and ${brief.removed.length} sentence(s) with numbers that did not match were removed` : ''}.`
              : 'Computed plan (no AI). Press "Explain with AI" for a warmer, personalised version — the numbers stay the same.'}
          </p>
          {brief.removed.length > 0 && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">Show removed sentences</summary>
              <ul className="mt-1 list-disc pl-5">
                {brief.removed.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </Card>

      <Card labelledBy="per-person">
        <H2 id="per-person">Person by person</H2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {facts.members.map((m) => (
            <article key={m.name} className="rounded-xl border border-line p-3">
              <h3 className="font-bold">
                {m.name}{' '}
                <span className="text-sm font-normal text-muted">
                  · {m.age}
                  {m.conditions.length ? ` · ${m.conditions.join(', ')}` : ''}
                  {m.sensitive ? ' · sensitive group' : ''}
                </span>
              </h3>
              {m.advice.length === 0 && (
                <p className="mt-1 text-sm text-muted">No outdoor activities added. Add them under "Household".</p>
              )}
              <ul className="mt-2 space-y-3">
                {m.advice.map((a) => (
                  <li key={a.activity + a.planned}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{a.activity}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${VERDICT[a.verdict].cls}`}>
                        {VERDICT[a.verdict].label}
                      </span>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      {a.planned}: PM2.5 {a.pm25AtPlanned} <AqiBadge value={a.levelAtPlanned} prefix="level" />
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-sm">
                      {a.actions.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                    {a.percentLessSmogInhaled > 0 && (
                      <p className="mt-1 text-sm font-semibold text-good">
                        ≈ {a.percentLessSmogInhaled}% less PM2.5 breathed in
                      </p>
                    )}
                    <details className="mt-1 text-sm">
                      <summary className="cursor-pointer text-brand">Why?</summary>
                      <ul className="mt-1 list-disc pl-5 text-muted">
                        {a.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <Note>
          "Less PM2.5 breathed in" = forecast concentration × breathing rate for the effort and age × minutes × mask
          protection, compared with doing it as planned. Thresholds follow CPCB categories; children, elders and people
          with heart or lung conditions use the cautious limit. Not medical advice.
        </Note>
      </Card>
    </div>
  )
}
