import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import fixture from './fixtures/necochea.snapshot.json';
import { validateSnapshot } from './snapshot-validate.ts';
import type { WeatherSnapshot } from './weather-snapshot.types.ts';

function draft(): WeatherSnapshot {
  return structuredClone(fixture) as unknown as WeatherSnapshot;
}

describe('validateSnapshot', () => {
  test('should accept the bundled fixture when it carries the full contract', () => {
    const result = validateSnapshot(fixture);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hourly).toHaveLength(24);
      expect(result.value.daily).toHaveLength(7);
    }
  });

  test('should accept a newer minor version when the schema major is supported', () => {
    const value = draft();
    value.schemaVersion = '1.4.2';

    expect(validateSnapshot(value).ok).toBe(true);
  });

  test('should reject a snapshot when the schema major is unknown', () => {
    const value = draft();
    value.schemaVersion = '2.0.0';

    const result = validateSnapshot(value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('schemaVersion');
    }
  });

  test('should reject a snapshot when hourly has 25 entries', () => {
    const value = draft();
    value.hourly!.push(structuredClone(value.hourly![23]));
    value.hourly![24].time = '2026-11-13T12:00:00-03:00';

    const result = validateSnapshot(value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('hourly: expected exactly 24');
    }
  });

  test('should reject a snapshot when daily has 6 entries', () => {
    const value = draft();
    value.daily!.pop();

    const result = validateSnapshot(value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('daily: expected exactly 7');
    }
  });

  test('should reject a snapshot when a unit differs from the contract', () => {
    const value = draft();
    (value.units as unknown as Record<string, string>).temperature = 'fahrenheit';

    const result = validateSnapshot(value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('units.temperature');
    }
  });

  test('should reject a snapshot when an error status still carries current conditions', () => {
    const value = draft();
    value.status = {
      ok: false,
      error: { code: 'HTTP_ERROR', message: 'boom', retryAfterSeconds: null },
    };

    const result = validateSnapshot(value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('current: must be null');
      expect(result.errors.join(' ')).toContain('hourly: must be null');
      expect(result.errors.join(' ')).toContain('daily: must be null');
    }
  });

  test('should reject a day when tempMin exceeds tempMax', () => {
    const value = draft();
    value.daily![0].tempMin = 99;

    const result = validateSnapshot(value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('tempMin: must not exceed tempMax');
    }
  });

  test('should reject daily dates when they are not consecutive', () => {
    const value = draft();
    value.daily![3].date = '2026-11-20';

    const result = validateSnapshot(value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('dates must be consecutive');
    }
  });

  test('should reject hourly times when the gap is 3599 seconds', () => {
    const value = draft();
    // Keep the required local offset; only the gap is under test.
    value.hourly![5].time = '2026-11-12T16:59:59-03:00';

    const result = validateSnapshot(value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('expected a 3600s gap');
    }
  });

  test('should reject a snapshot when expiresAt is not after fetchedAt', () => {
    const value = draft();
    value.timing.expiresAt = value.timing.fetchedAt;

    const result = validateSnapshot(value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('expiresAt: must be after fetchedAt');
    }
  });

  test('should reject a snapshot when ttl is below the one-minute floor', () => {
    const value = draft();
    value.timing.ttlSeconds = 59;

    const result = validateSnapshot(value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('ttlSeconds: must be at least 60');
    }
  });

  test('should reject a timing instant that uses a numeric offset instead of Z', () => {
    const value = draft();
    value.timing.fetchedAt = '2026-11-12T15:00:00+02:00';

    const result = validateSnapshot(value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('timing.fetchedAt: expected a UTC');
    }
  });

  test('should reject an hourly time that ends in Z instead of an offset', () => {
    const value = draft();
    value.hourly![0].time = '2026-11-12T12:00:00Z';

    const result = validateSnapshot(value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('hourly[0].time: expected a local');
    }
  });

  test('should reject an hourly time that is not aligned to the top of the hour', () => {
    const value = draft();
    value.hourly![0].time = '2026-11-12T12:30:00-03:00';

    const result = validateSnapshot(value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('top of the hour');
    }
  });

  test('should reject a redacted snapshotId', () => {
    const value = draft();
    value.snapshotId = 'redacted';

    const result = validateSnapshot(value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('snapshotId');
    }
  });

  test('should reject a successful status that also carries an error', () => {
    const value = draft();
    value.status = {
      ok: true,
      error: { code: 'HTTP_ERROR', message: 'boom', retryAfterSeconds: null },
    } as unknown as WeatherSnapshot['status'];

    const result = validateSnapshot(value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('status.error: must be absent');
    }
  });

  test('should reject humidity outside 0-100', () => {
    const value = draft();
    value.current!.humidity = 101;

    const result = validateSnapshot(value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('current.humidity');
    }
  });

  test('should reject a non-integer ttlSeconds', () => {
    const value = draft();
    value.timing.ttlSeconds = 1800.5;

    const result = validateSnapshot(value);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('timing.ttlSeconds: expected an integer');
    }
  });

  test('should have a fixture snapshotId matching the producer hash', () => {
    const expected = createHash('sha256')
      .update(`${fixture.source.id}|${fixture.location.id}|${fixture.timing.fetchedAt}`)
      .digest('hex');

    expect(fixture.snapshotId).toBe(expected);
  });

  test('should not throw when given garbage input', () => {
    const inputs: unknown[] = [
      null,
      undefined,
      42,
      'not a snapshot',
      [],
      [{}],
      {},
      { current: null },
      { schemaVersion: '0.9.0', kind: 'WeatherSnapshot' },
      new Date(),
      () => undefined,
    ];

    for (const input of inputs) {
      expect(() => validateSnapshot(input)).not.toThrow();
      expect(validateSnapshot(input).ok).toBe(false);
    }
  });
});
