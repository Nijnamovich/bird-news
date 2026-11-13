// AccuWeather adapter seam — DISABLED BY DEFAULT, and deliberately unable to
// produce a document.
//
// Measured 2026-11-12 from the authoring network: a plain GET to the URL below
// answered HTTP 403 (Akamai-style access denied, 436 B,
// `<TITLE>Access Denied</TITLE>`, zero `__NEXT_DATA__` and zero
// `application/ld+json`). The page is a JavaScript-rendered SPA, so even a 200
// would need a headless browser rather than a regex/DOM parser.
//
// Why this file exists at all:
//   - it keeps the swap seam honest and isolated instead of pretending the
//     vendor is usable today;
//   - the producer's source registry must NEVER select it while
//     `enabled: false`. `open-meteo` is the default and the only implemented
//     upstream. `--source accuweather` reaches this module on purpose and then
//     fails loudly.
//
// How to enable it later (one flag), only if the human's network is not blocked:
//   1. Verify a manual GET from that network returns HTTP 200 with real markup.
//   2. Flip `enabled` to true below.
//   3. Write the parser and a normalizer into the WeatherSnapshot shape, then
//      wire the registry in scripts/weather-produce.mjs to use it. Until that
//      parser exists, `fetchRaw()` still throws NOT_IMPLEMENTED even on a 200.
//   4. Keep `source.attribution` honest and re-check the vendor's terms.
//
// No HTML is parsed here, no data is invented, and no browser fingerprint is
// impersonated.

const URL_UNDER_TEST = 'https://www.accuweather.com/es/ar/necochea/2924/weather-forecast/2924';
const TIMEOUT_MS = 25_000;

export const descriptor = Object.freeze({
  id: 'accuweather',
  enabled: false,
  url: URL_UNDER_TEST,
});

/**
 * Perform the plain GET only. This never returns a usable document:
 *
 * - HTTP 403 throws `FETCH_BLOCKED` (the measured anti-bot denial);
 * - any other status throws `NOT_IMPLEMENTED`, stating that HTML parsing is
 *   deliberately absent.
 *
 * @returns {Promise<never>}
 */
export async function fetchRaw() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(URL_UNDER_TEST, {
      method: 'GET',
      headers: { Accept: 'text/html' },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (response.status === 403) {
      throw adapterError(
        'FETCH_BLOCKED',
        'AccuWeather answered HTTP 403 (anti-bot access denied; measured 2026-11-12: ' +
          '436 B, "<TITLE>Access Denied</TITLE>"). The adapter is disabled and nothing was parsed.',
      );
    }

    throw adapterError(
      'NOT_IMPLEMENTED',
      `AccuWeather answered HTTP ${response.status}, but HTML parsing is deliberately ` +
        'absent from this project: the page is a JavaScript-rendered SPA and the only ' +
        'measurement is the 403 above. Keep the adapter disabled (enabled: false) until ' +
        'a human verifies an unblocked network and a real parser exists.',
    );
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw adapterError('UPSTREAM_UNAVAILABLE', `AccuWeather request failed: ${detail}`);
  } finally {
    clearTimeout(timer);
  }
}

function adapterError(code, message) {
  const error = new Error(message);
  error.name = 'AccuWeatherAdapterError';
  error.code = code;
  return error;
}
