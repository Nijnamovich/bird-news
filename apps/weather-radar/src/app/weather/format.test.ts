import { describe, expect, test } from 'vitest';
import {
  formatAge,
  formatDay,
  formatHour,
  formatTemperature,
  formatWind,
  freshnessLabel,
} from './format.ts';

const TZ = 'America/Argentina/Buenos_Aires';

describe('formatTemperature', () => {
  test('should add a degree sign when given a whole temperature', () => {
    expect(formatTemperature(19)).toBe('19°');
  });

  test('should round to the nearest degree when given a decimal temperature', () => {
    expect(formatTemperature(18.6)).toBe('19°');
    expect(formatTemperature(-2.4)).toBe('-2°');
  });
});

describe('formatWind', () => {
  test('should append the cardinal when a direction is present', () => {
    expect(formatWind(14, 'SE')).toBe('14 km/h SE');
  });

  test('should omit the cardinal when the direction is null', () => {
    expect(formatWind(9.6, null)).toBe('10 km/h');
  });
});

describe('formatAge', () => {
  test('should describe sub-minute ages without a zero-minute label', () => {
    expect(formatAge(0)).toBe('hace menos de 1 min');
    expect(formatAge(59)).toBe('hace menos de 1 min');
  });

  test('should describe ages in minutes when under an hour', () => {
    expect(formatAge(720)).toBe('hace 12 min');
  });

  test('should describe ages in hours when under a day', () => {
    expect(formatAge(7200)).toBe('hace 2 h');
  });

  test('should describe ages in days when over a day', () => {
    expect(formatAge(90_000)).toBe('hace 1 d');
  });
});

describe('formatHour', () => {
  test('should render the local time when the instant and zone are known', () => {
    expect(formatHour('2026-11-12T15:00:00Z', TZ)).toBe('12:00');
  });

  test('should render midnight as 00:00 when the zone crosses the date line', () => {
    expect(formatHour('2026-11-12T03:00:00Z', TZ)).toBe('00:00');
  });
});

describe('formatDay', () => {
  test('should render an es-AR short weekday and day when given a date', () => {
    expect(formatDay('2026-11-16')).toBe('lun 16');
    expect(formatDay('2026-11-12')).toBe('jue 12');
  });
});

describe('freshnessLabel', () => {
  test('should render the Spanish banner text for every badge', () => {
    expect(freshnessLabel('none')).toBe('');
    expect(freshnessLabel('updated')).toBe('Actualizado');
    expect(freshnessLabel('stale')).toBe('Datos desactualizados');
    expect(freshnessLabel('expired')).toBe('Datos vencidos');
    expect(freshnessLabel('error')).toBe('Sin datos');
  });
});
