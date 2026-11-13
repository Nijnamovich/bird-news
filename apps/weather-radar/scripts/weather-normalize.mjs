// Normalise an Open-Meteo forecast response into the WeatherSnapshot contract
// (schema 1.0.0, docs/api/openapi.weather-snapshot.yaml).
//
// Pure by construction: no I/O, no clock, no globals. The caller injects the
// instant (`now`) and the SHA-256 implementation (`hash`), so the module is
// deterministic and testable outside Node's crypto module.
//
// Time model
// ----------
// Open-Meteo returns local wall-clock strings without an offset
// (`current.time: "2026-11-12T23:45"`, `hourly.time: ["...T23:00", ...]`) plus
// one `utc_offset_seconds` for the whole response. The contract wants:
//   - local instants with an explicit numeric offset (`-03:00`) for
//     `hourly[].time`, `daily[].sunrise` and `daily[].sunset`;
//   - UTC instants ending in `Z` for the four `timing` fields.
// The offset is derived from `utc_offset_seconds`, never hardcoded. Necochea
// (America/Argentina/Buenos_Aires) does not observe DST, so one offset is
// correct for the whole 7-day window; a DST-observing location would need a
// per-instant offset and this producer would have to reject the mismatch.
//
// WMO weather_code -> ConditionCode / es-AR text / IconCode
// ---------------------------------------------------------
// First-match table, no invented codes. Every WMO code Open-Meteo documents is
// listed; anything else maps to `unknown`. Day/night variants exist only for
// `clear` and `partly-cloudy` per the contract, so other families use one
// shared icon. Daily entries have no `is_day`, so they use the day variant.
//
//   0 clear "Despejado"                      1 clear "Mayormente despejado"
//   2 partly-cloudy "Parcialmente nublado"   3 overcast "Cubierto"
//  45 fog "Niebla"                          48 fog "Niebla con escarcha"
//  51 drizzle "Llovizna ligera"             53 drizzle "Llovizna moderada"
//  55 drizzle "Llovizna intensa"            56 sleet "Llovizna helada ligera"
//  57 sleet "Llovizna helada intensa"       61 rain "Lluvia ligera"
//  63 rain "Lluvia moderada"                65 heavy-rain "Lluvia fuerte"
//  66 sleet "Lluvia helada ligera"          67 sleet "Lluvia helada fuerte"
//  71 snow "Nevada ligera"                  73 snow "Nevada moderada"
//  75 snow "Nevada fuerte"                  77 snow "Granos de nieve"
//  80 rain "Chubascos ligeros"              81 rain "Chubascos moderados"
//  82 heavy-rain "Chubascos fuertes"        85 snow "Chubascos de nieve ligeros"
//  86 snow "Chubascos de nieve fuertes"     95 thunderstorm "Tormenta"
//  96 thunderstorm "Tormenta con granizo ligero"
//  99 thunderstorm "Tormenta con granizo fuerte"

export const SNAPSHOT_SCHEMA_VERSION = '1.0.0';
export const SOURCE_ID = 'pc-pull';

/** The one location this producer serves (contract v1). */
export const LOCATION = Object.freeze({
  id: 'necochea-ar',
  name: 'Necochea',
  country: 'AR',
  lat: -38.5545,
  lon: -58.7396,
  timezone: 'America/Argentina/Buenos_Aires',
});

/** The fixed unit set the contract accepts. */
export const WEATHER_UNITS = Object.freeze({
  temperature: 'celsius',
  windSpeed: 'kmh',
  precipitation: 'mm',
  precipitationProbability: 'percent',
  humidity: 'percent',
  pressure: 'hPa',
  visibility: 'km',
  cloudCover: 'percent',
  uvIndex: 'index',
});

/** Honest attribution: only the upstream actually fetched from is named. */
export const ATTRIBUTION =
  'Datos meteorológicos por Open-Meteo (open-meteo.com) — CC BY 4.0';
export const LICENSE_NOTE =
  'Uso personal/educativo/read-only, sin redistribución. Open-Meteo exige atribución (CC BY 4.0) y no admite uso comercial.';

const CARDINALS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
];

const HOUR_MS = 3_600_000;
const SIX_HOURS_MS = 6 * HOUR_MS;
const HOURLY_COUNT = 24;
const DAILY_COUNT = 7;

/** WMO code -> normalised condition. `icon` is a fixed IconCode or a family. */
const WMO = new Map([
  [0, { code: 'clear', text: 'Despejado', icon: 'clear' }],
  [1, { code: 'clear', text: 'Mayormente despejado', icon: 'clear' }],
  [2, { code: 'partly-cloudy', text: 'Parcialmente nublado', icon: 'partly-cloudy' }],
  [3, { code: 'overcast', text: 'Cubierto', icon: 'overcast' }],
  [45, { code: 'fog', text: 'Niebla', icon: 'fog' }],
  [48, { code: 'fog', text: 'Niebla con escarcha', icon: 'fog' }],
  [51, { code: 'drizzle', text: 'Llovizna ligera', icon: 'drizzle' }],
  [53, { code: 'drizzle', text: 'Llovizna moderada', icon: 'drizzle' }],
  [55, { code: 'drizzle', text: 'Llovizna intensa', icon: 'drizzle' }],
  [56, { code: 'sleet', text: 'Llovizna helada ligera', icon: 'sleet' }],
  [57, { code: 'sleet', text: 'Llovizna helada intensa', icon: 'sleet' }],
  [61, { code: 'rain', text: 'Lluvia ligera', icon: 'rain' }],
  [63, { code: 'rain', text: 'Lluvia moderada', icon: 'rain' }],
  [65, { code: 'heavy-rain', text: 'Lluvia fuerte', icon: 'heavy-rain' }],
  [66, { code: 'sleet', text: 'Lluvia helada ligera', icon: 'sleet' }],
  [67, { code: 'sleet', text: 'Lluvia helada fuerte', icon: 'sleet' }],
  [71, { code: 'snow', text: 'Nevada ligera', icon: 'snow' }],
  [73, { code: 'snow', text: 'Nevada moderada', icon: 'snow' }],
  [75, { code: 'snow', text: 'Nevada fuerte', icon: 'snow' }],
  [77, { code: 'snow', text: 'Granos de nieve', icon: 'snow' }],
  [80, { code: 'rain', text: 'Chubascos ligeros', icon: 'rain' }],
  [81, { code: 'rain', text: 'Chubascos moderados', icon: 'rain' }],
  [82, { code: 'heavy-rain', text: 'Chubascos fuertes', icon: 'heavy-rain' }],
  [85, { code: 'snow', text: 'Chubascos de nieve ligeros', icon: 'snow' }],
  [86, { code: 'snow', text: 'Chubascos de nieve fuertes', icon: 'snow' }],
  [95, { code: 'thunderstorm', text: 'Tormenta', icon: 'thunderstorm' }],
  [96, { code: 'thunderstorm', text: 'Tormenta con granizo ligero', icon: 'thunderstorm' }],
  [99, { code: 'thunderstorm', text: 'Tormenta con granizo fuerte', icon: 'thunderstorm' }],
]);

const UNKNOWN_CONDITION = { code: 'unknown', text: 'Desconocido', icon: 'unknown' };

/**
 * Build a schema-1.0.0 WeatherSnapshot from an Open-Meteo `/v1/forecast`
 * response.
 *
 * @param {unknown} payload Parsed Open-Meteo JSON.
 * @param {{ now: Date, hash: (input: string) => string }} options
 *   `now` is the producer clock instant; `hash` computes the snapshot id
 *   (in practice `sha256` hex). Both are injected so this function stays pure.
 * @returns {object} A WeatherSnapshot document (not yet validated).
 */
export function buildWeatherSnapshot(payload, options) {
  const record = requireRecord(payload, 'response');
  const now = options?.now;
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('buildWeatherSnapshot: `now` must be a valid Date');
  }
  const hash = options?.hash;
  if (typeof hash !== 'function') {
    throw new Error('buildWeatherSnapshot: `hash` must be a function');
  }

  const utcOffsetSeconds = requireInteger(
    record.utc_offset_seconds,
    'utc_offset_seconds',
  );
  const offset = formatOffset(utcOffsetSeconds);

  const payloadCurrent = requireRecord(record.current, 'current');
  const payloadHourly = requireRecord(record.hourly, 'hourly');
  const payloadDaily = requireRecord(record.daily, 'daily');

  const current = buildCurrent(payloadCurrent, offset);
  const fetchedAt = now.toISOString();

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    kind: 'WeatherSnapshot',
    snapshotId: hash(`${SOURCE_ID}|${LOCATION.id}|${fetchedAt}`),
    source: {
      id: SOURCE_ID,
      producer: 'pc',
      attribution: ATTRIBUTION,
      url: 'https://open-meteo.com/',
      licenseNote: LICENSE_NOTE,
    },
    timing: {
      fetchedAt,
      observedAt: toUtcInstant(requireString(payloadCurrent.time, 'current.time'), utcOffsetSeconds),
      // Open-Meteo's free response publishes no model run id, so the fetch
      // instant is the only honest issue time. Do not invent a run timestamp.
      issuedAt: fetchedAt,
      expiresAt: new Date(now.getTime() + SIX_HOURS_MS).toISOString(),
      ttlSeconds: 1800,
      staleAfterSeconds: 3600,
    },
    location: buildLocation(record.elevation),
    units: { ...WEATHER_UNITS },
    current,
    hourly: buildHourly(payloadHourly, requireString(payloadCurrent.time, 'current.time'), offset),
    daily: buildDaily(payloadDaily, requireString(payloadCurrent.time, 'current.time'), offset),
    alerts: [],
    status: { ok: true },
  };
}

function buildLocation(elevation) {
  const location = { ...LOCATION };
  if (typeof elevation === 'number' && Number.isFinite(elevation)) {
    location.elevationM = Math.round(elevation);
  }
  return location;
}

function buildCurrent(payload, offset) {
  const isDay = requireZeroOne(payload.is_day, 'current.is_day');
  const condition = conditionFor(
    requireInteger(payload.weather_code, 'current.weather_code'),
    isDay,
  );
  const directionDeg = nullableNumber(payload.wind_direction_10m, 'current.wind_direction_10m');

  return {
    temperature: round1(requireNumber(payload.temperature_2m, 'current.temperature_2m')),
    feelsLike: round1(requireNumber(payload.apparent_temperature, 'current.apparent_temperature')),
    condition: { code: condition.code, text: condition.text },
    iconCode: condition.icon,
    humidity: clampPercent(requireNumber(payload.relative_humidity_2m, 'current.relative_humidity_2m')),
    wind: {
      speed: round1(requireNumber(payload.wind_speed_10m, 'current.wind_speed_10m')),
      gust: nullableRound1(payload.wind_gusts_10m, 'current.wind_gusts_10m'),
      directionDeg,
      directionCardinal: directionDeg === null ? null : cardinalFor(directionDeg),
    },
    pressure: nullableRound1(payload.pressure_msl, 'current.pressure_msl'),
    // Not requested by this producer's URL (current=temperature_2m,...): the
    // contract allows null for both. A future URL that adds them flows through
    // unchanged instead of being invented.
    visibility: nullableRound1(payload.visibility, 'current.visibility'),
    uvIndex: nullableRound1(payload.uv_index, 'current.uv_index'),
    cloudCover:
      payload.cloud_cover === undefined || payload.cloud_cover === null
        ? null
        : clampPercent(requireNumber(payload.cloud_cover, 'current.cloud_cover')),
    precipLastHourMm: nullableRound2(payload.precipitation, 'current.precipitation'),
    isDay,
  };
}

function buildHourly(payload, currentWallTime, offset) {
  const times = requireArray(payload.time, 'hourly.time');
  const startWallTime = `${currentWallTime.slice(0, 13)}:00`;
  const startIndex = times.indexOf(startWallTime);
  if (startIndex === -1) {
    throw new Error(
      `hourly.time does not contain the current local hour "${startWallTime}"`,
    );
  }
  if (startIndex + HOURLY_COUNT > times.length) {
    throw new Error(
      `hourly.time has only ${times.length - startIndex} entries from "${startWallTime}", need ${HOURLY_COUNT}`,
    );
  }

  const entries = [];
  for (let index = startIndex; index < startIndex + HOURLY_COUNT; index += 1) {
    const isDay = requireZeroOne(payload.is_day?.[index], `hourly.is_day[${index}]`);
    const condition = conditionFor(
      requireInteger(payload.weather_code?.[index], `hourly.weather_code[${index}]`),
      isDay,
    );
    entries.push({
      time: toLocalInstant(requireString(times[index], `hourly.time[${index}]`), offset),
      temperature: round1(requireNumber(payload.temperature_2m?.[index], `hourly.temperature_2m[${index}]`)),
      feelsLike: round1(requireNumber(payload.apparent_temperature?.[index], `hourly.apparent_temperature[${index}]`)),
      precipProbability: clampPercent(
        requireNumber(payload.precipitation_probability?.[index], `hourly.precipitation_probability[${index}]`),
      ),
      precipMm: round2(requireNumber(payload.precipitation?.[index], `hourly.precipitation[${index}]`)),
      windSpeed: round1(requireNumber(payload.wind_speed_10m?.[index], `hourly.wind_speed_10m[${index}]`)),
      windGust: nullableRound1(payload.wind_gusts_10m?.[index], `hourly.wind_gusts_10m[${index}]`),
      conditionCode: condition.code,
      iconCode: condition.icon,
      isDay,
    });
  }
  return entries;
}

function buildDaily(payload, currentWallTime, offset) {
  const dates = requireArray(payload.time, 'daily.time');
  const localDate = currentWallTime.slice(0, 10);
  const startIndex = dates.indexOf(localDate);
  if (startIndex === -1) {
    throw new Error(`daily.time does not contain the current local date "${localDate}"`);
  }
  if (startIndex + DAILY_COUNT > dates.length) {
    throw new Error(
      `daily.time has only ${dates.length - startIndex} entries from "${localDate}", need ${DAILY_COUNT}`,
    );
  }

  const entries = [];
  for (let index = startIndex; index < startIndex + DAILY_COUNT; index += 1) {
    // Daily entries carry no daylight flag: the day variant is the honest pick.
    const condition = conditionFor(
      requireInteger(payload.weather_code?.[index], `daily.weather_code[${index}]`),
      true,
    );
    const tempMin = round1(
      requireNumber(payload.temperature_2m_min?.[index], `daily.temperature_2m_min[${index}]`),
    );
    const tempMax = round1(
      requireNumber(payload.temperature_2m_max?.[index], `daily.temperature_2m_max[${index}]`),
    );
    if (tempMin > tempMax) {
      throw new Error(
        `daily[${index}] violates tempMin <= tempMax (${tempMin} > ${tempMax})`,
      );
    }
    entries.push({
      date: requireString(dates[index], `daily.time[${index}]`),
      tempMin,
      tempMax,
      precipProbability: clampPercent(
        requireNumber(
          payload.precipitation_probability_max?.[index],
          `daily.precipitation_probability_max[${index}]`,
        ),
      ),
      precipMm: round2(
        requireNumber(payload.precipitation_sum?.[index], `daily.precipitation_sum[${index}]`),
      ),
      sunrise: nullableLocalInstant(payload.sunrise?.[index], `daily.sunrise[${index}]`, offset),
      sunset: nullableLocalInstant(payload.sunset?.[index], `daily.sunset[${index}]`, offset),
      conditionCode: condition.code,
      iconCode: condition.icon,
      uvIndexMax: nullableRound1(payload.uv_index_max?.[index], `daily.uv_index_max[${index}]`),
      windSpeedMax: round1(
        requireNumber(payload.wind_speed_10m_max?.[index], `daily.wind_speed_10m_max[${index}]`),
      ),
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function conditionFor(weatherCode, isDay) {
  const entry = WMO.get(weatherCode) ?? UNKNOWN_CONDITION;
  let icon;
  if (entry.icon === 'clear') {
    icon = isDay ? 'clear-day' : 'clear-night';
  } else if (entry.icon === 'partly-cloudy') {
    icon = isDay ? 'partly-cloudy-day' : 'partly-cloudy-night';
  } else {
    icon = entry.icon;
  }
  return { code: entry.code, text: entry.text, icon };
}

/** 16-point compass; 360 degrees wraps back to N. */
function cardinalFor(degrees) {
  const index = Math.round(degrees / 22.5) % CARDINALS.length;
  return CARDINALS[index];
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

function formatOffset(seconds) {
  if (seconds % 60 !== 0) {
    throw new Error(`utc_offset_seconds must be a whole number of minutes, got ${seconds}`);
  }
  const sign = seconds < 0 ? '-' : '+';
  const absolute = Math.abs(seconds);
  const hours = Math.floor(absolute / 3600);
  const minutes = Math.floor((absolute % 3600) / 60);
  return `${sign}${pad2(hours)}:${pad2(minutes)}`;
}

/** `"2026-11-12T23:00"` -> `"2026-11-12T23:00:00-03:00"`. */
function toLocalInstant(wallTime, offset) {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2}))?/.exec(wallTime);
  if (match === null) {
    throw new Error(`expected a local wall-clock timestamp, got "${wallTime}"`);
  }
  return `${match[1]}:${match[2] ?? '00'}${offset}`;
}

function nullableLocalInstant(value, path, offset) {
  if (value === undefined || value === null) {
    return null;
  }
  return toLocalInstant(requireString(value, path), offset);
}

/**
 * Local wall time -> UTC instant ending in `Z`. `Date.parse` reads the
 * offset-less string as UTC, so subtract the location offset to get real UTC.
 */
function toUtcInstant(wallTime, utcOffsetSeconds) {
  const asUtcMs = Date.parse(`${wallTime}Z`);
  if (Number.isNaN(asUtcMs)) {
    throw new Error(`expected a local wall-clock timestamp, got "${wallTime}"`);
  }
  return new Date(asUtcMs - utcOffsetSeconds * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Primitive guards
// ---------------------------------------------------------------------------

function requireRecord(value, path) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected an object`);
  }
  return value;
}

function requireArray(value, path) {
  if (!Array.isArray(value)) {
    throw new Error(`${path}: expected an array`);
  }
  return value;
}

function requireString(value, path) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${path}: expected a non-empty string`);
  }
  return value;
}

function requireNumber(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path}: expected a finite number`);
  }
  return value;
}

function requireInteger(value, path) {
  const number = requireNumber(value, path);
  if (!Number.isInteger(number)) {
    throw new Error(`${path}: expected an integer`);
  }
  return number;
}

function requireZeroOne(value, path) {
  const number = requireInteger(value, path);
  if (number !== 0 && number !== 1) {
    throw new Error(`${path}: expected 0 or 1`);
  }
  return number === 1;
}

function nullableNumber(value, path) {
  if (value === undefined || value === null) {
    return null;
  }
  return requireNumber(value, path);
}

function nullableRound1(value, path) {
  const number = nullableNumber(value, path);
  return number === null ? null : round1(number);
}

function nullableRound2(value, path) {
  const number = nullableNumber(value, path);
  return number === null ? null : round2(number);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function pad2(value) {
  return String(value).padStart(2, '0');
}
