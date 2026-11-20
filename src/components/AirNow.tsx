import { RefreshCw } from 'lucide-react'
import { category, hourlyLevel } from '../lib/aqi'
import { hoursBetween, istHourKey } from '../lib/time'
import type { AirSnapshot } from '../types'
import { CATEGORY_CLASS } from './categoryStyles'
import { AqiBadge, Alert, Button, Card, H2, Note } from './ui'

const fmtUpdated = (iso: string): string => {
  if (!iso) return 'time not given'
  const [d, t] = iso.split('T')
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y} ${t} IST`
}

export function AirNow({
  snapshot,
  now,
  onRefresh,
  loading,
}: {
  snapshot: AirSnapshot
  now: Date
  onRefresh: () => void
  loading: boolean
}) {
  const nowKey = istHourKey(now)
  const current = snapshot.hours.find((h) => h.time === nowKey)
  const nearest = snapshot.stations[0]
  const level = current ? hourlyLevel(current.pm25) : null
  const age = nearest?.station.updated ? hoursBetween(nearest.station.updated, nowKey) : null

  return (
    <Card labelledBy="air-now">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <H2 id="air-now">Air in {snapshot.place.name} right now</H2>
        <Button variant="ghost" onClick={onRefresh} disabled={loading}>
          <span className="inline-flex items-center gap-1">
            <RefreshCw size={14} aria-hidden className={loading ? 'animate-spin' : ''} /> Refresh
          </span>
        </Button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div
          className={`rounded-xl p-4 ${nearest?.aqi != null ? CATEGORY_CLASS[category(nearest.aqi).id] : 'bg-paper'}`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide">Measured · CPCB station</p>
          {nearest && nearest.aqi !== null ? (
            <>
              <p className="mt-1 text-4xl font-black" aria-label={`AQI ${nearest.aqi}`}>
                {nearest.aqi}
              </p>
              <p className="font-semibold">
                {category(nearest.aqi).label}
                {nearest.dominant ? ` · mainly ${nearest.dominant}` : ''}
              </p>
              <p className="mt-1 text-sm">{category(nearest.aqi).impact}</p>
              <p className="mt-2 text-xs">
                {nearest.station.name} · {nearest.distanceKm} km away · 24-hour average, updated{' '}
                {fmtUpdated(nearest.station.updated)}
                {age !== null && age > 3 ? ` (${age} hours old)` : ''}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm">{snapshot.stationNote ?? 'No station reading.'}</p>
          )}
        </div>
        <div className={`rounded-xl p-4 ${level !== null ? CATEGORY_CLASS[category(level).id] : 'bg-paper'}`}>
          <p className="text-xs font-semibold uppercase tracking-wide">This hour · forecast</p>
          {current && level !== null ? (
            <>
              <p className="mt-1 text-4xl font-black">
                {Math.round(current.pm25)} <span className="text-base font-semibold">µg/m³ PM2.5</span>
              </p>
              <p className="font-semibold">
                Level {level} · {category(level).label}
              </p>
              <p className="mt-1 text-sm">
                Wind {Math.round(current.wind)} km/h
                {current.mixing !== null ? ` · mixing height ${Math.round(current.mixing)} m` : ''}
              </p>
              <p className="mt-2 text-xs">
                Copernicus CAMS model via Open-Meteo
                {snapshot.calibration !== 1 ? `, scaled ×${snapshot.calibration} to match nearby CPCB stations` : ''}.
                Used to plan the hours ahead.
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm">No forecast for this hour.</p>
          )}
        </div>
      </div>

      {snapshot.stationNote && nearest && (
        <div className="mt-3">
          <Alert>{snapshot.stationNote}</Alert>
        </div>
      )}

      {snapshot.stations.length > 1 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-brand">
            Other nearby stations ({snapshot.stations.length - 1})
          </summary>
          <ul className="mt-2 space-y-1">
            {snapshot.stations.slice(1).map((s) => (
              <li key={s.station.name} className="flex flex-wrap items-center gap-2">
                <AqiBadge value={s.aqi ?? 0} prefix="AQI" />
                <span>
                  {s.station.name} · {s.distanceKm} km · {fmtUpdated(s.station.updated)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <Note>
        Sources: CPCB real-time AQI via data.gov.in (station AQI = highest pollutant sub-index, CPCB rule of at least
        three pollutants including PM). The hourly "level" is the PM2.5 sub-index of that hour, for planning only; it is
        not the official 24-hour AQI. Fetched{' '}
        {new Date(snapshot.fetchedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}.
      </Note>
    </Card>
  )
}
