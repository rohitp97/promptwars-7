import type { AiProvider, AiRequest, Household } from '../types'
import { parseJsonLoose } from './ai'
import type { Facts } from './facts'
import { sanitizeHousehold } from './household'
import { ASK_SYSTEM, BRIEF_SYSTEM, INTAKE_SYSTEM, wrap, type Lang } from './prompts'
import { allowedNumbers, checkText } from './verify'

export const MAX_INTAKE_CHARS = 2000
export const MAX_QUESTION_CHARS = 300

/**
 * JSON mode is not a guarantee: in a live test Gemini returned a Hindi plan with a broken string
 * ("Expected ',' or '}' … at position 1242"). One fresh attempt almost always comes back valid,
 * so a malformed reply is retried once before the caller falls back to the computed plan.
 */
export async function generateJson(ai: AiProvider, req: AiRequest): Promise<unknown> {
  try {
    return parseJsonLoose(await ai.generate(req))
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err
    return parseJsonLoose(await ai.generate(req))
  }
}

/** Free text → validated household. The model proposes, sanitizeHousehold() decides. */
export async function intakeHousehold(ai: AiProvider, description: string): Promise<Household> {
  const text = description.trim().slice(0, MAX_INTAKE_CHARS)
  if (text.length < 10) throw new Error('Tell us a little more about who lives at home and their day.')
  const household = sanitizeHousehold(
    await generateJson(ai, { systemInstruction: INTAKE_SYSTEM, prompt: wrap('household', text), json: true }),
  )
  if (!household) throw new Error('Could not find any people in that description. Try naming who lives at home.')
  return household
}

export const BRIEF_PARTS = ['headline', 'morning', 'afternoon', 'evening', 'home', 'together'] as const
export type BriefPart = (typeof BRIEF_PARTS)[number]
export type Brief = Record<BriefPart, string> & { removed: string[]; source: 'ai' | 'rules' }

/** Today's plan in words. Each part goes through the number verifier. */
export async function writeBrief(ai: AiProvider, facts: Facts, lang: Lang): Promise<Brief> {
  const parsed = (await generateJson(ai, {
    systemInstruction: BRIEF_SYSTEM(lang),
    prompt: wrap('facts', JSON.stringify(facts)),
    json: true,
  })) as Partial<Record<BriefPart, unknown>>
  const allowed = allowedNumbers(facts)
  const removed: string[] = []
  const out = { removed, source: 'ai' } as Brief
  for (const part of BRIEF_PARTS) {
    const value = typeof parsed[part] === 'string' ? (parsed[part] as string) : ''
    const checked = checkText(value.slice(0, 1200), allowed)
    out[part] = checked.text
    removed.push(...checked.removed)
  }
  if (!out.headline && !out.morning && !out.evening) throw new Error('The AI reply was empty.')
  return out
}

export interface Answer {
  text: string
  removed: string[]
}

export async function answerQuestion(ai: AiProvider, facts: Facts, question: string, lang: Lang): Promise<Answer> {
  const q = question.trim().slice(0, MAX_QUESTION_CHARS)
  if (!q) throw new Error('Type a question first.')
  const parsed = (await generateJson(ai, {
    systemInstruction: ASK_SYSTEM(lang),
    prompt: `${wrap('facts', JSON.stringify(facts))}\n${wrap('question', q)}`,
    json: true,
  })) as { answer?: unknown }
  const answer = typeof parsed.answer === 'string' ? parsed.answer : ''
  const checked = checkText(answer.slice(0, 1500), allowedNumbers(facts))
  if (!checked.text) throw new Error('The AI could not answer that from the live data. Try rephrasing.')
  return { text: checked.text, removed: checked.removed }
}

/** Hindi questions get Hindi answers regardless of the UI setting. */
export const questionLang = (question: string, fallback: Lang): Lang => (/[ऀ-ॿ]/.test(question) ? 'hi' : fallback)
