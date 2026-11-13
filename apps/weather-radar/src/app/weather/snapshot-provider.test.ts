import { describe, expect, test } from 'vitest';
import fixture from './fixtures/necochea.snapshot.json';
import {
  HttpPullSnapshotProvider,
  SnapshotTransportError,
  type FetchLike,
} from './snapshot-provider.ts';

const BASE_URL = 'https://weather.example.invalid';

function fakeFetch(
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>,
): { fetchImpl: FetchLike; calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return respond(url, init);
    },
  };
}

describe('HttpPullSnapshotProvider', () => {
  test('should send a quoted If-None-Match and report not-modified on 304', async () => {
    const { fetchImpl, calls } = fakeFetch(() => new Response(null, { status: 304 }));
    const provider = new HttpPullSnapshotProvider({ baseUrl: BASE_URL, fetchImpl });

    const result = await provider.load('a'.repeat(64));

    expect(result).toEqual({ kind: 'not-modified' });
    expect(calls).toHaveLength(1);
    expect(calls[0].init?.headers).toMatchObject({
      Accept: 'application/json',
      'If-None-Match': `"${'a'.repeat(64)}"`,
    });
    expect(calls[0].init?.redirect).toBe('error');
  });

  test('should omit If-None-Match when no cached id is known', async () => {
    const { fetchImpl, calls } = fakeFetch(() => Response.json(fixture));
    const provider = new HttpPullSnapshotProvider({ baseUrl: BASE_URL, fetchImpl });

    await provider.load();

    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers['If-None-Match']).toBeUndefined();
  });

  test('should parse and validate a 200 document', async () => {
    const { fetchImpl } = fakeFetch(() => Response.json(fixture));
    const provider = new HttpPullSnapshotProvider({ baseUrl: BASE_URL, fetchImpl });

    const result = await provider.load();

    expect(result.kind).toBe('snapshot');
    if (result.kind === 'snapshot') {
      expect(result.doc.snapshotId).toBe(fixture.snapshotId);
    }
  });

  test('should surface 429 as RATE_LIMITED with Retry-After', async () => {
    const { fetchImpl } = fakeFetch(
      () => new Response('', { status: 429, headers: { 'retry-after': '17' } }),
    );
    const provider = new HttpPullSnapshotProvider({ baseUrl: BASE_URL, fetchImpl });

    await expect(provider.load()).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterSeconds: 17,
    });
  });

  test('should surface a 200 body that is not JSON as PARSE_ERROR', async () => {
    const { fetchImpl } = fakeFetch(() => new Response('not json', { status: 200 }));
    const provider = new HttpPullSnapshotProvider({ baseUrl: BASE_URL, fetchImpl });

    await expect(provider.load()).rejects.toMatchObject({ code: 'PARSE_ERROR' });
  });

  test('should surface valid JSON that fails the schema as SCHEMA_INVALID', async () => {
    const { fetchImpl } = fakeFetch(() => Response.json({ kind: 'WeatherSnapshot' }));
    const provider = new HttpPullSnapshotProvider({ baseUrl: BASE_URL, fetchImpl });

    await expect(provider.load()).rejects.toMatchObject({ code: 'SCHEMA_INVALID' });
  });

  test('should surface any other status as HTTP_ERROR', async () => {
    const { fetchImpl } = fakeFetch(() => new Response('', { status: 500 }));
    const provider = new HttpPullSnapshotProvider({ baseUrl: BASE_URL, fetchImpl });

    await expect(provider.load()).rejects.toMatchObject({ code: 'HTTP_ERROR' });
  });

  test('should surface a network failure as UPSTREAM_UNAVAILABLE', async () => {
    const { fetchImpl } = fakeFetch(() => {
      throw new Error('offline');
    });
    const provider = new HttpPullSnapshotProvider({ baseUrl: BASE_URL, fetchImpl });

    const result = provider.load();
    await expect(result).rejects.toBeInstanceOf(SnapshotTransportError);
    await expect(result).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
  });

  test('should strip trailing slashes from the base URL', async () => {
    const { fetchImpl, calls } = fakeFetch(() => Response.json(fixture));
    const provider = new HttpPullSnapshotProvider({
      baseUrl: `${BASE_URL}///`,
      fetchImpl,
    });

    await provider.load();

    expect(calls[0].url).toBe(`${BASE_URL}/weather/necochea/v1/latest.json`);
  });

  test('should preserve a project-site path prefix when composing the snapshot URL', async () => {
    const { fetchImpl, calls } = fakeFetch(() => Response.json(fixture));
    const provider = new HttpPullSnapshotProvider({
      baseUrl: 'https://nijnamovich.github.io/bird-news',
      fetchImpl,
    });

    await provider.load();

    expect(calls[0].url).toBe(
      'https://nijnamovich.github.io/bird-news/weather/necochea/v1/latest.json',
    );
  });

  test('should keep a project-site path prefix when it has a trailing slash', async () => {
    const { fetchImpl, calls } = fakeFetch(() => Response.json(fixture));
    const provider = new HttpPullSnapshotProvider({
      baseUrl: 'https://nijnamovich.github.io/bird-news/',
      fetchImpl,
    });

    await provider.load();

    expect(calls[0].url).toBe(
      'https://nijnamovich.github.io/bird-news/weather/necochea/v1/latest.json',
    );
  });

  test('should reject a non-https base URL', () => {
    expect(
      () =>
        new HttpPullSnapshotProvider({
          baseUrl: 'http://weather.example.invalid',
          fetchImpl: fakeFetch(() => Response.json(fixture)).fetchImpl,
        }),
    ).toThrow(/https:\/\//);
  });

  test('should reject a base URL carrying a query or fragment', () => {
    expect(
      () =>
        new HttpPullSnapshotProvider({
          baseUrl: `${BASE_URL}?token=1`,
          fetchImpl: fakeFetch(() => Response.json(fixture)).fetchImpl,
        }),
    ).toThrow(/query or fragment/);
    expect(
      () =>
        new HttpPullSnapshotProvider({
          baseUrl: `${BASE_URL}#x`,
          fetchImpl: fakeFetch(() => Response.json(fixture)).fetchImpl,
        }),
    ).toThrow(/query or fragment/);
  });

  test('should reject a plain-http base URL when allowInsecureHttp is absent', () => {
    expect(
      () =>
        new HttpPullSnapshotProvider({
          baseUrl: 'http://localhost:8080',
          fetchImpl: fakeFetch(() => Response.json(fixture)).fetchImpl,
        }),
    ).toThrow(/https:\/\//);
  });

  test('should accept a plain-http base URL when allowInsecureHttp is true', async () => {
    const { fetchImpl, calls } = fakeFetch(() => Response.json(fixture));
    const provider = new HttpPullSnapshotProvider({
      baseUrl: 'http://localhost:8080',
      allowInsecureHttp: true,
      fetchImpl,
    });

    await provider.load();

    expect(calls[0].url).toBe('http://localhost:8080/weather/necochea/v1/latest.json');
  });

  test('should still reject a query when allowInsecureHttp is true', () => {
    expect(
      () =>
        new HttpPullSnapshotProvider({
          baseUrl: 'http://localhost:8080?token=1',
          allowInsecureHttp: true,
          fetchImpl: fakeFetch(() => Response.json(fixture)).fetchImpl,
        }),
    ).toThrow(/query or fragment/);
  });
});
