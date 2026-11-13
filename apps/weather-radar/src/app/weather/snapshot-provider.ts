/**
 * Snapshot providers.
 *
 * The app is read-only by construction: only GET, no request body, no
 * cookies, no authorization header, no device identifier, and no user-data
 * query parameter.
 *
 * On-device scraping is deliberately NOT implemented. The audited vendor
 * endpoint answers a plain GET with HTTP 403 (verified 2026-11-12), so a
 * `phone-scrape` producer would need the phone to impersonate the vendor app
 * — outside this demo's read-only contract. The phone producer remains in the
 * type union as a future, out-of-scope producer.
 */

import {
  SNAPSHOT_SCHEMA_VERSION,
  WEATHER_UNITS,
  type SnapshotErrorCode,
  type SourceId,
  type WeatherSnapshot,
} from './weather-snapshot.types.ts';
import { validateSnapshot } from './snapshot-validate.ts';
import fixture from './fixtures/necochea.snapshot.json';

/**
 * What a provider resolves to. A conditional GET can report that the caller's
 * cached document is still current; that is not an error and carries no body.
 *
 * Both providers return this one shape so the screen never handles two.
 */
export type SnapshotLoadResult =
  | { kind: 'snapshot'; doc: WeatherSnapshot }
  | { kind: 'not-modified' };

export interface SnapshotProvider {
  readonly id: SourceId;
  load(knownSnapshotId?: string): Promise<SnapshotLoadResult>;
}

/** The narrow slice of `fetch` this provider uses; easy to fake in tests. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface HttpPullSnapshotProviderOptions {
  /** Tunnel or origin serving the companion producer, without a trailing slash. */
  baseUrl: string;
  /**
   * DEV only: permit a plain-HTTP origin (the local `npm run weather:serve`
   * producer reached through `adb reverse` or the LAN). Defaults to `false`,
   * which keeps the production https-only guard exactly as strict as before.
   * Even when true, only `http://`, `https://` or `''` are accepted.
   */
  allowInsecureHttp?: boolean;
  /** Injectable for tests; defaults to the platform fetch. */
  fetchImpl?: FetchLike;
  /** Abort a hung request. Defaults to 8000 ms. */
  timeoutMs?: number;
}

export const DEFAULT_PROVIDER_ID: SourceId = 'pc-pull';

const SNAPSHOT_PATH = '/weather/necochea/v1/latest.json';
const DEFAULT_TIMEOUT_MS = 8000;

export class SnapshotTransportError extends Error {
  readonly code: SnapshotErrorCode;
  readonly retryAfterSeconds: number | null;

  constructor(code: SnapshotErrorCode, message: string, retryAfterSeconds: number | null) {
    super(message);
    this.name = 'SnapshotTransportError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * The bundled fixture. It is local data, not a network source, so it never
 * rejects. If the fixture itself were broken, the provider returns a
 * schema-valid error document instead of throwing into the screen.
 */
export class FixtureSnapshotProvider implements SnapshotProvider {
  readonly id: SourceId = 'fixture';

  async load(): Promise<SnapshotLoadResult> {
    const result = validateSnapshot(fixture as unknown);
    if (result.ok) {
      return { kind: 'snapshot', doc: result.value };
    }
    return { kind: 'snapshot', doc: fixtureErrorSnapshot(result.errors) };
  }
}

export class HttpPullSnapshotProvider implements SnapshotProvider {
  readonly id: SourceId = DEFAULT_PROVIDER_ID;

  private readonly url: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: HttpPullSnapshotProviderOptions) {
    const baseUrl = options.baseUrl.replace(/\/+$/, '');
    const allowInsecureHttp = options.allowInsecureHttp === true;
    const isAllowed =
      baseUrl === '' ||
      baseUrl.startsWith('https://') ||
      (allowInsecureHttp && baseUrl.startsWith('http://'));
    if (!isAllowed) {
      throw new Error(
        `HttpPullSnapshotProvider: baseUrl must be empty or start with https://` +
          `${allowInsecureHttp ? ' (or http:// for DEV)' : ''} (got "${options.baseUrl}")`,
      );
    }
    if (baseUrl.includes('?') || baseUrl.includes('#')) {
      throw new Error(
        `HttpPullSnapshotProvider: baseUrl must not contain a query or fragment (got "${options.baseUrl}")`,
      );
    }
    this.url = `${baseUrl}${SNAPSHOT_PATH}`;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async load(knownSnapshotId?: string): Promise<SnapshotLoadResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (knownSnapshotId !== undefined) {
      // Strong validator: the document's `snapshotId`, quoted as an ETag.
      headers['If-None-Match'] = `"${knownSnapshotId}"`;
    }

    try {
      const response = await this.fetchImpl(this.url, {
        method: 'GET',
        headers,
        redirect: 'error',
        signal: controller.signal,
      });

      if (response.status === 304) {
        // Not modified: the caller keeps its cached document.
        return { kind: 'not-modified' };
      }

      if (response.status === 429) {
        throw new SnapshotTransportError(
          'RATE_LIMITED',
          'Upstream rate limit reached',
          parseRetryAfter(response),
        );
      }

      if (response.status !== 200) {
        throw new SnapshotTransportError(
          'HTTP_ERROR',
          `Upstream returned HTTP ${response.status}`,
          null,
        );
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new SnapshotTransportError(
          'PARSE_ERROR',
          'Upstream response was not valid JSON',
          null,
        );
      }

      const result = validateSnapshot(body);
      if (!result.ok) {
        throw new SnapshotTransportError(
          'SCHEMA_INVALID',
          `Snapshot failed validation: ${result.errors.join('; ')}`,
          null,
        );
      }
      return { kind: 'snapshot', doc: result.value };
    } catch (error) {
      if (error instanceof SnapshotTransportError) {
        throw error;
      }
      throw new SnapshotTransportError(
        'UPSTREAM_UNAVAILABLE',
        error instanceof Error ? error.message : 'Upstream request failed',
        null,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

function parseRetryAfter(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (header === null) {
    return null;
  }
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function fixtureErrorSnapshot(errors: string[]): WeatherSnapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    kind: 'WeatherSnapshot',
    snapshotId: '0'.repeat(64),
    source: {
      id: 'fixture',
      producer: 'fixture',
      attribution: 'Fixture',
      url: null,
      licenseNote: 'Bundled fixture',
    },
    timing: {
      fetchedAt: '1970-01-01T00:00:00.000Z',
      observedAt: '1970-01-01T00:00:00.000Z',
      issuedAt: '1970-01-01T00:00:00.000Z',
      expiresAt: '1970-01-01T00:01:00.000Z',
      ttlSeconds: 60,
      staleAfterSeconds: 60,
    },
    location: {
      id: 'unknown',
      name: 'Unknown',
      country: 'AR',
      lat: 0,
      lon: 0,
      timezone: 'UTC',
    },
    units: WEATHER_UNITS,
    current: null,
    hourly: null,
    daily: null,
    alerts: [],
    status: {
      ok: false,
      error: {
        code: 'SCHEMA_INVALID',
        message: `Bundled fixture failed validation: ${errors.join('; ')}`,
        retryAfterSeconds: null,
      },
    },
  };
}
