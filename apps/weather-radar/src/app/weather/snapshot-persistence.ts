/**
 * Persisted last-known-good envelope.
 *
 * Only a pull-sourced document whose `status.ok` is true is worth keeping: the
 * bundled fixture is always available locally, and an error document is never a
 * last-known-good value. The envelope adds the local receipt time, because the
 * freshness windows are anchored to when *this device* received the bytes.
 *
 * This module is pure: it takes the raw string (or null) and the current clock.
 * The file adapter in `snapshot-file-store.ts` owns the native I/O, so tests and
 * the screen never import a native module.
 */

import { validateSnapshot } from './snapshot-validate.ts';
import {
  DEFAULT_CACHE_CONFIG,
  type StoredSnapshot,
} from './snapshot-cache.ts';
import type { WeatherSnapshot } from './weather-snapshot.types.ts';

/** Bumped only when the envelope shape changes, never for the snapshot schema. */
export const PERSISTED_ENVELOPE_VERSION = 1;

interface PersistedEnvelope {
  envelopeVersion: number;
  receivedAtLocalMs: number;
  doc: unknown;
}

/** The one document class the store keeps across restarts. */
export function isPersistableSnapshot(doc: WeatherSnapshot): boolean {
  return doc.status.ok === true && doc.source.id === 'pc-pull';
}

/**
 * Serialise a stored document, or return null when it must not be persisted.
 * A non-persistable value is never written: the caller keeps rendering it in
 * memory, but a restart falls back to the fixture as before.
 */
export function encodeStoredSnapshot(stored: StoredSnapshot): string | null {
  if (!isPersistableSnapshot(stored.doc)) {
    return null;
  }
  const envelope: PersistedEnvelope = {
    envelopeVersion: PERSISTED_ENVELOPE_VERSION,
    receivedAtLocalMs: stored.receivedAtLocalMs,
    doc: stored.doc,
  };
  return JSON.stringify(envelope);
}

/**
 * Read an envelope back, discarding anything suspect instead of throwing.
 *
 * Returns null for: missing/empty input, malformed JSON, a foreign envelope
 * version, a missing receipt time, a document that fails `validateSnapshot`,
 * a document that is not a pull-sourced success, or a receipt older than the
 * local purge window. A clock moved *backwards* yields a non-positive age and
 * keeps the document (age clamps to zero downstream), never a crash.
 */
export function decodeStoredSnapshot(
  raw: string | null,
  nowMs: number,
  purgeAfterLocalSeconds: number = DEFAULT_CACHE_CONFIG.purgeAfterLocalSeconds,
): StoredSnapshot | null {
  if (raw === null || raw.length === 0) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const envelope = parsed as Partial<PersistedEnvelope>;
  if (envelope.envelopeVersion !== PERSISTED_ENVELOPE_VERSION) {
    return null;
  }
  if (
    typeof envelope.receivedAtLocalMs !== 'number' ||
    !Number.isFinite(envelope.receivedAtLocalMs)
  ) {
    return null;
  }

  const validation = validateSnapshot(envelope.doc);
  if (!validation.ok || !isPersistableSnapshot(validation.value)) {
    return null;
  }

  // Purging keys off local receipt only, as the in-memory policy does. A
  // negative age means the clock moved backwards; treat it as zero and keep.
  const localAgeMs = nowMs - envelope.receivedAtLocalMs;
  if (localAgeMs > 0 && localAgeMs >= purgeAfterLocalSeconds * 1000) {
    return null;
  }

  return {
    doc: validation.value,
    receivedAtLocalMs: envelope.receivedAtLocalMs,
  };
}
