/**
 * The frozen read-only weather snapshot contract (schema 1.0.0).
 *
 * These types are the wire contract shared with the companion producer. Field
 * names and literal values are non-negotiable: documentation and fixtures are
 * written against them. Runtime invariants live in `snapshot-validate.ts`;
 * the types intentionally describe the shape only.
 */

export const SNAPSHOT_SCHEMA_VERSION = '1.0.0';

export type ConditionCode =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'overcast'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'heavy-rain'
  | 'thunderstorm'
  | 'sleet'
  | 'snow'
  | 'wind'
  | 'unknown';

export type IconCode =
  | 'clear-day'
  | 'clear-night'
  | 'partly-cloudy-day'
  | 'partly-cloudy-night'
  | 'cloudy'
  | 'overcast'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'heavy-rain'
  | 'thunderstorm'
  | 'sleet'
  | 'snow'
  | 'wind'
  | 'unknown';

export type SourceId = 'fixture' | 'pc-pull' | 'phone-scrape' | 'push';

export type Producer = 'fixture' | 'pc' | 'phone';

export type SnapshotErrorCode =
  | 'FETCH_BLOCKED'
  | 'HTTP_ERROR'
  | 'PARSE_ERROR'
  | 'SCHEMA_INVALID'
  | 'RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'CLOCK_SKEW'
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'UNSUPPORTED_UNITS';

export type Cardinal =
  | 'N'
  | 'NNE'
  | 'NE'
  | 'ENE'
  | 'E'
  | 'ESE'
  | 'SE'
  | 'SSE'
  | 'S'
  | 'SSW'
  | 'SW'
  | 'WSW'
  | 'W'
  | 'WNW'
  | 'NW'
  | 'NNW';

export type AlertSeverity = 'minor' | 'moderate' | 'severe' | 'extreme' | 'unknown';

export interface WeatherUnits {
  temperature: 'celsius';
  windSpeed: 'kmh';
  precipitation: 'mm';
  precipitationProbability: 'percent';
  humidity: 'percent';
  pressure: 'hPa';
  visibility: 'km';
  cloudCover: 'percent';
  uvIndex: 'index';
}

export interface SnapshotSource {
  id: SourceId;
  producer: Producer;
  attribution: string;
  url: string | null;
  licenseNote: string;
}

export interface SnapshotTiming {
  fetchedAt: string;
  observedAt: string;
  issuedAt: string;
  expiresAt: string;
  ttlSeconds: number;
  staleAfterSeconds: number;
}

export interface SnapshotLocation {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  timezone: string;
  elevationM?: number;
}

export interface SnapshotWind {
  speed: number;
  gust: number | null;
  directionDeg: number | null;
  directionCardinal: Cardinal | null;
}

export interface SnapshotCondition {
  code: ConditionCode;
  text: string;
}

export interface CurrentConditions {
  temperature: number;
  feelsLike: number;
  condition: SnapshotCondition;
  iconCode: IconCode;
  humidity: number;
  wind: SnapshotWind;
  pressure: number | null;
  visibility: number | null;
  uvIndex: number | null;
  cloudCover: number | null;
  precipLastHourMm: number | null;
  isDay: boolean;
}

export interface HourlyEntry {
  time: string;
  temperature: number;
  feelsLike: number;
  precipProbability: number;
  precipMm: number;
  windSpeed: number;
  windGust: number | null;
  conditionCode: ConditionCode;
  iconCode: IconCode;
  isDay: boolean;
}

export interface DailyEntry {
  date: string;
  tempMin: number;
  tempMax: number;
  precipProbability: number;
  precipMm: number;
  sunrise: string | null;
  sunset: string | null;
  conditionCode: ConditionCode;
  iconCode: IconCode;
  uvIndexMax: number | null;
  windSpeedMax: number;
}

export interface WeatherAlert {
  id: string;
  title: string;
  severity: AlertSeverity;
  startsAt: string;
  endsAt: string | null;
  text: string;
}

export interface SnapshotError {
  code: SnapshotErrorCode;
  message: string;
  retryAfterSeconds: number | null;
}

export interface WeatherSnapshot {
  schemaVersion: string;
  kind: 'WeatherSnapshot';
  snapshotId: string;
  source: SnapshotSource;
  timing: SnapshotTiming;
  location: SnapshotLocation;
  units: WeatherUnits;
  current: CurrentConditions | null;
  hourly: HourlyEntry[] | null;
  daily: DailyEntry[] | null;
  alerts?: WeatherAlert[];
  status: { ok: true } | { ok: false; error: SnapshotError };
}

/** The one units object every schema-1.0.0 snapshot must carry. */
export const WEATHER_UNITS: WeatherUnits = {
  temperature: 'celsius',
  windSpeed: 'kmh',
  precipitation: 'mm',
  precipitationProbability: 'percent',
  humidity: 'percent',
  pressure: 'hPa',
  visibility: 'km',
  cloudCover: 'percent',
  uvIndex: 'index',
};
