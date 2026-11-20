import { Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { answerQuestion, MAX_QUESTION_CHARS, questionLang } from '../lib/aiTasks'
import type { Facts } from '../lib/facts'
import type { Lang } from '../lib/prompts'
import { ruleAnswer } from '../lib/ruleBrief'
import type { AiProvider } from '../types'
import { Button, Card, H2, inputCls, Note } from './ui'

interface Turn {
  q: string
  a: string
  source: 'ai' | 'rules'
  removed: number
}

export function Ask({ facts, ai, lang }: { facts: Facts; ai: AiProvider | null; lang: Lang }) {
  const firstChild = facts.members.find((m) => m.age === 'child')
  const starters = [
    firstChild ? `Can ${firstChild.name} play outside this evening?` : 'Is it safe to go for a walk this evening?',
    'Should I run the purifier all night?',
    'Is my mask good enough for the commute?',
    'क्या आज सुबह खिड़की खोलनी चाहिए?',
  ]
  const [q, setQ] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)

  const ask = async (question: string): Promise<void> => {
    const text = question.trim()
    if (!text || busy) return
    setBusy(true)
    setQ('')
    let turn: Turn
    if (ai) {
      try {
        const a = await answerQuestion(ai, facts, text, questionLang(text, lang))
        turn = { q: text, a: a.text, source: 'ai', removed: a.removed.length }
      } catch {
        turn = { q: text, a: ruleAnswer(facts, text), source: 'rules', removed: 0 }
      }
    } else {
      turn = { q: text, a: ruleAnswer(facts, text), source: 'rules', removed: 0 }
    }
    setTurns((t) => [turn, ...t].slice(0, 10))
    setBusy(false)
  }

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    void ask(q)
  }

  return (
    <Card labelledBy="ask">
      <H2 id="ask">Ask about today's air</H2>
      <p className="mt-1 text-sm">Answers use only the live data and your family's plan, in English or Hindi.</p>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <label htmlFor="question" className="sr-only">
          Your question
        </label>
        <input
          id="question"
          className={`${inputCls} flex-1`}
          value={q}
          maxLength={MAX_QUESTION_CHARS}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Can Dadi go for her walk at 7?"
        />
        <Button type="submit" disabled={busy || !q.trim()}>
          <span className="inline-flex items-center gap-1">
            <Send size={16} aria-hidden /> {busy ? 'Thinking…' : 'Ask'}
          </span>
        </Button>
      </form>
      <div className="mt-2 flex flex-wrap gap-2">
        {starters.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void ask(s)}
            disabled={busy}
            className="rounded-full border border-line px-3 py-1 text-sm text-brand hover:bg-brandSoft"
          >
            {s}
          </button>
        ))}
      </div>
      <ol aria-live="polite" className="mt-4 space-y-3">
        {turns.map((t, i) => (
          <li key={`${i}-${t.q}`} className="rounded-xl bg-paper p-3 text-sm">
            <p className="font-semibold">{t.q}</p>
            <p className="mt-1 whitespace-pre-line" lang={/[ऀ-ॿ]/.test(t.a) ? 'hi' : undefined}>
              {t.a}
            </p>
            <p className="mt-1 text-xs text-muted">
              {t.source === 'ai'
                ? `Gemini, numbers checked against live data${t.removed > 0 ? ` (${t.removed} unverified sentence(s) removed)` : ''}`
                : 'Matched to your computed plan (AI unavailable)'}
            </p>
          </li>
        ))}
      </ol>
      <Note>
        Not medical advice. If someone has trouble breathing, chest pain or blue lips, get medical help right away.
      </Note>
    </Card>
  )
}
