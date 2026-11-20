import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createAiProvider } from '../lib/ai'
import { buildFacts, type Facts } from '../lib/facts'
import { getSnapshot } from '../lib/forecast'
import type { Lang } from '../lib/prompts'
import { load, save } from '../lib/storage'
import type { AiProvider, AirSnapshot, Household, Place } from '../types'

export type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready' }

/** Live data is refreshed when older than this (CPCB publishes hourly). */
const STALE_MS = 30 * 60 * 1000

/**
 * The single owner of app state: place, household and language (persisted), the live air
 * snapshot (fetched), and the facts derived from both (computed, never stored).
 */
export function useSaans() {
  const [initial] = useState(load)
  const [place, setPlaceState] = useState<Place | null>(initial.place)
  const [household, setHousehold] = useState<Household | null>(initial.household)
  const [lang, setLang] = useState<Lang>(initial.lang)
  const [snapshot, setSnapshot] = useState<AirSnapshot | null>(null)
  const [status, setStatus] = useState<Status>(initial.place ? { kind: 'loading' } : { kind: 'idle' })
  const [now, setNow] = useState(() => new Date())
  const ai = useMemo<AiProvider | null>(() => createAiProvider(), [])
  const request = useRef(0)

  useEffect(() => save({ place, household, lang }), [place, household, lang])

  /** Fetches into state. Only the latest request may write, so a slow old city never overwrites a new one. */
  const fetchInto = useCallback(async (target: Place, force: boolean) => {
    const id = ++request.current
    try {
      const snap = await getSnapshot(target, force)
      if (id !== request.current) return
      setSnapshot(snap)
      setNow(new Date())
      setStatus(
        snap.hours.length > 0
          ? { kind: 'ready' }
          : { kind: 'error', message: 'The forecast service returned no hours for this place.' },
      )
    } catch (err) {
      if (id !== request.current) return
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Could not load air data.' })
    }
  }, [])

  const refresh = useCallback(
    (target: Place, force = false): void => {
      setStatus({ kind: 'loading' })
      void fetchInto(target, force)
    },
    [fetchInto],
  )

  const setPlace = useCallback(
    (p: Place): void => {
      setPlaceState(p)
      refresh(p)
    },
    [refresh],
  )

  // A place saved from an earlier visit loads once on mount (status already starts as loading).
  useEffect(() => {
    // Syncing with an external API: state is only set after the network answers.
    // eslint-disable-next-line react/set-state-in-effect
    if (initial.place) void fetchInto(initial.place, false)
  }, [initial.place, fetchInto])

  // Refresh when the tab comes back after a while, so "now" never silently goes stale.
  useEffect(() => {
    const onVisible = (): void => {
      if (
        document.visibilityState === 'visible' &&
        place &&
        snapshot &&
        Date.now() - Date.parse(snapshot.fetchedAt) > STALE_MS
      ) {
        refresh(place, true)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [place, snapshot, refresh])

  const facts = useMemo<Facts | null>(
    () => (snapshot && household && snapshot.hours.length > 0 ? buildFacts(snapshot, household, now) : null),
    [snapshot, household, now],
  )

  return { place, setPlace, household, setHousehold, lang, setLang, snapshot, status, refresh, facts, ai, now }
}
