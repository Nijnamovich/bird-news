import { cleanup, render, screen, settle } from '@ng-native/testing';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from './app.ts';
import {
  APP_LIFECYCLE,
  SNAPSHOT_PULL_PROVIDER,
  SNAPSHOT_STORE,
} from './weather/app-dependencies.ts';
import type { AppLifecycle } from './weather/app-lifecycle.ts';
import fixture from './weather/fixtures/necochea.snapshot.json';
import type { StoredSnapshot } from './weather/snapshot-cache.ts';
import {
  HttpPullSnapshotProvider,
  type FetchLike,
} from './weather/snapshot-provider.ts';
import { MemorySnapshotStore } from './weather/snapshot-store.ts';
import type { WeatherSnapshot } from './weather/weather-snapshot.types.ts';

const BASE_URL = 'http://localhost:8080';
const SNAPSHOT_ID = 'b'.repeat(64);
const FIXTURE_BANNER = 'Datos de ejemplo · sin conexión';

afterEach(() => {
  cleanup();
});

/** A schema-valid pull document derived from the bundled fixture. */
function pullDoc(options: { temperature?: number; fetchedAtMs?: number } = {}): WeatherSnapshot {
  const fetchedAtMs = options.fetchedAtMs ?? Date.now() - 5 * 60_000;
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

interface FakeCall {
  url: string;
  init?: RequestInit;
}

function fakeFetch(
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>,
): { fetchImpl: FetchLike; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return respond(url, init);
    },
  };
}

function pullProvider(fetchImpl: FetchLike): HttpPullSnapshotProvider {
  return new HttpPullSnapshotProvider({
    baseUrl: BASE_URL,
    allowInsecureHttp: true,
    fetchImpl,
  });
}

class RecordingStore extends MemorySnapshotStore {
  readonly writes: StoredSnapshot[] = [];

  override write(value: StoredSnapshot): void {
    this.writes.push(value);
    super.write(value);
  }
}

class FakeLifecycle implements AppLifecycle {
  private readonly listeners = new Set<() => void>();

  onForeground(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emitActive(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

function headersOf(call: FakeCall): Record<string, string> {
  return call.init?.headers as Record<string, string>;
}

/**
 * Hermetic component test: the bundled fixture only. `PULL_BASE_URL` is the
 * empty string, so the screen makes no network call.
 */
describe('App', () => {
  test('should render the fixture screen with 24 hour cards and 7 day rows', async () => {
    const result = await render(App);
    try {
      // The location paints from the fallback before the fixture resolves; the
      // temperature waits for it.
      expect(screen.getByText('Necochea')).toBeTruthy();
      // The current temperature also appears in hour cards, so match all.
      expect((await screen.findAllByText('19°', undefined, { timeout: 1000 })).length).toBeGreaterThan(0);

      expect(screen.getByText('Próximas horas')).toBeTruthy();
      expect(screen.getByText('Próximos 7 días')).toBeTruthy();

      expect(screen.getAllByTestId('day-row')).toHaveLength(7);
      expect(screen.getAllByTestId('hour-card')).toHaveLength(24);
    } finally {
      result.unmount();
    }
  });

  test('should paint the fixture on a first run and omit If-None-Match', async () => {
    const store = new RecordingStore();
    const { fetchImpl, calls } = fakeFetch(() => Response.json(pullDoc({ temperature: 27 })));

    const result = await render(App, {
      providers: [
        { provide: SNAPSHOT_STORE, useValue: store },
        { provide: SNAPSHOT_PULL_PROVIDER, useValue: pullProvider(fetchImpl) },
      ],
    });
    try {
      await settle();

      expect(calls).toHaveLength(1);
      expect(headersOf(calls[0])).toEqual({ Accept: 'application/json' });
      expect(calls[0].url).toBe(`${BASE_URL}/weather/necochea/v1/latest.json`);
      expect(calls[0].url).not.toContain('?');
      expect(calls[0].init?.redirect).toBe('error');

      // The accepted pull document is persisted; the fixture that painted first
      // is not.
      expect(store.writes).toHaveLength(1);
      expect(store.read()?.doc.snapshotId).toBe(SNAPSHOT_ID);
      expect(store.read()?.doc.current?.temperature).toBe(27);
    } finally {
      result.unmount();
    }
  });

  test('should hydrate a persisted snapshot and revalidate it with exactly one conditional GET', async () => {
    const persisted: StoredSnapshot = {
      doc: pullDoc({ temperature: 27 }),
      receivedAtLocalMs: Date.now() - 60_000,
    };
    const store = new RecordingStore(persisted);
    const { fetchImpl, calls } = fakeFetch(() => new Response(null, { status: 304 }));

    const result = await render(App, {
      providers: [
        { provide: SNAPSHOT_STORE, useValue: store },
        { provide: SNAPSHOT_PULL_PROVIDER, useValue: pullProvider(fetchImpl) },
      ],
    });
    try {
      // Hydration happens in the constructor, before the first commit: the
      // persisted temperature is already the first paint.
      expect(screen.getByText('27°')).toBeTruthy();
      expect(screen.queryByText(FIXTURE_BANNER)).toBeNull();

      await settle();

      expect(calls).toHaveLength(1);
      expect(headersOf(calls[0])).toEqual({
        Accept: 'application/json',
        'If-None-Match': `"${SNAPSHOT_ID}"`,
      });
      expect(calls[0].url).toBe(`${BASE_URL}/weather/necochea/v1/latest.json`);
      expect(calls[0].url).not.toContain('?');
      expect(calls[0].init?.redirect).toBe('error');

      // The persisted bytes paint; the demo banner is gone.
      expect(screen.getByText('27°')).toBeTruthy();
      expect(screen.queryByText(FIXTURE_BANNER)).toBeNull();

      // The 304 reset the local receipt time and wrote it back; no follow-up
      // request was issued (still exactly one call).
      expect(store.writes).toHaveLength(1);
      expect(store.writes[0].receivedAtLocalMs).toBeGreaterThan(persisted.receivedAtLocalMs);
      expect(store.writes[0].doc.snapshotId).toBe(SNAPSHOT_ID);
      expect(calls).toHaveLength(1);
    } finally {
      result.unmount();
    }
  });

  test('should not revalidate on resume while the document is fresh', async () => {
    const persisted: StoredSnapshot = {
      doc: pullDoc({ temperature: 27 }),
      receivedAtLocalMs: Date.now() - 60_000,
    };
    const store = new RecordingStore(persisted);
    const lifecycle = new FakeLifecycle();
    const { fetchImpl, calls } = fakeFetch(() => new Response(null, { status: 304 }));

    const result = await render(App, {
      providers: [
        { provide: SNAPSHOT_STORE, useValue: store },
        { provide: SNAPSHOT_PULL_PROVIDER, useValue: pullProvider(fetchImpl) },
        { provide: APP_LIFECYCLE, useValue: lifecycle },
      ],
    });
    try {
      await settle();
      expect(calls).toHaveLength(1);

      // The 304 reset the receipt, so the document is fresh again: returning to
      // the foreground must produce zero requests.
      lifecycle.emitActive();
      await settle();
      expect(calls).toHaveLength(1);
      expect(lifecycle.listenerCount).toBe(1);
    } finally {
      result.unmount();
    }

    expect(lifecycle.listenerCount).toBe(0);
  });

  test('should re-anchor the clock on resume so a document that aged in background revalidates', async () => {
    const persisted: StoredSnapshot = {
      doc: pullDoc({ temperature: 27 }),
      receivedAtLocalMs: Date.now() - 60_000,
    };
    const store = new RecordingStore(persisted);
    const lifecycle = new FakeLifecycle();
    const { fetchImpl, calls } = fakeFetch(() => new Response(null, { status: 304 }));

    const result = await render(App, {
      providers: [
        { provide: SNAPSHOT_STORE, useValue: store },
        { provide: SNAPSHOT_PULL_PROVIDER, useValue: pullProvider(fetchImpl) },
        { provide: APP_LIFECYCLE, useValue: lifecycle },
      ],
    });
    try {
      await settle();
      expect(calls).toHaveLength(1);

      // The interval cannot tick while Android has the app backgrounded, so the
      // signal is still fresh when the app returns two hours later.
      const spy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 3_600_000);
      try {
        lifecycle.emitActive();
        await settle();
      } finally {
        spy.mockRestore();
      }

      expect(calls).toHaveLength(2);
    } finally {
      result.unmount();
    }
  });

  test('should revalidate on resume when stale, collapsing a burst into one request', async () => {
    const staleFetchedAtMs = Date.now() - 2 * 3_600_000;
    const staleDoc = pullDoc({ temperature: 27, fetchedAtMs: staleFetchedAtMs });
    const persisted: StoredSnapshot = {
      doc: staleDoc,
      receivedAtLocalMs: staleFetchedAtMs,
    };
    const store = new RecordingStore(persisted);
    const lifecycle = new FakeLifecycle();

    const gate: { release: ((response: Response) => void) | null } = { release: null };
    const pending = new Promise<Response>((resolve) => {
      gate.release = resolve;
    });
    let call = 0;
    const { fetchImpl, calls } = fakeFetch(() => {
      call += 1;
      // The cold-start answer is a duplicate, so the receipt stays stale.
      return call === 1 ? Response.json(staleDoc) : pending;
    });

    const result = await render(App, {
      providers: [
        { provide: SNAPSHOT_STORE, useValue: store },
        { provide: SNAPSHOT_PULL_PROVIDER, useValue: pullProvider(fetchImpl) },
        { provide: APP_LIFECYCLE, useValue: lifecycle },
      ],
    });
    try {
      await settle();
      // One cold-start GET; the duplicate leaves the receipt stale.
      expect(calls).toHaveLength(1);

      lifecycle.emitActive();
      await settle();
      expect(calls).toHaveLength(2);
      expect(headersOf(calls[1])['If-None-Match']).toBe(`"${SNAPSHOT_ID}"`);

      // A second `active` while the first resume request is in flight adds none.
      lifecycle.emitActive();
      await settle();
      expect(calls).toHaveLength(2);

      gate.release?.(Response.json(staleDoc));
      await settle();
      expect(calls).toHaveLength(2);
    } finally {
      gate.release?.(Response.json(staleDoc));
      result.unmount();
    }
  });
});
