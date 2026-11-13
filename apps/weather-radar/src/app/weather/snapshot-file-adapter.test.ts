import { describe, expect, test } from 'vitest';
import fixture from './fixtures/necochea.snapshot.json';
import {
  DEFAULT_CACHE_CONFIG,
  type StoredSnapshot,
} from './snapshot-cache.ts';
import {
  FileSnapshotStore,
  type SnapshotFileHandle,
} from './snapshot-file-adapter.ts';
import { encodeStoredSnapshot } from './snapshot-persistence.ts';
import type { WeatherSnapshot } from './weather-snapshot.types.ts';

const SNAPSHOT_ID = 'c'.repeat(64);

function pullDoc(fetchedAtMs = Date.now() - 5 * 60_000): WeatherSnapshot {
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
  return doc;
}

class FakeFile implements SnapshotFileHandle {
  exists = false;
  content = '';
  deletes = 0;
  creates = 0;
  throwOnRead = false;
  throwOnWrite = false;

  textSync(): string {
    if (this.throwOnRead) {
      throw new Error('read failed');
    }
    return this.content;
  }

  create(): void {
    this.creates += 1;
    this.exists = true;
  }

  writeSync(content: string): void {
    if (this.throwOnWrite) {
      throw new Error('write failed');
    }
    this.content = content;
    this.exists = true;
  }

  delete(): void {
    this.deletes += 1;
    this.exists = false;
    this.content = '';
  }
}

function rawEnvelope(stored: StoredSnapshot): string {
  const raw = encodeStoredSnapshot(stored);
  if (raw === null) {
    throw new Error('test document was not persistable');
  }
  return raw;
}

describe('FileSnapshotStore', () => {
  test('should return null for a missing file without deleting anything', () => {
    const file = new FakeFile();
    const store = new FileSnapshotStore(file);

    expect(store.read()).toBeNull();
    expect(file.deletes).toBe(0);
  });

  test('should read a valid envelope', () => {
    const file = new FakeFile();
    file.exists = true;
    file.content = rawEnvelope({ doc: pullDoc(), receivedAtLocalMs: Date.now() - 60_000 });
    const store = new FileSnapshotStore(file);

    const stored = store.read();
    expect(stored?.doc.snapshotId).toBe(SNAPSHOT_ID);
    expect(file.deletes).toBe(0);
  });

  test('should discard and delete a corrupt file', () => {
    const file = new FakeFile();
    file.exists = true;
    file.content = '{broken';
    const store = new FileSnapshotStore(file);

    expect(store.read()).toBeNull();
    expect(file.deletes).toBe(1);
    expect(file.exists).toBe(false);
  });

  test('should discard and delete a file past the purge window', () => {
    const file = new FakeFile();
    file.exists = true;
    const old = Date.now() - (DEFAULT_CACHE_CONFIG.purgeAfterLocalSeconds + 60) * 1000;
    file.content = rawEnvelope({ doc: pullDoc(old), receivedAtLocalMs: old });
    const store = new FileSnapshotStore(file);

    expect(store.read()).toBeNull();
    expect(file.deletes).toBe(1);
  });

  test('should swallow a read failure and try to discard the file', () => {
    const file = new FakeFile();
    file.exists = true;
    file.throwOnRead = true;
    const store = new FileSnapshotStore(file);

    expect(store.read()).toBeNull();
    expect(file.deletes).toBe(1);
  });

  test('should create a missing file before writing', () => {
    const file = new FakeFile();
    const store = new FileSnapshotStore(file);

    store.write({ doc: pullDoc(), receivedAtLocalMs: Date.now() });

    expect(file.creates).toBe(1);
    expect(file.content).not.toBe('');
    expect(new FileSnapshotStore(file).read()?.doc.snapshotId).toBe(SNAPSHOT_ID);
  });

  test('should reuse an existing file without calling create again', () => {
    const file = new FakeFile();
    file.exists = true;
    const store = new FileSnapshotStore(file);

    store.write({ doc: pullDoc(), receivedAtLocalMs: Date.now() });

    expect(file.creates).toBe(0);
    expect(file.deletes).toBe(0);
  });

  test('should ignore a non-persistable document without erasing the stored one', () => {
    const file = new FakeFile();
    file.exists = true;
    const original = rawEnvelope({ doc: pullDoc(), receivedAtLocalMs: Date.now() });
    file.content = original;
    const store = new FileSnapshotStore(file);

    store.write({
      doc: fixture as unknown as WeatherSnapshot,
      receivedAtLocalMs: Date.now(),
    });

    expect(file.content).toBe(original);
    expect(file.deletes).toBe(0);
  });

  test('should swallow a write failure', () => {
    const file = new FakeFile();
    file.throwOnWrite = true;
    const store = new FileSnapshotStore(file);

    expect(() =>
      store.write({ doc: pullDoc(), receivedAtLocalMs: Date.now() }),
    ).not.toThrow();
  });
});
