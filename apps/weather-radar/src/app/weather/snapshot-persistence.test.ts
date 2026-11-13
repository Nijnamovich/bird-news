import { describe, expect, test } from 'vitest';
import fixture from './fixtures/necochea.snapshot.json';
import {
  DEFAULT_CACHE_CONFIG,
  evaluateSnapshot,
  type StoredSnapshot,
} from './snapshot-cache.ts';
import {
  PERSISTED_ENVELOPE_VERSION,
  decodeStoredSnapshot,
  encodeStoredSnapshot,
  isPersistableSnapshot,
} from './snapshot-persistence.ts';
import type { WeatherSnapshot } from './weather-snapshot.types.ts';

const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);
const SNAPSHOT_ID = 'b'.repeat(64);

/** A schema-valid pull document derived from the bundled fixture. */
function pullDoc(options: { temperature?: number; fetchedAtMs?: number } = {}): WeatherSnapshot {
  const fetchedAtMs = options.fetchedAtMs ?? NOW - 5 * 60_000;
  const doc = structuredClone(fixture) as unknown as WeatherSnapshot;
  doc.snapshotId = SNAPSHOT_ID;
  doc.source = {
    ...doc.source,
    id: 'pc-pull',
    producer: 'pc',
    attribution: 'Open-Meteo (CC BY 4.0)',
    licenseNote: 'CC BY 4.0',
  };
  doc.timing = {
    ...doc.timing,
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    observedAt: new Date(fetchedAtMs - 60_000).toISOString(),
    issuedAt: new Date(fetchedAtMs - 120_000).toISOString(),
    expiresAt: new Date(fetchedAtMs + 6 * 3_600_000).toISOString(),
  };
  if (options.temperature !== undefined && doc.current !== null) {
    doc.current = { ...doc.current, temperature: options.temperature };
  }
  return doc;
}

function stored(doc: WeatherSnapshot, receivedAtLocalMs = NOW): StoredSnapshot {
  return { doc, receivedAtLocalMs };
}

describe('snapshot persistence', () => {
  test('should keep only pull-sourced successful documents', () => {
    expect(isPersistableSnapshot(pullDoc())).toBe(true);
    expect(isPersistableSnapshot(fixture as unknown as WeatherSnapshot)).toBe(false);
  });

  test('should round-trip the document and its local receipt time', () => {
    const value = stored(pullDoc({ temperature: 27 }), NOW - 90_000);

    const raw = encodeStoredSnapshot(value);
    expect(raw).not.toBeNull();

    const decoded = decodeStoredSnapshot(raw, NOW);
    expect(decoded).not.toBeNull();
    expect(decoded?.doc.snapshotId).toBe(SNAPSHOT_ID);
    expect(decoded?.doc.current?.temperature).toBe(27);
    expect(decoded?.receivedAtLocalMs).toBe(NOW - 90_000);
  });

  test('should refuse to encode the bundled fixture', () => {
    expect(encodeStoredSnapshot(stored(fixture as unknown as WeatherSnapshot))).toBeNull();
  });

  test('should discard malformed JSON', () => {
    expect(decodeStoredSnapshot('{not json', NOW)).toBeNull();
  });

  test('should discard a foreign envelope version', () => {
    const raw = JSON.stringify({
      envelopeVersion: PERSISTED_ENVELOPE_VERSION + 1,
      receivedAtLocalMs: NOW,
      doc: pullDoc(),
    });
    expect(decodeStoredSnapshot(raw, NOW)).toBeNull();
  });

  test('should discard a missing or non-finite local receipt time', () => {
    const missing = JSON.stringify({ envelopeVersion: PERSISTED_ENVELOPE_VERSION, doc: pullDoc() });
    expect(decodeStoredSnapshot(missing, NOW)).toBeNull();

    const notFinite = JSON.stringify({
      envelopeVersion: PERSISTED_ENVELOPE_VERSION,
      receivedAtLocalMs: null,
      doc: pullDoc(),
    });
    expect(decodeStoredSnapshot(notFinite, NOW)).toBeNull();
  });

  test('should discard a document that fails schema validation', () => {
    const broken = structuredClone(pullDoc()) as unknown as Record<string, unknown>;
    broken.schemaVersion = '2.0.0';
    const raw = JSON.stringify({
      envelopeVersion: PERSISTED_ENVELOPE_VERSION,
      receivedAtLocalMs: NOW,
      doc: broken,
    });
    expect(decodeStoredSnapshot(raw, NOW)).toBeNull();
  });

  test('should discard a fixture-sourced document even when the envelope is intact', () => {
    const raw = JSON.stringify({
      envelopeVersion: PERSISTED_ENVELOPE_VERSION,
      receivedAtLocalMs: NOW,
      doc: fixture,
    });
    expect(decodeStoredSnapshot(raw, NOW)).toBeNull();
  });

  test('should discard a document older than the local purge window', () => {
    const purgeMs = DEFAULT_CACHE_CONFIG.purgeAfterLocalSeconds * 1000;
    const value = stored(pullDoc(), NOW - purgeMs - 1);
    const raw = encodeStoredSnapshot(value);

    expect(decodeStoredSnapshot(raw, NOW)).toBeNull();
  });

  test('should keep a document when the clock moved backwards and clamp its age to zero', () => {
    const value = stored(pullDoc({ fetchedAtMs: NOW + 30_000 }), NOW + 60_000);
    const raw = encodeStoredSnapshot(value);

    const decoded = decodeStoredSnapshot(raw, NOW);
    expect(decoded).not.toBeNull();

    const freshness = evaluateSnapshot(NOW, decoded);
    expect(freshness.ageSeconds).toBe(0);
    expect(freshness.state).toBe('fresh');
  });
});
