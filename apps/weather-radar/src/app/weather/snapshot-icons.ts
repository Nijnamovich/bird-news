/**
 * Snapshot icon helpers.
 *
 * The contract carries a stable `IconCode`; the screen draws a small local
 * glyph set (`IconName`). This module owns both hops so there is exactly one
 * mapping of each kind:
 *
 * - `iconNameFor` maps the contract icon to the local glyph; the screen uses it.
 * - `iconCodeFor` derives the contract icon from a condition + day/night flag.
 *   It has no screen consumer today (the producer already emits `iconCode`),
 *   but it is the reference implementation of the contract's day/night rule and
 *   is covered by tests.
 *
 * The app never needs text→condition: there is no scraper. The producer owns
 * that mapping (WMO `weather_code` → `ConditionCode`), and the table of record
 * is the `ConditionCode` description in the OpenAPI contract.
 */

import type { ConditionCode, IconCode } from './weather-snapshot.types.ts';
import type { IconName } from '../icons.ts';

export function iconCodeFor(condition: ConditionCode, isDay: boolean): IconCode {
  switch (condition) {
    case 'clear':
      return isDay ? 'clear-day' : 'clear-night';
    case 'partly-cloudy':
      return isDay ? 'partly-cloudy-day' : 'partly-cloudy-night';
    case 'cloudy':
      return 'cloudy';
    case 'overcast':
      return 'overcast';
    case 'fog':
      return 'fog';
    case 'drizzle':
      return 'drizzle';
    case 'rain':
      return 'rain';
    case 'heavy-rain':
      return 'heavy-rain';
    case 'thunderstorm':
      return 'thunderstorm';
    case 'sleet':
      return 'sleet';
    case 'snow':
      return 'snow';
    case 'wind':
      return 'wind';
    case 'unknown':
      return 'unknown';
  }
}

/** The one `IconCode -> IconName` mapping in the app. */
const ICON_FOR_CODE: Record<IconCode, IconName> = {
  'clear-day': 'sun',
  'clear-night': 'moon',
  'partly-cloudy-day': 'cloud',
  'partly-cloudy-night': 'cloud',
  cloudy: 'cloud',
  overcast: 'cloud',
  fog: 'fog',
  drizzle: 'rain',
  rain: 'rain',
  'heavy-rain': 'rain',
  thunderstorm: 'thunder',
  sleet: 'snow',
  snow: 'snow',
  wind: 'wind',
  unknown: 'info',
};

export function iconNameFor(code: IconCode): IconName {
  return ICON_FOR_CODE[code] ?? 'cloud';
}
