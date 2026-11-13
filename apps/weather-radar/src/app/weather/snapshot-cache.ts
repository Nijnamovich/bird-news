/**
 * Pure freshness and last-known-good policy for a cached snapshot.
 *
 * The clock is injected (`nowMs`) so the rules are deterministic in tests. The
 * module knows nothing about storage: the caller keeps the in-memory value.
 *
 * Late responses are handled conservatively: an age is the larger of the age
 * implied by the producer's `fetchedAt` and the age implied by when this device
 * received the document, clamped at zero. A phone clock that jumps *forward*
 * therefore only makes data look older. A backward jump clamps the age to zero
 * and can make data look fresher, which is why the producer's `expiresAt` is
 * checked independently of the age.
 *
 * `CLOCK_SKEW` is a contract error code the producer may emit; this client
 * never emits it.
 */

import type { WeatherSnapshot } from './weather-snapshot.types.ts';

export type FreshnessState = 'loading' | 'fresh' | 'stale' | 'expired' | 'error';

export type FreshnessBadge = 'none' | 'updated' | 'stale' | 'expired' | 'error';

export interface StoredSnapshot {
  doc: WeatherSnapshot;
  receivedAtLocalMs: number;
}

export interface CacheConfig {
  ttlSeconds: number;
  staleAfterSeconds: number;
  purgeAfterLocalSeconds: number;
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  ttlSeconds: 1800,
  staleAfterSeconds: 3600,
  purgeAfterLocalSeconds: 604800,
};

export interface SnapshotEvaluation {
  state: FreshnessState;
  document: WeatherSnapshot | null;
  ageSeconds: number;
  shouldRevalidate: boolean;
  badge: FreshnessBadge;
}

export type AcceptReason = 'new' | 'newer' | 'duplicate' | 'older' | 'rejected-error';

export interface AcceptDecision {
  accept: boolean;
  reason: AcceptReason;
}

/**
 * The state to show when the caller has no document and its latest load failed.
 * Kept separate from `evaluateSnapshot` so that function stays purely about
 * stored data.
 */
export function errorState(): SnapshotEvaluation {
  return {
    state: 'error',
    document: null,
    ageSeconds: 0,
    shouldRevalidate: true,
    badge: 'error',
  };
}

export function evaluateSnapshot(
  nowMs: number,
  stored: StoredSnapshot | null,
  config: CacheConfig = DEFAULT_CACHE_CONFIG,
): SnapshotEvaluation {
  if (stored === null) {
    return {
      state: 'loading',
      document: null,
      ageSeconds: 0,
      shouldRevalidate: true,
      badge: 'none',
    };
  }

  const ageSeconds = snapshotAgeSeconds(nowMs, stored);

  // A producer error document is never a last-known-good value.
  if (stored.doc.status.ok !== true) {
    return {
      state: 'error',
      document: null,
      ageSeconds,
      shouldRevalidate: true,
      badge: 'error',
    };
  }

  // Purging keys off local receipt only: a wildly wrong producer clock must not
  // keep an ancient local copy alive (or delete a usable fresh one).
  const localAgeMs = nowMs - stored.receivedAtLocalMs;
  if (localAgeMs >= config.purgeAfterLocalSeconds * 1000) {
    return {
      state: 'loading',
      document: null,
      ageSeconds,
      shouldRevalidate: true,
      badge: 'none',
    };
  }

  // The producer's own expiry wins over the age windows: a document that is
  // past `expiresAt` is expired even when the derived age still looks fresh.
  const expiresMs = Date.parse(stored.doc.timing.expiresAt);
  if (Number.isFinite(expiresMs) && nowMs > expiresMs) {
    return {
      state: 'expired',
      document: stored.doc,
      ageSeconds,
      shouldRevalidate: true,
      badge: 'expired',
    };
  }

  if (ageSeconds <= config.ttlSeconds) {
    return {
      state: 'fresh',
      document: stored.doc,
      ageSeconds,
      shouldRevalidate: false,
      badge: 'updated',
    };
  }

  if (ageSeconds <= config.staleAfterSeconds) {
    // Fresh enough to render, but the caller should revalidate in the background.
    return {
      state: 'fresh',
      document: stored.doc,
      ageSeconds,
      shouldRevalidate: true,
      badge: 'updated',
    };
  }

  return {
    state: 'stale',
    document: stored.doc,
    ageSeconds,
    shouldRevalidate: true,
    badge: 'stale',
  };
}

/**
 * Decide whether an incoming document may replace the stored one.
 *
 * An error document never replaces a good last-known-good. Otherwise the
 * producer's `fetchedAt` is the ordering key; equal means duplicate.
 */
export function shouldAcceptIncoming(
  stored: StoredSnapshot | null,
  incoming: WeatherSnapshot,
): AcceptDecision {
  if (incoming.status.ok !== true) {
    return { accept: false, reason: 'rejected-error' };
  }

  if (stored === null || stored.doc.status.ok !== true) {
    return { accept: true, reason: 'new' };
  }

  const incomingMs = Date.parse(incoming.timing.fetchedAt);
  const storedMs = Date.parse(stored.doc.timing.fetchedAt);
  if (!Number.isFinite(incomingMs) || !Number.isFinite(storedMs)) {
    return { accept: true, reason: 'new' };
  }

  if (incomingMs > storedMs) {
    return { accept: true, reason: 'newer' };
  }
  if (incomingMs < storedMs) {
    return { accept: false, reason: 'older' };
  }
  return { accept: false, reason: 'duplicate' };
}

function snapshotAgeSeconds(nowMs: number, stored: StoredSnapshot): number {
  const fetchedMs = Date.parse(stored.doc.timing.fetchedAt);
  const candidates = [nowMs - stored.receivedAtLocalMs];
  if (Number.isFinite(fetchedMs)) {
    candidates.push(nowMs - fetchedMs);
  }
  return Math.max(0, Math.max(...candidates) / 1000);
}
