import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import * as ai from '../lib/ai'
import { setRetryDelay } from '../lib/cpcb'
import { clearSnapshotCache } from '../lib/forecast'
import type { AiProvider } from '../types'
import { fakeFetch, hourKeys, istDate } from './fixtures'

vi.mock('../lib/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/ai')>()),
  createAiProvider: vi.fn(() => null),
}))
const createAiProvider = vi.mocked(ai.createAiProvider)

const DAY = '2026-11-21'
const times = hourKeys('2026-11-20', 96)
const pm = (t: string): number => {
  const h = Number(t.slice(11, 13))
  return Math.round(150 + 100 * Math.cos((2 * Math.PI * (h - 2)) / 24))
}
const routes = (): Parameters<typeof fakeFetch>[0] => [
  [
    'air-quality-api',
    {
      hourly: {
        time: times,
        pm2_5: times.map(pm),
        pm10: times.map((t) => pm(t) * 1.5),
        nitrogen_dioxide: times.map(() => 60),
      },
    },
  ],
  [
    'api.open-meteo.com/v1/forecast',
    { hourly: { time: times, wind_speed_10m: times.map(() => 3), boundary_layer_height: times.map(() => 150) } },
  ],
  [
    'data.gov.in',
    {
      total: 3,
      records: ['PM2.5', 'PM10', 'NO2'].map((p, i) => ({
        state: 'Delhi',
        city: 'Delhi',
        station: 'ITO, Delhi - CPCB',
        last_update: '21-11-2026 07:00:00',
        latitude: '28.628',
        longitude: '77.241',
        pollutant_id: p,
        avg_value: ['353', '240', '110'][i],
      })),
    },
  ],
]

async function violations(): Promise<string[]> {
  const results = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
  return results.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes[0]?.target.join(' ')}`)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(istDate(DAY, 8))
  setRetryDelay(1)
  clearSnapshotCache()
  localStorage.clear()
  createAiProvider.mockReturnValue(null)
  vi.stubGlobal('fetch', fakeFetch(routes()).fn)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const startDelhiFamily = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  render(<App />)
  await user.click(screen.getByRole('button', { name: /Delhi/ }))
  await screen.findByRole('heading', { name: 'Air in Delhi right now' })
  await user.click(screen.getByRole('button', { name: /Family with kids and a grandparent/ }))
  await screen.findByRole('heading', { name: /Today's plan for your family/ })
}

describe('Saans', () => {
  it('starts by asking where you are, with no accessibility violations', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Where are you?' })).toBeInTheDocument()
    expect(await violations()).toEqual([])
  })

  it('shows the live CPCB station with source and time, and the calibrated forecast', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Delhi/ }))
    expect(await screen.findByLabelText('AQI 353')).toBeInTheDocument()
    expect(
      screen.getByText(/ITO, Delhi - CPCB · .* km away · 24-hour average, updated 21\/11\/2026 07:00 IST/),
    ).toBeInTheDocument()
    expect(screen.getByText(/scaled ×/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Who lives at home?' })).toBeInTheDocument()
    expect(await violations()).toEqual([])
  })

  it('explains when station data is unavailable but still plans from the forecast', async () => {
    vi.stubGlobal('fetch', fakeFetch(routes().slice(0, 2)).fn)
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Delhi/ }))
    expect(await screen.findByText(/Live CPCB station data could not be loaded/)).toBeInTheDocument()
  })

  it('shows an error when the forecast cannot be loaded', async () => {
    vi.stubGlobal('fetch', fakeFetch([]).fn)
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Delhi/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load air data/)
  })

  it('builds a person-by-person plan for a sample family without AI', async () => {
    const user = userEvent.setup()
    await startDelhiFamily(user)
    const people = screen.getByRole('region', { name: 'Person by person' })
    expect(within(people).getByRole('heading', { name: /Dadi/ })).toBeInTheDocument()
    expect(within(people).getAllByText('Keep it indoors').length).toBeGreaterThan(0)
    expect(screen.getByText(/AI is not configured here/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Explain with AI/ })).toBeDisabled()
    expect(await violations()).toEqual([])
  })

  it('every tab renders and passes axe', async () => {
    const user = userEvent.setup()
    await startDelhiFamily(user)
    const expectations: Array<[string, RegExp]> = [
      ['Hour by hour', /when is the air cleanest/],
      ['Home air', /Indoor air, room by room/],
      ['Commute & impact', /what each choice changes/],
      ['Ask', /Ask about today's air/],
      ['Household', /Your household/],
    ]
    for (const [tab, heading] of expectations) {
      await user.click(screen.getByRole('tab', { name: tab }))
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
      expect(await violations(), tab).toEqual([])
    }
  })

  it('tabs move with arrow keys', async () => {
    const user = userEvent.setup()
    await startDelhiFamily(user)
    screen.getByRole('tab', { name: 'Today’s plan' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Hour by hour' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Household' })).toHaveAttribute('aria-selected', 'true')
  })

  it('home air reacts to a bigger purifier', async () => {
    const user = userEvent.setup()
    await startDelhiFamily(user)
    await user.click(screen.getByRole('tab', { name: 'Home air' }))
    const living = screen.getAllByLabelText(/Purifier CADR/)[1]
    expect(screen.getByText(/No purifier\./)).toBeInTheDocument()
    await user.clear(living)
    await user.type(living, '400')
    expect(screen.queryByText(/No purifier\./)).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /Mosquito coil/ }))
    expect(screen.getByText(/mosquito net/)).toBeInTheDocument()
  })

  it('commute compares options with computed savings', async () => {
    const user = userEvent.setup()
    await startDelhiFamily(user)
    await user.click(screen.getByRole('tab', { name: 'Commute & impact' }))
    const table = screen.getByRole('table')
    expect(within(table).getByRole('rowheader', { name: 'Metro' })).toBeInTheDocument()
    expect(within(table).getByText(/−26.1/)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Trip'), 'custom')
    expect(screen.getByLabelText('One way (km)')).toBeInTheDocument()
  })

  it('answers questions from the computed plan when AI is off', async () => {
    const user = userEvent.setup()
    await startDelhiFamily(user)
    await user.click(screen.getByRole('tab', { name: 'Ask' }))
    await user.type(screen.getByLabelText('Your question'), 'Can Aarav play cricket?')
    await user.click(screen.getByRole('button', { name: /^Ask$/ }))
    expect(await screen.findByText(/Matched to your computed plan/)).toBeInTheDocument()
    expect(screen.getByText(/Aarav: Cricket downstairs/)).toBeInTheDocument()
  })

  it('household edits flow into the plan and survive a reload', async () => {
    const user = userEvent.setup()
    await startDelhiFamily(user)
    await user.click(screen.getByRole('tab', { name: 'Household' }))
    await user.click(screen.getByRole('button', { name: 'Add person' }))
    const names = screen.getAllByLabelText('Name')
    await user.clear(names[names.length - 1])
    await user.type(names[names.length - 1], 'Nanu')
    cleanup()
    render(<App />)
    await screen.findByRole('heading', { name: /Today's plan for your family/ })
    expect(screen.getByRole('heading', { name: /Nanu/ })).toBeInTheDocument()
  })

  it('with AI: personalises the plan, verifies numbers, and builds a household from a description', async () => {
    const provider: AiProvider = {
      name: 'gemini-api-key',
      generate: async (req) => {
        if (req.systemInstruction.includes('turn a family')) {
          return JSON.stringify({
            members: [{ name: 'Kabir', age: 'child', activities: [{ kind: 'outdoor_play', hour: 17, minutes: 60 }] }],
          })
        }
        if (req.systemInstruction.includes('Answer the family'))
          return JSON.stringify({ answer: 'Not now. AQI 353 at ITO.' })
        return JSON.stringify({
          headline: 'ITO reports AQI 353, Very Poor.',
          morning: 'Dadi walks later today. Pollution drops 77% by 9 am.',
          afternoon: 'Kids stay in.',
          evening: 'Windows shut.',
          home: 'Run the purifier.',
          together: 'Try the metro.',
        })
      },
    }
    createAiProvider.mockReturnValue(provider)
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Delhi/ }))
    await screen.findByRole('heading', { name: 'Who lives at home?' })
    await user.type(screen.getByLabelText(/describe your household/i), 'My son Kabir is 8 and plays outside at 5.')
    await user.click(screen.getByRole('button', { name: /Build my household/ }))
    expect(await screen.findByRole('heading', { name: /Kabir/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Explain with AI/ }))
    expect(await screen.findByText('ITO reports AQI 353, Very Poor.')).toBeInTheDocument()
    expect(screen.getByText('Dadi walks later today.')).toBeInTheDocument()
    expect(screen.getByText(/1 sentence\(s\) with numbers that did not match were removed/)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Ask' }))
    await user.click(screen.getByRole('button', { name: /Should I run the purifier/ }))
    expect(await screen.findByText('Not now. AQI 353 at ITO.')).toBeInTheDocument()
    expect(await violations()).toEqual([])
  })
})
