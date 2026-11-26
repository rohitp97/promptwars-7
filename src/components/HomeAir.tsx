import { WHO_24H_PM25, INDIA_24H_PM25 } from '../data/factors'
import { hourlyLevel } from '../lib/aqi'
import type { Facts } from '../lib/facts'
import { LIMITS } from '../lib/household'
import { assessRoom, SOURCE_ORDER, SOURCE_TIPS } from '../lib/indoor'
import type { Home, Room } from '../types'
import { NumberField } from './NumberField'
import { AqiBadge, Card, H2, inputCls, Note } from './ui'

const PURIFIER_TEXT = {
  none: 'No purifier',
  undersized: 'Purifier too small for this room',
  ok: 'Purifier is the right size',
}

export function HomeAir({ home, facts, onChange }: { home: Home; facts: Facts; onChange: (home: Home) => void }) {
  const outdoor = facts.home.outdoorPm25Now
  const setRoom = (id: string, patch: Partial<Room>): void =>
    onChange({ ...home, rooms: home.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) })

  return (
    <div className="space-y-4">
      <Card labelledBy="rooms">
        <H2 id="rooms">Indoor air, room by room</H2>
        <p className="mt-1 text-sm">
          Outside now: PM2.5 <strong>{outdoor}</strong> µg/m³. With windows shut, some of it still leaks in. Change the
          size or purifier to see the effect.
        </p>
        <label className="mt-3 block text-sm font-semibold" htmlFor="leak">
          How well does your home seal?
        </label>
        <select
          id="leak"
          className={`${inputCls} mt-1 max-w-xs`}
          value={home.leakiness}
          onChange={(e) => onChange({ ...home, leakiness: e.target.value as Home['leakiness'] })}
        >
          <option value="sealed">Well sealed (new flat, tight windows)</option>
          <option value="average">Average</option>
          <option value="leaky">Leaky (gaps, old windows, jaali doors)</option>
        </select>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {home.rooms.map((room) => {
            const v = assessRoom(room, outdoor, home.leakiness)
            return (
              <article key={room.id} className="rounded-xl border border-line p-3">
                <h3 className="font-bold">{room.name}</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <NumberField
                    label="Floor area (sq ft)"
                    value={room.areaSqft}
                    range={LIMITS.areaSqft}
                    integer
                    onChange={(areaSqft) => setRoom(room.id, { areaSqft })}
                  />
                  <NumberField
                    label="Purifier CADR (m³/h, 0 = none)"
                    value={room.purifierCadr}
                    range={LIMITS.cadr}
                    step={10}
                    integer
                    onChange={(purifierCadr) => setRoom(room.id, { purifierCadr })}
                  />
                </div>
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <dt>Indoor PM2.5 now (estimate):</dt>
                    <dd className="flex items-center gap-2 font-semibold">
                      {v.indoorNow} <AqiBadge value={hourlyLevel(v.indoorNow)} prefix="level" />
                    </dd>
                  </div>
                  <div>
                    <dt className="inline">{PURIFIER_TEXT[v.purifier]}. </dt>
                    <dd className="inline">
                      {v.purifier === 'ok'
                        ? `It clears 90% of a smoke burst (cooking, airing) in about ${v.minutesToClear} minutes.`
                        : `For this room (${v.volumeM3} m³) look for CADR ≥ ${v.recommendedCadr} m³/h: indoor PM2.5 would drop to about ${v.indoorIfRightSized}.`}
                    </dd>
                  </div>
                </dl>
              </article>
            )
          })}
        </div>
        <Note>
          Estimate from a one-room balance of leakage, settling and purifier air changes (5 per hour recommended in smog
          season). Indoor sources add on top. Reference: WHO guideline {WHO_24H_PM25}, India's standard {INDIA_24H_PM25}{' '}
          µg/m³ (24-hour).
        </Note>
      </Card>

      <Card labelledBy="airing">
        <H2 id="airing">When to air the house</H2>
        {facts.home.airTheHouseAt ? (
          <p className="mt-1 text-sm">
            Open windows on opposite sides for 10 minutes <strong>{facts.home.airTheHouseAt}</strong> (forecast PM2.5{' '}
            {facts.home.airingPm25}), then shut them and run the purifier. Homes still need fresh air: closed rooms
            build up CO2, cooking fumes and moisture.
          </p>
        ) : (
          <p className="mt-1 text-sm">No daytime forecast left to choose from. Check again tomorrow morning.</p>
        )}
      </Card>

      <Card labelledBy="sources">
        <H2 id="sources">Smoke you make indoors</H2>
        <p className="mt-1 text-sm">
          Tick what happens in your home; these can push indoor air above the smog outside.
        </p>
        <ul className="mt-3 space-y-3">
          {SOURCE_ORDER.map((s) => {
            const on = home.sources.includes(s)
            const tip = SOURCE_TIPS[s]
            return (
              <li key={s} className="rounded-lg border border-line p-3">
                <label className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      onChange({ ...home, sources: on ? home.sources.filter((x) => x !== s) : [...home.sources, s] })
                    }
                  />
                  {tip.label}
                </label>
                {on && (
                  <div className="mt-1 text-sm">
                    <p>{tip.tip}</p>
                    <p className="text-muted">Why: {tip.why}</p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        <Note>
          Indoor plants look nice but do not measurably clean smog at home scale; a right-sized purifier and fewer
          indoor sources do.
        </Note>
      </Card>
    </div>
  )
}
