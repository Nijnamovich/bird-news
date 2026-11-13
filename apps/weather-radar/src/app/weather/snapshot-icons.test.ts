import { describe, expect, test } from 'vitest';
import { iconCodeFor, iconNameFor } from './snapshot-icons.ts';
import type { IconCode } from './weather-snapshot.types.ts';

describe('iconCodeFor', () => {
  test('should derive a day icon when a clear condition is daytime', () => {
    expect(iconCodeFor('clear', true)).toBe('clear-day');
  });

  test('should derive a night icon when a clear condition is nighttime', () => {
    expect(iconCodeFor('clear', false)).toBe('clear-night');
  });

  test('should derive a day icon when a partly-cloudy condition is daytime', () => {
    expect(iconCodeFor('partly-cloudy', true)).toBe('partly-cloudy-day');
  });

  test('should derive a night icon when a partly-cloudy condition is nighttime', () => {
    expect(iconCodeFor('partly-cloudy', false)).toBe('partly-cloudy-night');
  });

  test('should keep a single icon when the condition does not vary by day', () => {
    expect(iconCodeFor('rain', true)).toBe('rain');
    expect(iconCodeFor('rain', false)).toBe('rain');
  });

  test('should fall back to the unknown icon when the condition is unknown', () => {
    expect(iconCodeFor('unknown', true)).toBe('unknown');
  });
});

describe('iconNameFor', () => {
  const EXPECTED: ReadonlyArray<readonly [IconCode, string]> = [
    ['clear-day', 'sun'],
    ['clear-night', 'moon'],
    ['partly-cloudy-day', 'cloud'],
    ['partly-cloudy-night', 'cloud'],
    ['cloudy', 'cloud'],
    ['overcast', 'cloud'],
    ['fog', 'fog'],
    ['drizzle', 'rain'],
    ['rain', 'rain'],
    ['heavy-rain', 'rain'],
    ['thunderstorm', 'thunder'],
    ['sleet', 'snow'],
    ['snow', 'snow'],
    ['wind', 'wind'],
    ['unknown', 'info'],
  ];

  test.each(EXPECTED)('should map the contract icon %s to the local glyph %s', (code, glyph) => {
    expect(iconNameFor(code)).toBe(glyph);
  });
});
