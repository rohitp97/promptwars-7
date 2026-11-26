import { useState } from 'react'
import { FACTORS_REVIEWED, MODES, SMOG_SEASON_WEEKS } from '../data/factors'
import { alternatives, savings, tripOption } from '../lib/exposure'
import type { Facts } from '../lib/facts'
import { LIMITS } from '../lib/household'
import type { Household, Mode } from '../types'
import { NumberField } from './NumberField'
import { MODE_OPTIONS } from './options'
import { SelectField } from './SelectField'
import { Card, H2, inputCls, Note } from './ui'

/** Compare ways to make a trip: smog breathed in by you, and smog and CO2 put into the city. */
export function Commute({ household, facts }: { household: Household; facts: Facts }) {
  const trips = household.members.flatMap((m) => m.activities.flatMap((a) => (a.mode ? [{ m, a, mode: a.mode }] : [])))
  const [choice, setChoice] = useState(trips[0] ? `${trips[0].m.id}/${trips[0].a.id}` : 'custom')
  const picked = trips.find((t) => `${t.m.id}/${t.a.id}` === choice)
  const [custom, setCustom] = useState({ mode: 'car_petrol' as Mode, km: 10, tripsPerWeek: 5 })
  const pm25 = facts.home.outdoorPm25Now

  const trip = picked
    ? {
        mode: picked.mode,
        km: picked.a.km ?? 5,
        tripsPerWeek: picked.a.tripsPerWeek ?? 5,
        age: picked.m.age,
        mask: picked.m.mask,
        who: picked.m.name,
      }
    : { ...custom, age: 'adult' as const, mask: 'none' as const, who: 'You' }

  const options = alternatives({
    mode: trip.mode,
    km: trip.km,
    tripsPerWeek: trip.tripsPerWeek,
    pm25,
    age: trip.age,
    mask: trip.mask,
  })
  const [baseline, ...rest] = options

  return (
    <Card labelledBy="commute">
      <H2 id="commute">Commute and errands: what each choice changes</H2>
      <p className="mt-1 text-sm">
        Two effects for every trip: the smog <strong>you breathe in</strong> on the way, and the smog and CO2{' '}
        <strong>your trip adds</strong> to your neighbourhood's air. Calculated at the current PM2.5 of {pm25} µg/m³.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
        <label>
          Trip
          <select className={`${inputCls} mt-1`} value={choice} onChange={(e) => setChoice(e.target.value)}>
            {trips.map(({ m, a }) => (
              <option key={a.id} value={`${m.id}/${a.id}`}>
                {m.name}: {a.label} ({a.km} km, {a.tripsPerWeek}×/week)
              </option>
            ))}
            <option value="custom">Another trip…</option>
          </select>
        </label>
        {!picked && (
          <>
            <SelectField
              label="Mode"
              value={custom.mode}
              options={MODE_OPTIONS}
              selectClassName="mt-1"
              onChange={(mode) => setCustom({ ...custom, mode })}
            />
            <NumberField
              label="One way (km)"
              value={custom.km}
              range={LIMITS.km}
              inputClassName="mt-1 w-24"
              onChange={(km) => setCustom({ ...custom, km })}
            />
            <NumberField
              label="Round trips / week"
              value={custom.tripsPerWeek}
              range={LIMITS.tripsPerWeek}
              integer
              inputClassName="mt-1 w-24"
              onChange={(tripsPerWeek) => setCustom({ ...custom, tripsPerWeek })}
            />
          </>
        )}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <caption className="sr-only">Trip options compared with {baseline.label}</caption>
          <thead>
            <tr className="border-b border-line text-muted">
              <th scope="col" className="py-2 pr-3">
                Option
              </th>
              <th scope="col" className="py-2 pr-3">
                Time (one way)
              </th>
              <th scope="col" className="py-2 pr-3">
                Smog you breathe
              </th>
              <th scope="col" className="py-2 pr-3">
                CO2 / week
              </th>
              <th scope="col" className="py-2 pr-3">
                PM2.5 you add / week
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line bg-paper">
              <th scope="row" className="py-2 pr-3 font-semibold">
                {baseline.label} <span className="font-normal text-muted">(now)</span>
              </th>
              <td className="py-2 pr-3">{baseline.minutesOneWay} min</td>
              <td className="py-2 pr-3">{baseline.doseRoundTrip} µg per round trip</td>
              <td className="py-2 pr-3">{baseline.co2KgWeek} kg</td>
              <td className="py-2 pr-3">{baseline.pm25GWeek} g</td>
            </tr>
            {rest.map((o) => {
              const s = savings(baseline, o)
              return (
                <tr key={o.label} className="border-b border-line">
                  <th scope="row" className="py-2 pr-3 font-semibold">
                    {o.label}
                  </th>
                  <td className="py-2 pr-3">{o.minutesOneWay} min</td>
                  <td className="py-2 pr-3">
                    {o.doseRoundTrip} µg{' '}
                    {s.dosePct === 0 ? (
                      <span className="text-muted">(same)</span>
                    ) : (
                      <span className={s.dosePct > 0 ? 'text-good' : 'text-veryPoor'}>
                        ({s.dosePct > 0 ? `${s.dosePct}% less` : `${-s.dosePct}% more`})
                      </span>
                    )}
                    {MODES[o.mode].maskable && trip.mask !== 'n95' && (
                      <span className="block text-xs text-muted">
                        with an N95:{' '}
                        {
                          tripOption({
                            mode: o.mode,
                            km: trip.km,
                            tripsPerWeek: trip.tripsPerWeek,
                            pm25,
                            age: trip.age,
                            mask: 'n95',
                          }).doseRoundTrip
                        }{' '}
                        µg
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {o.co2KgWeek} kg <span className="text-good">{s.co2KgWeek > 0 ? `(−${s.co2KgWeek})` : ''}</span>
                  </td>
                  <td className="py-2 pr-3">
                    {o.pm25GWeek} g <span className="text-good">{s.pm25GWeek > 0 ? `(−${s.pm25GWeek})` : ''}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {facts.commuteSwap && picked && (
        <p className="mt-3 rounded-lg bg-goodSoft p-3 text-sm text-good">
          Over a {SMOG_SEASON_WEEKS}-week smog season, {facts.commuteSwap.member} switching from{' '}
          {facts.commuteSwap.from} to {facts.commuteSwap.to} keeps about {facts.commuteSwap.co2KgSeason} kg of CO2 and{' '}
          {facts.commuteSwap.pm25GSeason} g of PM2.5 out of the city's air.
        </p>
      )}
      <Note>
        Also cuts trips: combine errands into one outing, work from home on "Severe" days if you can, and never burn
        leaves or garbage. Factors (speed, in-vehicle exposure, emissions incl. brake, tyre and road dust) are rounded
        published averages, reviewed {FACTORS_REVIEWED}; good for comparing options, not a carbon audit. Carpool splits
        emissions, not the smog each rider breathes.
      </Note>
    </Card>
  )
}
