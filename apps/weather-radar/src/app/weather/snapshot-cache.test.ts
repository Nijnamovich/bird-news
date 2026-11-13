import { describe, expect, test } from 'vitest';
import fixture from './fixtures/necochea.snapshot.json';
import {
  DEFAULT_CACHE_CONFIG,
  errorState,
  evaluateSnapshot,
  shouldAcceptIncoming,
  type StoredSnapshot,
} from './snapshot-cache.ts';
import type { WeatherSnapshot } from './weather-snapshot.types.ts';

const BASE_MS = Date.parse('2026-11-12T15:00:00.000Z');

function doc(fetchedAtMs: number, expiresOffsetMs = 3_600_000): WeatherSnapshot {
  const value = structuredClone(fixture) as unknown as WeatherSnapshot;
  value.timing.fetchedAt = new Date(fetchedAtMs).toISOString();
  value.timing.expiresAt = new Date(fetchedAtMs + expiresOffsetMs).toISOString();
  return value;
}

function stored(document: WeatherSnapshot, receivedAtLocalMs: number): StoredSnapshot {
  return { doc: document, receivedAtLocalMs };
}

function errorDocument(fetchedAtMs: number): WeatherSnapshot {
  const value = doc(fetchedAtMs);
  value.current = null;
  value.hourly = null;
  value.daily = null;
  value.status = {
    ok: false,
    error: { code: 'UPSTREAM_UNAVAILABLE', message: 'offline', retryAfterSeconds: null },
  };
  return value;
}

describe('evaluateSnapshot', () => {
  test('should report fresh without revalidation when age is exactly the ttl', () => {
    const result = evaluateSnapshot(
      BASE_MS + 1800_000,
      stored(doc(BASE_MS), BASE_MS),
    );

    expect(result.state).toBe('fresh');
    expect(result.document).not.toBeNull();
    expect(result.ageSeconds).toBe(1800);
    expect(result.shouldRevalidate).toBe(false);
    expect(result.badge).toBe('updated');
  });

  test('should report fresh with revalidation when age is exactly staleAfter', () => {
    const result = evaluateSnapshot(
      BASE_MS + DEFAULT_CACHE_CONFIG.staleAfterSeconds * 1000,
      stored(doc(BASE_MS, 7_200_000), BASE_MS),
    );

    expect(result.state).toBe('fresh');
    expect(result.document).not.toBeNull();
    expect(result.ageSeconds).toBe(DEFAULT_CACHE_CONFIG.staleAfterSeconds);
    expect(result.shouldRevalidate).toBe(true);
    expect(result.badge).toBe('updated');
  });

  test('should not report expired when now is exactly expiresAt', () => {
    const result = evaluateSnapshot(
      BASE_MS + 60_000,
      stored(doc(BASE_MS, 60_000), BASE_MS),
    );

    expect(result.state).toBe('fresh');
    expect(result.document).not.toBeNull();
    expect(result.badge).toBe('updated');
  });

  test('should report expired one millisecond after expiresAt even when the age is within staleAfter', () => {
    const result = evaluateSnapshot(
      BASE_MS + 60_001,
      stored(doc(BASE_MS, 60_000), BASE_MS),
    );

    expect(result.ageSeconds).toBeLessThanOrEqual(DEFAULT_CACHE_CONFIG.staleAfterSeconds);
    expect(result.state).toBe('expired');
    expect(result.document).not.toBeNull();
    expect(result.badge).toBe('expired');
    expect(result.shouldRevalidate).toBe(true);
  });

  test('should report fresh with revalidation when age is inside the stale window', () => {
    const result = evaluateSnapshot(
      BASE_MS + 2400_000,
      stored(doc(BASE_MS, 7_200_000), BASE_MS),
    );

    expect(result.state).toBe('fresh');
    expect(result.shouldRevalidate).toBe(true);
    expect(result.badge).toBe('updated');
  });

  test('should report stale when age is past staleAfter but before expiry', () => {
    const result = evaluateSnapshot(
      BASE_MS + 5000_000,
      stored(doc(BASE_MS, 7_200_000), BASE_MS),
    );

    expect(result.state).toBe('stale');
    expect(result.document).not.toBeNull();
    expect(result.badge).toBe('stale');
  });

  test('should report expired when now is past expiresAt', () => {
    const result = evaluateSnapshot(
      BASE_MS + 8000_000,
      stored(doc(BASE_MS), BASE_MS),
    );

    expect(result.state).toBe('expired');
    expect(result.badge).toBe('expired');
    expect(result.shouldRevalidate).toBe(true);
  });

  test('should purge to loading when local age is exactly purgeAfterLocalSeconds', () => {
    const result = evaluateSnapshot(
      DEFAULT_CACHE_CONFIG.purgeAfterLocalSeconds * 1000,
      stored(doc(BASE_MS), 0),
    );

    expect(result.state).toBe('loading');
    expect(result.document).toBeNull();
    expect(result.badge).toBe('none');
  });

  test('should purge to loading when local age exceeds purgeAfterLocalSeconds', () => {
    const result = evaluateSnapshot(
      DEFAULT_CACHE_CONFIG.purgeAfterLocalSeconds * 1000 + 1,
      stored(doc(BASE_MS), 0),
    );

    expect(result.state).toBe('loading');
    expect(result.document).toBeNull();
    expect(result.badge).toBe('none');
  });

  test('should treat a producer error document as error and never as last-known-good', () => {
    const result = evaluateSnapshot(
      BASE_MS + 60_000,
      stored(errorDocument(BASE_MS), BASE_MS),
    );

    expect(result.state).toBe('error');
    expect(result.document).toBeNull();
    expect(result.badge).toBe('error');
  });

  test('should report loading when the cache is empty', () => {
    const result = evaluateSnapshot(BASE_MS, null);

    expect(result.state).toBe('loading');
    expect(result.document).toBeNull();
    expect(result.shouldRevalidate).toBe(true);
  });

  test('should use local receipt age when the producer clock is ahead', () => {
    const result = evaluateSnapshot(
      BASE_MS + 10_000,
      stored(doc(BASE_MS + 3_600_000), BASE_MS),
    );

    expect(result.state).toBe('fresh');
    expect(result.ageSeconds).toBe(10);
  });

  test('should expose error state when the caller has no document and a load failed', () => {
    expect(errorState()).toEqual({
      state: 'error',
      document: null,
      ageSeconds: 0,
      shouldRevalidate: true,
      badge: 'error',
    });
  });
});

describe('shouldAcceptIncoming', () => {
  test('should accept as new when nothing is stored', () => {
    expect(shouldAcceptIncoming(null, doc(BASE_MS))).toEqual({
      accept: true,
      reason: 'new',
    });
  });

  test('should accept as newer when the incoming fetchedAt is later', () => {
    const current = stored(doc(BASE_MS), BASE_MS);

    expect(shouldAcceptIncoming(current, doc(BASE_MS + 60_000))).toEqual({
      accept: true,
      reason: 'newer',
    });
  });

  test('should reject as duplicate when fetchedAt is unchanged', () => {
    const current = stored(doc(BASE_MS), BASE_MS);

    expect(shouldAcceptIncoming(current, doc(BASE_MS))).toEqual({
      accept: false,
      reason: 'duplicate',
    });
  });

  test('should reject as older when the incoming fetchedAt is earlier', () => {
    const current = stored(doc(BASE_MS), BASE_MS);

    expect(shouldAcceptIncoming(current, doc(BASE_MS - 60_000))).toEqual({
      accept: false,
      reason: 'older',
    });
  });

  test('should reject an incoming error document when the cache holds good data', () => {
    const current = stored(doc(BASE_MS), BASE_MS);

    expect(shouldAcceptIncoming(current, errorDocument(BASE_MS + 60_000))).toEqual({
      accept: false,
      reason: 'rejected-error',
    });
  });

  test('should accept as new when the stored document is itself an error', () => {
    const current = stored(errorDocument(BASE_MS), BASE_MS);

    expect(shouldAcceptIncoming(current, doc(BASE_MS + 60_000))).toEqual({
      accept: true,
      reason: 'new',
    });
  });
});
