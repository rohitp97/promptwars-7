import { category, hourlyLevel } from '../lib/aqi'
import { dayLabel, formatHour, hourOf, istHourKey } from '../lib/time'
import { isStagnant, summariseDays, upcoming } from '../lib/windows'
import type { AirSnapshot } from '../types'
import { CATEGORY_FILL } from './categoryStyles'
import { Card, H2, Note } from './ui'

const W = 720
const H = 200
const PAD = { top: 12, right: 8, bottom: 28, left: 36 }

/** Hour-by-hour PM2.5 for the rest of today and tomorrow, coloured by category, stagnant hours marked. */
export function HourChart({ snapshot, now }: { snapshot: AirSnapshot; now: Date }) {
  const nowKey = istHourKey(now)
  const hours = upcoming(snapshot.hours, nowKey)
  if (hours.length === 0) return null
  const max = Math.max(60, ...hours.map((h) => h.pm25))
  const step = (W - PAD.left - PAD.right) / hours.length
  const y = (v: number): number => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / max)
  const days = summariseDays(hours)
  const gridLines = [60, 120, 250].filter((g) => g < max)

  return (
    <Card labelledBy="hours">
      <H2 id="hours">Hour by hour: when is the air cleanest?</H2>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {days.map((d) => (
          <li key={d.day} className="rounded-lg bg-paper p-3 text-sm">
            <p className="font-semibold">{dayLabel(d.day + 'T00:00', nowKey)} (6 am – 9 pm)</p>
            <p>
              Cleanest: <strong>{formatHour(hourOf(d.best.time))}</strong> · PM2.5 {Math.round(d.best.pm25)} (
              {category(hourlyLevel(d.best.pm25)).label})
            </p>
            <p>
              Worst: <strong>{formatHour(hourOf(d.worst.time))}</strong> · PM2.5 {Math.round(d.worst.pm25)} (
              {category(hourlyLevel(d.worst.pm25)).label})
            </p>
            {d.stagnantHours > 0 && (
              <p className="text-muted">{d.stagnantHours} waking hours with still, trapped air</p>
            )}
          </li>
        ))}
      </ul>
      <figure className="mt-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-labelledby="chart-title chart-desc">
          <title id="chart-title">Forecast PM2.5 by hour</title>
          <desc id="chart-desc">
            {days
              .map(
                (d) =>
                  `${dayLabel(d.day + 'T00:00', nowKey)}: cleanest ${formatHour(hourOf(d.best.time))}, worst ${formatHour(hourOf(d.worst.time))}.`,
              )
              .join(' ')}
          </desc>
          {gridLines.map((g) => (
            <g key={g}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(g)} y2={y(g)} stroke="#d5dfe2" strokeDasharray="4 4" />
              <text x={PAD.left - 4} y={y(g) + 4} textAnchor="end" fontSize="11" fill="#475861">
                {g}
              </text>
            </g>
          ))}
          {hours.map((h, i) => {
            const x = PAD.left + i * step
            const hr = hourOf(h.time)
            return (
              <g key={h.time}>
                <rect
                  x={x + 1}
                  y={y(h.pm25)}
                  width={Math.max(1, step - 2)}
                  height={H - PAD.bottom - y(h.pm25)}
                  fill={CATEGORY_FILL[category(hourlyLevel(h.pm25)).id]}
                  rx={2}
                >
                  <title>
                    {`${dayLabel(h.time, nowKey)} ${formatHour(hr)}: PM2.5 ${Math.round(h.pm25)} µg/m³${isStagnant(h) ? ' (still air)' : ''}`}
                  </title>
                </rect>
                {isStagnant(h) && <circle cx={x + step / 2} cy={H - PAD.bottom + 6} r={2} fill="#475861" />}
                {hr % 6 === 0 && (
                  <text x={x + step / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="#475861">
                    {hr === 0
                      ? new Date(h.time.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-IN', {
                          weekday: 'short',
                          timeZone: 'UTC',
                        })
                      : formatHour(hr).replace(' noon', 'pm').replace(' ', '')}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
        <figcaption className="mt-1 text-xs text-muted">
          Bars: forecast PM2.5 (µg/m³), coloured by CPCB category. Dots: still air (wind under 4 km/h or mixing layer
          under 300 m), when smog builds up. Dashed lines: 60 (India's 24-hour standard), 120 and 250.
        </figcaption>
      </figure>
      <Note>
        Winter smog usually peaks late at night and early morning, when the air is cold and still, and is lowest in the
        early afternoon.
      </Note>
    </Card>
  )
}
