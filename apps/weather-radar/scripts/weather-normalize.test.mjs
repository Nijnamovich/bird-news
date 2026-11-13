import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { validateSnapshot } from '../src/app/weather/snapshot-validate.ts';
import { ATTRIBUTION, buildWeatherSnapshot } from './weather-normalize.mjs';

const NOW = new Date('2026-11-13T02:57:00.000Z');
const sha256 = (input) => createHash('sha256').update(input).digest('hex');

/**
 * A trimmed but real Open-Meteo-shaped payload: the `current` block is copied
 * verbatim from the 2026-11-12 response; the hourly series is cut to 30 local
 * hours around `current.time` so exactly 24 entries follow the current hour.
 */
function openMeteoPayload() {
  const hourlyTimes = [];
  for (let index = 0; index < 30; index += 1) {
    const wall = new Date(Date.UTC(2026, 10, 12, 22, 0) + index * 3_600_000);
    hourlyTimes.push(wall.toISOString().slice(0, 16));
  }

  const weatherCodes = [2, 3, 0, 61, 95, 3, 2];
  const series = (valueFor) => hourlyTimes.map((_, index) => valueFor(index));
  const isDay = (index) => {
    const hour = Number(hourlyTimes[index].slice(11, 13));
    return hour >= 6 && hour < 20 ? 1 : 0;
  };

  return {
    latitude: -38.5545,
    longitude: -58.7396,
    utc_offset_seconds: -10800,
    timezone: 'America/Argentina/Buenos_Aires',
    timezone_abbreviation: 'GMT-3',
    elevation: 23,
    current_units: {
      time: 'iso8601',
      interval: 'seconds',
      temperature_2m: '°C',
      relative_humidity_2m: '%',
      apparent_temperature: '°C',
      is_day: '',
      precipitation: 'mm',
      weather_code: 'wmo code',
      cloud_cover: '%',
      pressure_msl: 'hPa',
      wind_speed_10m: 'km/h',
      wind_direction_10m: '°',
      wind_gusts_10m: 'km/h',
    },
    current: {
      time: '2026-11-12T23:45',
      interval: 900,
      temperature_2m: 14.5,
      relative_humidity_2m: 89,
      apparent_temperature: 12.1,
      is_day: 0,
      precipitation: 0,
      weather_code: 3,
      cloud_cover: 99,
      pressure_msl: 1021.4,
      wind_speed_10m: 22.1,
      wind_direction_10m: 78,
      wind_gusts_10m: 42.5,
    },
    hourly: {
      time: hourlyTimes,
      temperature_2m: series((index) => 14 + (index % 5) * 0.4),
      apparent_temperature: series((index) => 12 + (index % 4) * 0.5),
      precipitation_probability: series((index) => (index * 7) % 100),
      precipitation: series((index) => (index % 6 === 0 ? 0.2 : 0)),
      weather_code: series((index) => weatherCodes[index % weatherCodes.length]),
      wind_speed_10m: series((index) => 18 + (index % 6)),
      wind_gusts_10m: series((index) => 30 + (index % 8)),
      is_day: series(isDay),
    },
    daily: {
      time: [
        '2026-11-12',
        '2026-11-13',
        '2026-11-14',
        '2026-11-15',
        '2026-11-16',
        '2026-11-17',
        '2026-11-18',
      ],
      weather_code: [3, 95, 95, 3, 53, 80, 53],
      temperature_2m_max: [20.4, 23.8, 17.3, 19.7, 23.4, 19.6, 18.5],
      temperature_2m_min: [14.4, 14.2, 14.3, 14.5, 16.7, 13.7, 12.8],
      precipitation_sum: [0, 25.2, 8.6, 0, 1.9, 15.4, 5.9],
      precipitation_probability_max: [10, 100, 100, 15, 73, 73, 48],
      sunrise: [
        '2026-11-12T05:35',
        '2026-11-13T05:34',
        '2026-11-14T05:33',
        '2026-11-15T05:32',
        '2026-11-16T05:31',
        '2026-11-17T05:31',
        '2026-11-18T05:30',
      ],
      sunset: [
        '2026-11-12T19:43',
        '2026-11-13T19:44',
        '2026-11-14T19:45',
        '2026-11-15T19:46',
        '2026-11-16T19:47',
        '2026-11-17T19:48',
        '2026-11-18T19:49',
      ],
      uv_index_max: [8.15, 3.1, 7.9, 4.4, 7.15, 2.35, 5.7],
      wind_speed_10m_max: [25.8, 31.4, 24.3, 23.8, 24.1, 20.9, 40.5],
    },
  };
}

describe('buildWeatherSnapshot', () => {
  test('should emit 24 consecutive hourly entries when the payload starts before the current hour', () => {
    const doc = buildWeatherSnapshot(openMeteoPayload(), { now: NOW, hash: sha256 });

    expect(doc.hourly).toHaveLength(24);
    expect(doc.hourly[0].time).toBe('2026-11-12T23:00:00-03:00');
    for (let index = 1; index < doc.hourly.length; index += 1) {
      expect(Date.parse(doc.hourly[index].time) - Date.parse(doc.hourly[index - 1].time)).toBe(
        3_600_000,
      );
    }
    for (const entry of doc.hourly) {
      expect(entry.time.endsWith('-03:00')).toBe(true);
    }
  });

  test('should emit 7 consecutive local dates when the current local date is the first daily row', () => {
    const doc = buildWeatherSnapshot(openMeteoPayload(), { now: NOW, hash: sha256 });

    expect(doc.daily).toHaveLength(7);
    expect(doc.daily[0].date).toBe('2026-11-12');
    for (let index = 1; index < doc.daily.length; index += 1) {
      const gap =
        Date.parse(`${doc.daily[index].date}T00:00:00Z`) -
        Date.parse(`${doc.daily[index - 1].date}T00:00:00Z`);
      expect(gap).toBe(86_400_000);
    }
    for (const entry of doc.daily) {
      expect(entry.tempMin).toBeLessThanOrEqual(entry.tempMax);
      expect(entry.sunrise.endsWith('-03:00')).toBe(true);
      expect(entry.sunset.endsWith('-03:00')).toBe(true);
    }
  });

  test('should keep the four timing instants in UTC when the location offset is applied', () => {
    const doc = buildWeatherSnapshot(openMeteoPayload(), { now: NOW, hash: sha256 });

    for (const field of ['fetchedAt', 'observedAt', 'issuedAt', 'expiresAt']) {
      expect(doc.timing[field].endsWith('Z')).toBe(true);
    }
    expect(doc.timing.fetchedAt).toBe('2026-11-13T02:57:00.000Z');
    expect(doc.timing.observedAt).toBe('2026-11-13T02:45:00.000Z');
    expect(doc.timing.issuedAt).toBe(doc.timing.fetchedAt);
    expect(doc.timing.expiresAt).toBe('2026-11-13T08:57:00.000Z');
  });

  test('should derive the snapshot id from source, location and fetch instant when hashing', () => {
    const doc = buildWeatherSnapshot(openMeteoPayload(), { now: NOW, hash: sha256 });

    expect(doc.snapshotId).toBe(sha256(`pc-pull|necochea-ar|${doc.timing.fetchedAt}`));
  });

  test('should name only Open-Meteo when attributing the document', () => {
    const doc = buildWeatherSnapshot(openMeteoPayload(), { now: NOW, hash: sha256 });

    expect(doc.source.attribution).toBe(ATTRIBUTION);
    expect(doc.source.attribution).toContain('Open-Meteo');
    expect(doc.source.attribution).toContain('CC BY 4.0');
    expect(doc.source.licenseNote).toContain('sin redistribución');
  });

  test('should map the current WMO code and wind direction when the payload is overcast', () => {
    const doc = buildWeatherSnapshot(openMeteoPayload(), { now: NOW, hash: sha256 });

    expect(doc.current.condition).toEqual({ code: 'overcast', text: 'Cubierto' });
    expect(doc.current.iconCode).toBe('overcast');
    expect(doc.current.isDay).toBe(false);
    expect(doc.current.wind.directionDeg).toBe(78);
    expect(doc.current.wind.directionCardinal).toBe('ENE');
    // Not requested by the producer URL: nullable in the contract.
    expect(doc.current.visibility).toBeNull();
    expect(doc.current.uvIndex).toBeNull();
  });

  test('should pass the contract validator when the payload is a complete response', () => {
    const doc = buildWeatherSnapshot(openMeteoPayload(), { now: NOW, hash: sha256 });

    const result = validateSnapshot(doc);
    if (!result.ok) {
      throw new Error(`built document failed validation:\n${result.errors.join('\n')}`);
    }
    expect(result.ok).toBe(true);
  });

  test('should reject a payload when a daily row has tempMin above tempMax', () => {
    const payload = openMeteoPayload();
    payload.daily.temperature_2m_min[0] = 99;

    expect(() => buildWeatherSnapshot(payload, { now: NOW, hash: sha256 })).toThrow(
      /tempMin <= tempMax/,
    );
  });
});
