// ── AI plumbing ────────────────────────────────────────────────────────────────
export interface AiRequest {
  systemInstruction: string
  prompt: string
  /** Ask the model for JSON (responseMimeType application/json). */
  json: boolean
}

export interface AiProvider {
  name: 'firebase-ai-logic' | 'gemini-api-key'
  generate(req: AiRequest): Promise<string>
}

// ── Location ──────────────────────────────────────────────────────────────────
export interface Place {
  name: string
  /** District or wider area, used to find CPCB stations when the town has none. */
  district?: string
  state: string
  lat: number
  lon: number
}

// ── Air data ──────────────────────────────────────────────────────────────────
export type Pollutant = 'PM2.5' | 'PM10' | 'NO2' | 'SO2' | 'CO' | 'OZONE' | 'NH3'

/** One CPCB monitoring station, as published on data.gov.in. */
export interface Station {
  name: string
  city: string
  state: string
  lat: number
  lon: number
  /** Local time of the reading, ISO string without zone (IST). */
  updated: string
  /** CPCB sub-index per pollutant (already on the 0-500 AQI scale). */
  subIndex: Partial<Record<Pollutant, number>>
}

export interface StationReading {
  station: Station
  distanceKm: number
  /** National AQI: max sub-index, only when CPCB's validity rule is met. */
  aqi: number | null
  dominant: Pollutant | null
  /** PM2.5 concentration (µg/m³) recovered from the PM2.5 sub-index. */
  pm25: number | null
}

/** One forecast hour from Open-Meteo (CAMS model). */
export interface ForecastHour {
  /** Local time, 'YYYY-MM-DDTHH:00' (IST). */
  time: string
  pm25: number
  pm10: number
  no2: number
  /** Wind at 10 m, km/h. */
  wind: number
  /** Boundary-layer (mixing) height, metres. Low = smog is trapped near the ground. */
  mixing: number | null
}

export interface AirSnapshot {
  place: Place
  stations: StationReading[]
  /** PM2.5-weighted forecast, already calibrated to nearby stations when possible. */
  hours: ForecastHour[]
  /** Factor applied to the model forecast so it agrees with the stations right now (1 = none). */
  calibration: number
  fetchedAt: string
  /** Why station data is missing, if it is. */
  stationNote?: string
}

// ── Household ─────────────────────────────────────────────────────────────────
export type AgeGroup = 'child' | 'teen' | 'adult' | 'elder'
export type Condition = 'asthma' | 'heart' | 'pregnant' | 'copd' | 'diabetes'
export type Effort = 'rest' | 'light' | 'moderate' | 'vigorous'
export type Mode =
  'car_petrol' | 'car_diesel' | 'car_cng' | 'two_wheeler' | 'auto' | 'bus' | 'metro' | 'ev_car' | 'cycle' | 'walk'
export type Mask = 'none' | 'cloth' | 'surgical' | 'n95'

export type ActivityKind = 'commute' | 'school_run' | 'outdoor_play' | 'walk' | 'exercise' | 'errand' | 'outdoor_work'

export interface Activity {
  id: string
  kind: ActivityKind
  label: string
  /** Start hour 0-23 (local). */
  hour: number
  minutes: number
  effort: Effort
  /** Can this be moved to another time today? */
  flexible: boolean
  /** Travel only. */
  mode?: Mode
  /** One-way distance, km (travel only). */
  km?: number
  /** Round trips per week (travel only). */
  tripsPerWeek?: number
}

export interface Member {
  id: string
  name: string
  age: AgeGroup
  conditions: Condition[]
  mask: Mask
  activities: Activity[]
}

export type IndoorSource = 'gas_stove' | 'incense' | 'mosquito_coil' | 'smoking' | 'chulha' | 'candles'

export interface Room {
  id: string
  name: string
  /** Floor area, square feet (what Indian families know). */
  areaSqft: number
  heightFt: number
  /** Purifier Clean Air Delivery Rate, m³/h (0 = none). */
  purifierCadr: number
}

export interface Home {
  rooms: Room[]
  sources: IndoorSource[]
  /** How well the home seals: affects how much outdoor smog leaks in. */
  leakiness: 'sealed' | 'average' | 'leaky'
}

export interface Household {
  members: Member[]
  home: Home
}
