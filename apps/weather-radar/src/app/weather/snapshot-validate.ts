/**
 * Runtime validator for the `WeatherSnapshot` contract.
 *
 * The types describe the shape; this module enforces the schema-1.0.0
 * invariants that a type cannot express. It never throws: any input, including
 * `null`, arrays, or wrongly-typed objects, produces a result object.
 *
 * Producer-enforced invariants that this client does NOT check (keep this list
 * in sync with the OpenAPI "Not expressible in OpenAPI" block):
 *
 * - `snapshotId` equals `sha256('<source.id>|<location.id>|<timing.fetchedAt>')`.
 *   The client checks the format only (lowercase 64-hex); recomputing the hash
 *   would need a platform crypto API this read-only screen does not use.
 * - `daily[0].date` equals the location's current local date. This validator
 *   has no clock and deliberately stays pure.
 */

import {
  SNAPSHOT_SCHEMA_VERSION,
  WEATHER_UNITS,
  type AlertSeverity,
  type Cardinal,
  type ConditionCode,
  type IconCode,
  type Producer,
  type SnapshotErrorCode,
  type SourceId,
  type WeatherSnapshot,
} from './weather-snapshot.types.ts';

export type ValidationResult =
  | { ok: true; value: WeatherSnapshot }
  | { ok: false; errors: string[] };

/**
 * Enum literal sets are declared as exact records of the union, so adding a
 * member to a contract union without adding it here is a type error. The
 * `Set` used for lookups is derived from the record.
 */
function members<T extends string>(record: Record<T, true>): ReadonlySet<T> {
  return new Set(Object.keys(record) as T[]);
}

const CONDITION_CODES = members({
  clear: true,
  'partly-cloudy': true,
  cloudy: true,
  overcast: true,
  fog: true,
  drizzle: true,
  rain: true,
  'heavy-rain': true,
  thunderstorm: true,
  sleet: true,
  snow: true,
  wind: true,
  unknown: true,
} satisfies Record<ConditionCode, true>);

const ICON_CODES = members({
  'clear-day': true,
  'clear-night': true,
  'partly-cloudy-day': true,
  'partly-cloudy-night': true,
  cloudy: true,
  overcast: true,
  fog: true,
  drizzle: true,
  rain: true,
  'heavy-rain': true,
  thunderstorm: true,
  sleet: true,
  snow: true,
  wind: true,
  unknown: true,
} satisfies Record<IconCode, true>);

const SOURCE_IDS = members({
  fixture: true,
  'pc-pull': true,
  'phone-scrape': true,
  push: true,
} satisfies Record<SourceId, true>);
const PRODUCERS = members({
  fixture: true,
  pc: true,
  phone: true,
} satisfies Record<Producer, true>);
const CARDINALS = members({
  N: true,
  NNE: true,
  NE: true,
  ENE: true,
  E: true,
  ESE: true,
  SE: true,
  SSE: true,
  S: true,
  SSW: true,
  SW: true,
  WSW: true,
  W: true,
  WNW: true,
  NW: true,
  NNW: true,
} satisfies Record<Cardinal, true>);
const SEVERITIES = members({
  minor: true,
  moderate: true,
  severe: true,
  extreme: true,
  unknown: true,
} satisfies Record<AlertSeverity, true>);
const ERROR_CODES = members({
  FETCH_BLOCKED: true,
  HTTP_ERROR: true,
  PARSE_ERROR: true,
  SCHEMA_INVALID: true,
  RATE_LIMITED: true,
  UPSTREAM_UNAVAILABLE: true,
  CLOCK_SKEW: true,
  UNSUPPORTED_SCHEMA_VERSION: true,
  UNSUPPORTED_UNITS: true,
} satisfies Record<SnapshotErrorCode, true>);

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const SCHEMA_VERSION = /^(\d+)\.\d+\.\d+$/;
const SUPPORTED_SCHEMA_MAJOR = SNAPSHOT_SCHEMA_VERSION.split('.')[0];
/** Producer-clock instants are UTC and say so. */
const UTC_INSTANT = /T.*Z$/;
/** Local-time instants carry an explicit numeric offset. */
const OFFSET_INSTANT = /[+-]\d{2}:\d{2}$/;
const OFFSET = /([+-])(\d{2}):(\d{2})$/;
const SNAPSHOT_ID = /^[a-f0-9]{64}$/;
const PERCENT_MIN = 0;
const PERCENT_MAX = 100;
const WIND_DIRECTION_MIN = 0;
const WIND_DIRECTION_MAX = 360;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isDateOnly(value: unknown): value is string {
  return (
    isString(value) &&
    DATE_ONLY.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

/** A UTC instant: parseable and ending in `Z`, as the producer clock must be. */
function isUtcInstant(value: unknown): value is string {
  return isString(value) && UTC_INSTANT.test(value) && !Number.isNaN(Date.parse(value));
}

/** A local-time instant with an explicit numeric offset, e.g. `-03:00`. */
function isOffsetInstant(value: unknown): value is string {
  return isString(value) && OFFSET_INSTANT.test(value) && !Number.isNaN(Date.parse(value));
}

function offsetMinutes(value: string): number | null {
  const match = OFFSET.exec(value);
  if (match === null) {
    return null;
  }
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

/**
 * An hourly time is aligned when it is the top of the hour in the location's
 * own offset and its seconds and milliseconds are zero.
 */
function isHourAligned(value: string): boolean {
  const minutes = offsetMinutes(value);
  const parsed = Date.parse(value);
  if (minutes === null || Number.isNaN(parsed)) {
    return false;
  }
  const date = new Date(parsed);
  if (date.getUTCSeconds() !== 0 || date.getUTCMilliseconds() !== 0) {
    return false;
  }
  return (date.getUTCMinutes() + minutes) % 60 === 0;
}

function isInRange(value: unknown, min: number, max: number): value is number {
  return isFiniteNumber(value) && value >= min && value <= max;
}

function isNullableInRange(value: unknown, min: number, max: number): boolean {
  return value === null || isInRange(value, min, max);
}

function isMember<T extends string>(set: ReadonlySet<T>, value: unknown): value is T {
  return isString(value) && set.has(value as T);
}

function isSupportedSchemaVersion(value: unknown): value is string {
  if (!isString(value)) {
    return false;
  }
  const match = SCHEMA_VERSION.exec(value);
  return match !== null && match[1] === SUPPORTED_SCHEMA_MAJOR;
}

export function validateSnapshot(value: unknown): ValidationResult {
  const errors: string[] = [];

  try {
    validateRoot(value, errors);
  } catch (error) {
    // Defensive belt: a hostile object with throwing getters must not escape.
    errors.push(`validator crashed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: value as WeatherSnapshot };
}

function validateRoot(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('snapshot: expected an object');
    return;
  }

  if (!isSupportedSchemaVersion(value.schemaVersion)) {
    errors.push(
      `schemaVersion: expected a supported ${SUPPORTED_SCHEMA_MAJOR}.x.y version, got "${String(value.schemaVersion)}"`,
    );
  }
  if (value.kind !== 'WeatherSnapshot') {
    errors.push('kind: expected "WeatherSnapshot"');
  }
  // Format only: the producer computes the hash. See the module-level note.
  if (!isString(value.snapshotId) || !SNAPSHOT_ID.test(value.snapshotId)) {
    errors.push('snapshotId: expected a lowercase 64-character hex string');
  }

  validateSource(value.source, errors);
  validateTiming(value.timing, errors);
  validateLocation(value.location, errors);
  validateUnits(value.units, errors);

  if (value.current !== null) {
    validateCurrent(value.current, errors);
  }
  if (value.hourly !== null) {
    validateHourly(value.hourly, errors);
  }
  if (value.daily !== null) {
    validateDaily(value.daily, errors);
  }
  if (value.alerts !== undefined) {
    validateAlerts(value.alerts, errors);
  }

  validateStatus(value, errors);
}

function validateSource(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('source: expected an object');
    return;
  }
  if (!isMember(SOURCE_IDS, value.id)) {
    errors.push('source.id: unknown source id');
  }
  if (!isMember(PRODUCERS, value.producer)) {
    errors.push('source.producer: unknown producer');
  }
  if (!isString(value.attribution)) {
    errors.push('source.attribution: expected a string');
  }
  if (value.url !== null && !isString(value.url)) {
    errors.push('source.url: expected a string or null');
  }
  if (!isString(value.licenseNote)) {
    errors.push('source.licenseNote: expected a string');
  }
}

function validateTiming(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('timing: expected an object');
    return;
  }

  const fields = ['fetchedAt', 'observedAt', 'issuedAt', 'expiresAt'] as const;
  for (const field of fields) {
    if (!isUtcInstant(value[field])) {
      errors.push(`timing.${field}: expected a UTC ISO timestamp ending in Z`);
    }
  }

  if (!isInteger(value.ttlSeconds)) {
    errors.push('timing.ttlSeconds: expected an integer');
  } else if (value.ttlSeconds < 60) {
    errors.push('timing.ttlSeconds: must be at least 60');
  }

  if (!isInteger(value.staleAfterSeconds)) {
    errors.push('timing.staleAfterSeconds: expected an integer');
  } else if (isInteger(value.ttlSeconds) && value.staleAfterSeconds < value.ttlSeconds) {
    errors.push('timing.staleAfterSeconds: must be at least ttlSeconds');
  }

  if (
    isUtcInstant(value.fetchedAt) &&
    isUtcInstant(value.expiresAt) &&
    Date.parse(value.expiresAt) <= Date.parse(value.fetchedAt)
  ) {
    errors.push('timing.expiresAt: must be after fetchedAt');
  }
}

function validateLocation(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('location: expected an object');
    return;
  }
  for (const field of ['id', 'name', 'country', 'timezone'] as const) {
    if (!isNonEmptyString(value[field])) {
      errors.push(`location.${field}: expected a non-empty string`);
    }
  }
  if (!isFiniteNumber(value.lat)) {
    errors.push('location.lat: expected a number');
  }
  if (!isFiniteNumber(value.lon)) {
    errors.push('location.lon: expected a number');
  }
  if (value.elevationM !== undefined && !isFiniteNumber(value.elevationM)) {
    errors.push('location.elevationM: expected a number when present');
  }
}

function validateUnits(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('units: expected an object');
    return;
  }

  const expectedKeys = Object.keys(WEATHER_UNITS) as (keyof typeof WEATHER_UNITS)[];
  for (const key of expectedKeys) {
    if (value[key] !== WEATHER_UNITS[key]) {
      errors.push(`units.${key}: expected "${WEATHER_UNITS[key]}"`);
    }
  }
  for (const key of Object.keys(value)) {
    if (!(key in WEATHER_UNITS)) {
      errors.push(`units.${key}: unexpected unit`);
    }
  }
}

function validateCurrent(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('current: expected an object or null');
    return;
  }

  if (!isFiniteNumber(value.temperature)) {
    errors.push('current.temperature: expected a number');
  }
  if (!isFiniteNumber(value.feelsLike)) {
    errors.push('current.feelsLike: expected a number');
  }
  validateCondition(value.condition, 'current.condition', errors);
  if (!isMember(ICON_CODES, value.iconCode)) {
    errors.push('current.iconCode: unknown icon code');
  }
  if (!isInRange(value.humidity, PERCENT_MIN, PERCENT_MAX)) {
    errors.push('current.humidity: expected a percentage between 0 and 100');
  }
  validateWind(value.wind, errors);
  if (!isNullableInRange(value.cloudCover, PERCENT_MIN, PERCENT_MAX)) {
    errors.push('current.cloudCover: expected a percentage between 0 and 100 or null');
  }
  for (const field of ['pressure', 'visibility', 'uvIndex', 'precipLastHourMm'] as const) {
    if (!isNullableNumber(value[field])) {
      errors.push(`current.${field}: expected a number or null`);
    }
  }
  if (typeof value.isDay !== 'boolean') {
    errors.push('current.isDay: expected a boolean');
  }
}

function validateCondition(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an object`);
    return;
  }
  if (!isMember(CONDITION_CODES, value.code)) {
    errors.push(`${path}.code: unknown condition code`);
  }
  if (!isString(value.text)) {
    errors.push(`${path}.text: expected a string`);
  }
}

function validateWind(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('current.wind: expected an object');
    return;
  }
  if (!isFiniteNumber(value.speed)) {
    errors.push('current.wind.speed: expected a number');
  }
  if (!isNullableNumber(value.gust)) {
    errors.push('current.wind.gust: expected a number or null');
  }
  if (!isNullableInRange(value.directionDeg, WIND_DIRECTION_MIN, WIND_DIRECTION_MAX)) {
    errors.push('current.wind.directionDeg: expected a number between 0 and 360 or null');
  }
  if (value.directionCardinal !== null && !isMember(CARDINALS, value.directionCardinal)) {
    errors.push('current.wind.directionCardinal: expected a cardinal or null');
  }
}

function validateHourly(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push('hourly: expected an array or null');
    return;
  }
  if (value.length !== 24) {
    errors.push(`hourly: expected exactly 24 entries, got ${value.length}`);
  }

  value.forEach((entry, index) => {
    const path = `hourly[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${path}: expected an object`);
      return;
    }
    if (!isOffsetInstant(entry.time)) {
      errors.push(`${path}.time: expected a local ISO timestamp with a numeric offset`);
    } else if (!isHourAligned(entry.time)) {
      errors.push(`${path}.time: expected the top of the hour in the location offset`);
    }
    for (const field of ['temperature', 'feelsLike', 'precipMm', 'windSpeed'] as const) {
      if (!isFiniteNumber(entry[field])) {
        errors.push(`${path}.${field}: expected a number`);
      }
    }
    if (!isInRange(entry.precipProbability, PERCENT_MIN, PERCENT_MAX)) {
      errors.push(`${path}.precipProbability: expected a percentage between 0 and 100`);
    }
    if (!isNullableNumber(entry.windGust)) {
      errors.push(`${path}.windGust: expected a number or null`);
    }
    if (!isMember(CONDITION_CODES, entry.conditionCode)) {
      errors.push(`${path}.conditionCode: unknown condition code`);
    }
    if (!isMember(ICON_CODES, entry.iconCode)) {
      errors.push(`${path}.iconCode: unknown icon code`);
    }
    if (typeof entry.isDay !== 'boolean') {
      errors.push(`${path}.isDay: expected a boolean`);
    }
  });

  validateHourlySpacing(value, errors);
}

function validateHourlySpacing(entries: unknown[], errors: string[]): void {
  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1];
    const current = entries[index];
    if (!isRecord(previous) || !isRecord(current)) {
      continue;
    }
    if (!isOffsetInstant(previous.time) || !isOffsetInstant(current.time)) {
      continue;
    }
    const gap = Date.parse(current.time) - Date.parse(previous.time);
    if (gap !== HOUR_MS) {
      errors.push(
        `hourly[${index}].time: expected a 3600s gap, got ${Math.round(gap / 1000)}s`,
      );
    }
  }
}

function validateDaily(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push('daily: expected an array or null');
    return;
  }
  if (value.length !== 7) {
    errors.push(`daily: expected exactly 7 entries, got ${value.length}`);
  }

  value.forEach((entry, index) => {
    const path = `daily[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${path}: expected an object`);
      return;
    }
    if (!isDateOnly(entry.date)) {
      errors.push(`${path}.date: expected a YYYY-MM-DD date`);
    }
    for (const field of ['tempMin', 'tempMax', 'precipMm', 'windSpeedMax'] as const) {
      if (!isFiniteNumber(entry[field])) {
        errors.push(`${path}.${field}: expected a number`);
      }
    }
    if (!isInRange(entry.precipProbability, PERCENT_MIN, PERCENT_MAX)) {
      errors.push(`${path}.precipProbability: expected a percentage between 0 and 100`);
    }
    if (isFiniteNumber(entry.tempMin) && isFiniteNumber(entry.tempMax)) {
      if (entry.tempMin > entry.tempMax) {
        errors.push(`${path}.tempMin: must not exceed tempMax`);
      }
    }
    for (const field of ['sunrise', 'sunset'] as const) {
      if (entry[field] !== null && !isOffsetInstant(entry[field])) {
        errors.push(
          `${path}.${field}: expected a local ISO timestamp with a numeric offset or null`,
        );
      }
    }
    if (!isMember(CONDITION_CODES, entry.conditionCode)) {
      errors.push(`${path}.conditionCode: unknown condition code`);
    }
    if (!isMember(ICON_CODES, entry.iconCode)) {
      errors.push(`${path}.iconCode: unknown icon code`);
    }
    if (!isNullableNumber(entry.uvIndexMax)) {
      errors.push(`${path}.uvIndexMax: expected a number or null`);
    }
  });

  validateDailySpacing(value, errors);
}

function validateDailySpacing(entries: unknown[], errors: string[]): void {
  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1];
    const current = entries[index];
    if (!isRecord(previous) || !isRecord(current)) {
      continue;
    }
    if (!isDateOnly(previous.date) || !isDateOnly(current.date)) {
      continue;
    }
    const gap =
      Date.parse(`${current.date}T00:00:00Z`) - Date.parse(`${previous.date}T00:00:00Z`);
    if (gap !== DAY_MS) {
      errors.push(`daily[${index}].date: dates must be consecutive`);
    }
  }
}

function validateAlerts(value: unknown, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push('alerts: expected an array when present');
    return;
  }
  value.forEach((entry, index) => {
    const path = `alerts[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${path}: expected an object`);
      return;
    }
    if (!isNonEmptyString(entry.id)) {
      errors.push(`${path}.id: expected a non-empty string`);
    }
    if (!isString(entry.title)) {
      errors.push(`${path}.title: expected a string`);
    }
    if (!isMember(SEVERITIES, entry.severity)) {
      errors.push(`${path}.severity: unknown severity`);
    }
    if (!isUtcInstant(entry.startsAt)) {
      errors.push(`${path}.startsAt: expected a UTC ISO timestamp ending in Z`);
    }
    if (entry.endsAt !== null && !isUtcInstant(entry.endsAt)) {
      errors.push(`${path}.endsAt: expected a UTC ISO timestamp ending in Z or null`);
    }
    if (!isString(entry.text)) {
      errors.push(`${path}.text: expected a string`);
    }
  });
}

function validateStatus(value: Record<string, unknown>, errors: string[]): void {
  const status = value.status;
  if (!isRecord(status) || typeof status.ok !== 'boolean') {
    errors.push('status: expected { ok: true } or { ok: false, error }');
    return;
  }

  if (status.ok) {
    if ('error' in status) {
      errors.push('status.error: must be absent when status.ok is true');
    }
    if (value.current === null || value.current === undefined) {
      errors.push('current: must be present when status.ok is true');
    }
    if (value.hourly === null || value.hourly === undefined) {
      errors.push('hourly: must be present when status.ok is true');
    }
    if (value.daily === null || value.daily === undefined) {
      errors.push('daily: must be present when status.ok is true');
    }
    return;
  }

  if (value.current !== null) {
    errors.push('current: must be null when status.ok is false');
  }
  if (value.hourly !== null) {
    errors.push('hourly: must be null when status.ok is false');
  }
  if (value.daily !== null) {
    errors.push('daily: must be null when status.ok is false');
  }
  validateSnapshotError(status.error, errors);
}

function validateSnapshotError(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push('status.error: expected an object');
    return;
  }
  if (!isMember(ERROR_CODES, value.code)) {
    errors.push('status.error.code: unknown error code');
  }
  if (!isString(value.message)) {
    errors.push('status.error.message: expected a string');
  }
  if (!isNullableNumber(value.retryAfterSeconds)) {
    errors.push('status.error.retryAfterSeconds: expected a number or null');
  }
}
