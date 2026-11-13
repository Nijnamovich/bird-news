/**
 * Base-URL policy for the optional pull producer.
 *
 * Two constants feed this module in `app.ts`: the production origin
 * (`PULL_BASE_URL`, https-only) and the DEV-only plain-HTTP producer
 * (`DEV_HTTP_BASE_URL`). The rules are pure so they can be tested without
 * constructing the component or touching the network.
 *
 * Production semantics are unchanged from the original inline check: the
 * empty string or an `https://` origin, with no query and no fragment.
 * `http://` is accepted only when `allowHttp` is explicitly true, which the
 * app derives from `DEV_HTTP_BASE_URL` alone.
 */

export type PullBaseUrlResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export interface PullBaseUrlOptions {
  /** DEV only: accept a plain-HTTP origin (adb reverse / LAN producer). */
  allowHttp: boolean;
}

/**
 * Validate one base URL and normalise a trailing slash away.
 *
 * Lives next to `resolvePullBaseUrl` rather than in the component so the
 * policy has exactly one implementation and one test surface.
 */
export function checkedPullBaseUrl(
  value: string,
  options: PullBaseUrlOptions,
): PullBaseUrlResult {
  if (typeof value !== 'string') {
    return { ok: false, error: 'base URL must be a string' };
  }
  if (/\s/.test(value)) {
    return { ok: false, error: `base URL must not contain whitespace (got "${value}")` };
  }
  if (value.includes('?') || value.includes('#')) {
    return {
      ok: false,
      error: `base URL must not contain a query or fragment (got "${value}")`,
    };
  }
  if (value === '') {
    return { ok: true, value: '' };
  }

  const isHttps = value.startsWith('https://');
  const isHttp = value.startsWith('http://');
  if (!isHttps && !isHttp) {
    return {
      ok: false,
      error: `base URL must be empty or start with https:// (got "${value}")`,
    };
  }
  if (isHttp && !options.allowHttp) {
    return {
      ok: false,
      error: `http:// is only allowed from DEV_HTTP_BASE_URL (got "${value}")`,
    };
  }

  const scheme = isHttps ? 'https://' : 'http://';
  const rest = value.slice(scheme.length);
  return { ok: true, value: rest === '' ? value : `${scheme}${rest.replace(/\/+$/, '')}` };
}

/**
 * Pick the origin the provider will use.
 *
 * Exactly one of the two constants may be set: setting both would silently
 * choose one and hide a stale dev value, so it is an error instead. The
 * production origin wins whenever it is set.
 */
export function resolvePullBaseUrl(input: {
  production: string;
  dev: string;
}): PullBaseUrlResult {
  if (input.production !== '' && input.dev !== '') {
    return {
      ok: false,
      error:
        'PULL_BASE_URL and DEV_HTTP_BASE_URL are both set; set only one ' +
        '(the production tunnel or the dev HTTP producer)',
    };
  }
  if (input.production !== '') {
    return checkedPullBaseUrl(input.production, { allowHttp: false });
  }
  if (input.dev !== '') {
    return checkedPullBaseUrl(input.dev, { allowHttp: true });
  }
  return { ok: true, value: '' };
}
