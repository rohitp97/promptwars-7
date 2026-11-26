# Saans — plan your family's day around the smog

A GenAI assistant for Indian families in smog season. It reads **live CPCB station data** and an
**hourly air-quality forecast** for your location, then tells each person in your household when to go
out, what to do at home, and what each choice changes for them and for the city's air.

**Live:** https://promptwars-7.web.app · **Design notes:** [DESIGN.md](DESIGN.md)

## How it answers the brief

| Brief asks for | In Saans |
|---|---|
| Severe winter smog, urban pollution | Live CPCB AQI (station, distance, timestamp) + hourly PM2.5 forecast (CAMS) calibrated to nearby stations |
| Tailored to location | Any Indian town: search, GPS, or one-click sample cities; nearest stations town → district → state |
| Tailored to lifestyle | Household of people with age, health conditions, mask, and their outdoor activities and trips; thresholds per person |
| Low-emission daily routines | Per-person verdict (go / move to the cleanest hour / protect / keep indoors), a morning–afternoon–evening plan, and commute alternatives |
| Indoor air quality hacks | Indoor PM2.5 for your room and purifier, the CADR you need, when to air the house, swaps for agarbatti, coils, cooking smoke |
| Sustainable alternatives | Carpool, metro, bus, EV, cycle, walk, compared on CO2 and PM2.5 added per week and per season |
| Explain the direct impact | "≈ X% less smog breathed in", "−26 kg CO2 a week", each with a "Why?" grounded in computed numbers |
| GenAI-powered | Gemini reads a free-text household description, writes the plan in English or Hindi, answers questions. Every number it writes is verified against the computed facts |

## Try it (sample inputs for evaluators)

1. Click **Delhi** (or Noida, Lucknow, Kolkata, Mumbai, Patna), or search any town, or use your location.
2. Pick **Family with kids and a grandparent**, or paste this into *Describe your household*:
   > We are five. I drive my petrol car 18 km to Gurgaon at 8:30 and back, five days a week. My wife works from home and takes a 30 minute evening walk at 6. Our kids are 8 and 11, they play cricket downstairs from 5 to 6. My mother is 68 and has asthma, she walks in the park at 7 in the morning. We use agarbatti every morning and cook on gas. Bedroom is about 150 sq ft with a small purifier.
3. Press **Explain with AI** (try हिन्दी), then explore **Hour by hour**, **Home air**, **Commute & impact**.
4. In **Ask**, try: *Can Aarav play outside this evening?* or *क्या आज सुबह खिड़की खोलनी चाहिए?*

## Run locally

```bash
npm install
cp .env.example .env   # add VITE_DATA_GOV_IN_KEY and Firebase web config (or a dev-only Gemini key)
npm run dev
npm test               # 168 tests, axe + WCAG contrast included
npm run build && npm run deploy
```

Works without any keys: the CPCB sample key and Open-Meteo need none, and without AI the plan and
answers come from the computed engine.

## How the code is organised

- **`src/lib`**: pure, unit-tested TypeScript, no React. Live data (`cpcb`, `forecast`, `geo`), the
  Indian AQI (`aqi`), decisions (`plan`, `windows`, `exposure`, `indoor`), validation and edits
  (`household`, `householdEdits`, `numbers`, `storage`) and the trust layer (`verify`, `facts`).
  `ai`, `prompts` and `aiTasks` are the only files that talk to the model.
- **`src/data`**: every physical constant with its source (`factors`) and the sample households (`presets`).
- **`src/hooks/useSaans`**: the single owner of app state.
- **`src/components`**: thin React views; inputs go through `NumberField` / `SelectField`, so no
  out-of-range value ever reaches the engine.

Quality gates: TypeScript strict build, oxlint (0 warnings), Prettier, Vitest with ~92% line
coverage, axe-core on every tab, and WCAG AA contrast asserted for every colour pair.

## Data sources
- Central Pollution Control Board, *Real time Air Quality Index from various locations*, via data.gov.in (hourly).
- Copernicus Atmosphere Monitoring Service (CAMS) forecast and weather via Open-Meteo.
- Place search: Open-Meteo geocoding; GPS place name: BigDataCloud (coordinates rounded to ~1 km).

Not medical advice. Household data stays in your browser.
