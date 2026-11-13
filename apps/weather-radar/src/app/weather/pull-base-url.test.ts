import { describe, expect, test } from 'vitest';
import { checkedPullBaseUrl, resolvePullBaseUrl } from './pull-base-url.ts';

const PRODUCTION = { allowHttp: false };
const DEV = { allowHttp: true };

describe('checkedPullBaseUrl', () => {
  test('should accept the empty string when no pull origin is configured', () => {
    expect(checkedPullBaseUrl('', PRODUCTION)).toEqual({ ok: true, value: '' });
    expect(checkedPullBaseUrl('', DEV)).toEqual({ ok: true, value: '' });
  });

  test('should accept an https origin when production mode is used', () => {
    expect(checkedPullBaseUrl('https://weather.example.invalid', PRODUCTION)).toEqual({
      ok: true,
      value: 'https://weather.example.invalid',
    });
  });

  test('should strip a trailing slash when the https origin has one', () => {
    expect(checkedPullBaseUrl('https://weather.example.invalid///', PRODUCTION)).toEqual({
      ok: true,
      value: 'https://weather.example.invalid',
    });
  });

  test('should reject http when dev HTTP is not allowed', () => {
    const result = checkedPullBaseUrl('http://localhost:8080', PRODUCTION);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/DEV_HTTP_BASE_URL/);
    }
  });

  test('should accept http://localhost:8080 when dev HTTP is allowed', () => {
    expect(checkedPullBaseUrl('http://localhost:8080', DEV)).toEqual({
      ok: true,
      value: 'http://localhost:8080',
    });
  });

  test('should reject a query when either mode is used', () => {
    for (const options of [PRODUCTION, DEV]) {
      expect(checkedPullBaseUrl('https://weather.example.invalid?token=1', options).ok).toBe(
        false,
      );
      expect(checkedPullBaseUrl('http://localhost:8080?token=1', options).ok).toBe(false);
    }
  });

  test('should reject a fragment when either mode is used', () => {
    for (const options of [PRODUCTION, DEV]) {
      expect(checkedPullBaseUrl('https://weather.example.invalid#top', options).ok).toBe(false);
      expect(checkedPullBaseUrl('http://localhost:8080#top', options).ok).toBe(false);
    }
  });

  test('should reject a scheme other than http(s) when a value is set', () => {
    expect(checkedPullBaseUrl('ftp://weather.example.invalid', PRODUCTION).ok).toBe(false);
    expect(checkedPullBaseUrl('ftp://weather.example.invalid', DEV).ok).toBe(false);
    expect(checkedPullBaseUrl('weather.example.invalid', PRODUCTION).ok).toBe(false);
  });

  test('should reject whitespace when a value contains it', () => {
    expect(checkedPullBaseUrl(' https://weather.example.invalid', PRODUCTION).ok).toBe(false);
  });
});

describe('resolvePullBaseUrl', () => {
  test('should return the empty string when neither constant is set', () => {
    expect(resolvePullBaseUrl({ production: '', dev: '' })).toEqual({ ok: true, value: '' });
  });

  test('should use the production origin when only production is set', () => {
    expect(
      resolvePullBaseUrl({ production: 'https://weather.example.invalid', dev: '' }),
    ).toEqual({ ok: true, value: 'https://weather.example.invalid' });
  });

  test('should use the dev origin when only dev is set', () => {
    expect(resolvePullBaseUrl({ production: '', dev: 'http://localhost:8080' })).toEqual({
      ok: true,
      value: 'http://localhost:8080',
    });
  });

  test('should reject the configuration when both constants are set', () => {
    const result = resolvePullBaseUrl({
      production: 'https://weather.example.invalid',
      dev: 'http://localhost:8080',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/set only one/);
    }
  });

  test('should reject a plain-http production origin when only production is set', () => {
    expect(
      resolvePullBaseUrl({ production: 'http://weather.example.invalid', dev: '' }).ok,
    ).toBe(false);
  });
});
