# Saans — Design Document
### Hack2Skill x Google PromptWars Virtual | Urban Air Quality Assistant
*"Plan your family's day around the smog."*

---

## 1. The problem we picked (and what we left out)

The brief: a GenAI assistant that helps families and communities get through winter smog, with
low-emission routines, indoor air hacks and sustainable alternatives, **tailored to location and
lifestyle**, and **explaining the direct impact of their choices**.

What the explainer session asked for:
- **Real-time data from a reliable source** (CPCB, OpenAQ…), never an AQI made up by Gemini; show the
  **source and timestamp**.
- **All of India**: pick a location or detect it. "I live in Mumbai and get Delhi's advice" must not happen.
- **Personalised**: a commuter and a family with two young children in the same city must not get the
  same advice. Children and elders need more caution.
- Explain **why** each recommendation is made. A morning / afternoon / evening plan is welcome.
- Give evaluators **sample inputs**. Prototypes are now tested for real after the challenge closes.

**Persona:** an Indian household in smog season: children, a grandparent with asthma, someone who
commutes. **Painful moment:** every winter morning: *can the kids play outside today, when should
Dadi walk, should I drive, is our purifier doing anything?*
**Left out on purpose:** city-level policy dashboards, social features, wearables, and indoor sensors
(the family has none; we model indoor air from outdoor data instead).

## 2. Why not just ask a chat assistant?

| A chat assistant | Saans |
|---|---|
| Makes up today's AQI or uses stale training data | Live **CPCB station** reading (data.gov.in) + hourly **CAMS** forecast (Open-Meteo), with station name, distance and timestamp |
| "Avoid going out when pollution is high" | *Which hour* is cleanest today, per person, from the forecast, scaled to agree with the nearest stations |
| Same advice for everyone | Thresholds per person: children, elders, asthma/heart/COPD/pregnancy use CPCB's cautious band; vigorous play lowers it further |
| "Metro is greener" | Computed both ways: the smog **you breathe** (often more on the metro) and the CO2/PM2.5 **you add** (much less), per week and per season |
| "Get an air purifier" | Indoor PM2.5 estimate for *your room size and purifier*, the CADR you actually need, and the hour to air the house |
| Numbers can't be trusted | **Every number Gemini writes is checked** against the computed facts; sentences with other numbers are removed and shown |

## 3. The core idea: data and code decide, GenAI explains

```
 CPCB stations (data.gov.in) ─┐
                              ├─► code: AQI, calibration, cleanest windows, per-person verdicts,
 Open-Meteo CAMS forecast  ───┘        inhaled dose, purifier maths, commute emissions   ──► FACTS
 family's own words ─► Gemini ─► household JSON ─► sanitizeHousehold() (clamps, enums, limits)
 FACTS ─► Gemini ─► plan in English/Hindi ─► number verifier (removes unverifiable sentences)
 FACTS + question ─► Gemini ─► answer ─► number verifier
```

| GenAI (Gemini via Firebase AI Logic) | Deterministic, tested code |
|---|---|
| Read "we are five, my mother has asthma, I drive 18 km at 8:30…" into a household | Validate and clamp every field; unknown values fall back to safe defaults |
| Explain the plan warmly, by name, in English or Hindi; say *why* | Decide every verdict (go / move / protect / indoors), every time and every number |
| Answer free questions ("Can Aarav play at 5?") from the facts | Verify each number in the answer; fall back to a matched computed answer if AI fails |
| — | AQI (CPCB breakpoints), calibration, windows, exposure dose, indoor balance, emissions |

### 3.1 Live data (`lib/cpcb.ts`, `lib/forecast.ts`)
- **CPCB**: resource `3b01bcb8…` on data.gov.in. Each row is one pollutant's 24-h **sub-index** at a
  station; station AQI = highest sub-index, reported only under CPCB's rule (≥3 pollutants, one of
  PM2.5/PM10). PM2.5 µg/m³ is recovered by inverting the breakpoints. Search goes town → district →
  state, with geocoder→CPCB name mapping (Gurgaon→Gurugram, NCT of Delhi→Delhi…).
- The public **sample key** is shared worldwide and rate-limited (a burst of ~8 requests, then refusals,
  found in testing). With it the app lists only PM2.5 rows to find the nearest three stations, then
  fetches just those (≈5-8 requests), with one patient retry. A **registered key** takes one request.
- **Forecast**: Open-Meteo air-quality (CAMS) hourly PM2.5/PM10/NO2 + wind and boundary-layer height,
  yesterday to +2 days. **Calibration**: the model's 24-h mean is compared to the median of the three
  nearest stations' PM2.5 (≤25 km) and the forecast scaled by that factor (clamped 0.4–3), shown in the UI.
- Results are cached 5 minutes per place; Refresh forces a new fetch; a stale tab refetches on return.

### 3.2 Per-person plan (`lib/plan.ts`, `lib/windows.ts`, `lib/exposure.ts`)
- Hourly "level" = PM2.5 sub-index of that hour (labelled: not the official 24-h AQI).
- Thresholds: sensitive people caution > 100, avoid > 200; others 200 / 300; vigorous effort −50/−100.
- Flexible leisure can move anywhere 6 am–9 pm; trips only **±2 hours** (a live test suggested moving an
  office drive from 8 am to 2 pm, which no one would do).
- Inhaled dose = PM2.5 × micro-environment ratio × breathing rate (effort × age) × time × (1 − mask).
  This drives every "% less smog breathed in".

### 3.3 Home (`lib/indoor.ts`)
One-room mass balance `C_in = P·a·C_out / (a + k + CADR/V)` with leakiness-based infiltration,
recommended CADR = 5 air changes/hour, minutes to clear a burst, best airing hour, and indoor sources
(agarbatti, mosquito coil, gas stove, chulha, smoking, candles) with a concrete swap and the reason.

### 3.4 Impact (`lib/exposure.ts`, `data/factors.ts`)
Alternatives limited to what is realistic for the trip (carpool for cars, metro/bus always, EV for
cars, cycling ≤ 8 km, walking ≤ 2.5 km). Weekly and 13-week-season CO2 and PM2.5 (exhaust + brake,
tyre and road dust), plus the personal dose change, with and without an N95.

## 4. Architecture

React 19 + TypeScript + Vite + Tailwind. **No backend and no database:** the household lives in
`localStorage`. Gemini through **Firebase AI Logic** (no Gemini key in the bundle), model failover
chain. Without AI configured, everything except the AI wording works (rule-based plan and answers).

```
src/lib    aqi cpcb forecast geo time windows exposure indoor plan facts household storage verify ruleBrief
           ai prompts aiTasks                                                         <- the only model I/O
src/hooks  useSaans (single owner of state)
src/components LocationPicker AirNow DayPlan HourChart HomeAir Commute Ask HouseholdEditor
```

## 5. Security
- Strict CSP (index.html + firebase.json): `connect-src` lists only data.gov.in, Open-Meteo,
  BigDataCloud and Google AI endpoints. Permissions-Policy allows geolocation for this origin only.
- Family text and questions wrapped in tags, declared data; tags cannot be closed from inside.
- Model output only becomes a sanitised household or verified text. Saved state is re-validated on load.
- GPS coordinates are rounded to ~1 km before reverse geocoding. The data.gov.in key is a read-only
  key for public data and is shipped by design.

## 6. Accessibility
Labels on every input, ARIA tabs with arrow keys, `aria-live` for AI output, chart with text summary,
`<title>` per bar and a description, visible focus, reduced motion, 375 px layout. axe-core runs on
every tab in tests; every text/background pair is asserted against WCAG AA.

## 7. Honest limitations
- CAMS is a ~10 km model; calibration fixes the level, not micro-local hotspots.
- Exposure ratios, breathing rates and emission factors are rounded published averages (reviewed
  Nov 2026), for comparing options, not for medical or carbon accounting.
- Indoor values are modelled, not measured; indoor sources add on top.
- With the sample key, a big city's station list may be cut to the first 50 stations.

## 8. For the LinkedIn post: tools and how the prompts evolved
- **Tools:** Claude Code (design, code, tests), Gemini via Firebase AI Logic (runtime), Firebase Hosting,
  CPCB/data.gov.in, Open-Meteo (CAMS), BigDataCloud.
- **Prompt and design evolution:** (1) the AI never gets to state an AQI: all numbers come from a facts
  object, and a verifier removes sentences with numbers not in it. (2) A Hindi question was answered with
  an English "not now." prefix; the answer prompt now says the direct answer must be in the reply
  language. (3) The planner moved an office commute to 2 pm; trips are now limited to ±2 hours.
  (4) Live testing found the sample data key rate-limited; the station lookup was redesigned to ~5 requests.
- **GenAI vs code:** see §3.

## 9. Demo video plan (60–90 s)
1. Pick **Delhi** → CPCB station AQI with station, distance, timestamp; forecast scaled to stations.
2. Load **Family with kids and a grandparent** → person-by-person verdicts: Dadi's walk moves to the
   clean afternoon window, kids play indoors, office drive moves only within 2 hours. Open "Why?".
3. **Explain with AI** → Hindi → note "every number checked".
4. **Hour by hour** chart (still-air dots). **Home air** → raise living-room CADR → indoor drops.
5. **Commute & impact** → Metro saves ~26 kg CO2/week, but you breathe more unless you wear an N95.
6. **Ask**: "Can Aarav play outside this evening?" and a Hindi question.
7. Switch to **Kolkata** or **Mumbai** → different air, different plan.
