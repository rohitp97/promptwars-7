import { LocateFixed, MapPin, Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { inIndia, reverseGeocode, SAMPLE_PLACES, searchPlaces } from '../lib/geo'
import type { Place } from '../types'
import { Alert, Button, inputCls } from './ui'

export function LocationPicker({ place, onPick }: { place: Place | null; onPick: (p: Place) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const search = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const found = await searchPlaces(query)
      setResults(found)
      if (found.length === 0) setError('No Indian town or city by that name. Try the nearest city.')
    } catch {
      setError('Place search is not reachable right now. Pick one of the cities below or use your location.')
    } finally {
      setBusy(false)
    }
  }

  const locate = (): void => {
    setError(null)
    if (!('geolocation' in navigator)) {
      setError('This browser cannot share your location. Search for your city instead.')
      return
    }
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        if (!inIndia(latitude, longitude)) {
          setBusy(false)
          setError('Your location looks outside India. Saans uses CPCB data, so please search for an Indian city.')
          return
        }
        const p = await reverseGeocode(latitude, longitude)
        setBusy(false)
        onPick(p)
      },
      () => {
        setBusy(false)
        setError('Location permission was not given. Search for your city instead.')
      },
      { timeout: 10_000, maximumAge: 600_000 },
    )
  }

  return (
    <div>
      <form onSubmit={search} className="flex flex-wrap gap-2" role="search">
        <label htmlFor="place-q" className="sr-only">
          Your city or town
        </label>
        <input
          id="place-q"
          className={`${inputCls} min-w-0 flex-1`}
          placeholder="Search your city or town, e.g. Ghaziabad"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={60}
        />
        <Button type="submit" disabled={busy || query.trim().length < 2}>
          <span className="inline-flex items-center gap-1">
            <Search size={16} aria-hidden /> Search
          </span>
        </Button>
        <Button variant="ghost" onClick={locate} disabled={busy}>
          <span className="inline-flex items-center gap-1">
            <LocateFixed size={16} aria-hidden /> Use my location
          </span>
        </Button>
      </form>
      {error && (
        <div className="mt-2">
          <Alert>{error}</Alert>
        </div>
      )}
      {results && results.length > 0 && (
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line" aria-label="Matching places">
          {results.map((r) => (
            <li key={`${r.lat},${r.lon}`}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-brandSoft"
                onClick={() => {
                  setResults(null)
                  setQuery('')
                  onPick(r)
                }}
              >
                <span className="font-semibold">{r.name}</span>
                <span className="text-muted">
                  {[r.district, r.state].filter(Boolean).join(', ')
                    ? ` — ${[r.district, r.state].filter(Boolean).join(', ')}`
                    : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Try:</span>
        {SAMPLE_PLACES.map((p) => (
          <button
            key={p.name}
            type="button"
            aria-pressed={place?.name === p.name}
            onClick={() => onPick(p)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${
              place?.name === p.name
                ? 'border-brand bg-brand text-card'
                : 'border-line bg-card text-brand hover:bg-brandSoft'
            }`}
          >
            <MapPin size={14} aria-hidden /> {p.name}
          </button>
        ))}
      </div>
    </div>
  )
}
