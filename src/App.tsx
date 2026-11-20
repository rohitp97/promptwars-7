import { Wind } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'
import { AirNow } from './components/AirNow'
import { Ask } from './components/Ask'
import { Commute } from './components/Commute'
import { DayPlan } from './components/DayPlan'
import { HomeAir } from './components/HomeAir'
import { HourChart } from './components/HourChart'
import { HouseholdEditor, HouseholdStart } from './components/HouseholdEditor'
import { LocationPicker } from './components/LocationPicker'
import { Alert, Card, H2 } from './components/ui'
import { useSaans } from './hooks/useSaans'

const TABS = [
  { id: 'plan', label: 'Today’s plan' },
  { id: 'hours', label: 'Hour by hour' },
  { id: 'home', label: 'Home air' },
  { id: 'commute', label: 'Commute & impact' },
  { id: 'ask', label: 'Ask' },
  { id: 'household', label: 'Household' },
] as const
type TabId = (typeof TABS)[number]['id']

export default function App() {
  const s = useSaans()
  const [tab, setTab] = useState<TabId>('plan')
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const onTabKey = (e: KeyboardEvent, i: number): void => {
    const next =
      e.key === 'ArrowRight'
        ? (i + 1) % TABS.length
        : e.key === 'ArrowLeft'
          ? (i - 1 + TABS.length) % TABS.length
          : null
    if (next === null) return
    e.preventDefault()
    setTab(TABS[next].id)
    tabRefs.current[next]?.focus()
  }

  return (
    <div className="min-h-screen">
      <header className="bg-brand text-card">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <Wind size={30} aria-hidden />
          <div>
            <h1 className="text-2xl font-black tracking-tight">Saans</h1>
            <p className="text-sm">
              Plan your family's day around the smog: live air data, a plan for each person, and what your choices
              change.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-5">
        <Card labelledBy="where">
          <H2 id="where">
            {s.place ? `Location: ${s.place.name}${s.place.state ? `, ${s.place.state}` : ''}` : 'Where are you?'}
          </H2>
          <div className="mt-2">
            <LocationPicker place={s.place} onPick={s.setPlace} />
          </div>
        </Card>

        {s.status.kind === 'loading' && !s.snapshot && (
          <p role="status" className="rounded-xl bg-card p-4 text-sm">
            Fetching live CPCB station readings and the hourly forecast…
          </p>
        )}
        {s.status.kind === 'error' && (
          <Alert tone="error">
            Could not load air data: {s.status.message}. Check your connection and press Refresh, or pick another city.
          </Alert>
        )}

        {s.snapshot && s.place && (
          <AirNow
            snapshot={s.snapshot}
            now={s.now}
            loading={s.status.kind === 'loading'}
            onRefresh={() => s.place && s.refresh(s.place, true)}
          />
        )}

        {s.snapshot && !s.household && <HouseholdStart ai={s.ai} onSet={s.setHousehold} />}

        {s.snapshot && s.household && s.facts && (
          <div>
            <div
              role="tablist"
              aria-label="Plan sections"
              className="no-print flex gap-1 overflow-x-auto border-b border-line"
            >
              {TABS.map((t, i) => (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabRefs.current[i] = el
                  }}
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls={`panel-${t.id}`}
                  tabIndex={tab === t.id ? 0 : -1}
                  onClick={() => setTab(t.id)}
                  onKeyDown={(e) => onTabKey(e, i)}
                  className={`whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-semibold ${
                    tab === t.id ? 'border border-b-0 border-line bg-card text-brand' : 'text-muted hover:text-brand'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="pt-4">
              {tab === 'plan' && <DayPlan facts={s.facts} ai={s.ai} lang={s.lang} onLang={s.setLang} />}
              {tab === 'hours' && <HourChart snapshot={s.snapshot} now={s.now} />}
              {tab === 'home' && (
                <HomeAir
                  home={s.household.home}
                  facts={s.facts}
                  onChange={(home) => s.setHousehold({ ...s.household!, home })}
                />
              )}
              {tab === 'commute' && <Commute household={s.household} facts={s.facts} />}
              {tab === 'ask' && <Ask facts={s.facts} ai={s.ai} lang={s.lang} />}
              {tab === 'household' && (
                <HouseholdEditor
                  household={s.household}
                  onChange={s.setHousehold}
                  onReset={() => {
                    s.setHousehold(null)
                    setTab('plan')
                  }}
                />
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-muted">
        Air data: Central Pollution Control Board (data.gov.in, live) and Copernicus CAMS forecast via Open-Meteo. Saans
        never makes up air readings: the AI only explains numbers computed in code. Not medical advice. Your household
        is stored only in this browser.
      </footer>
    </div>
  )
}
