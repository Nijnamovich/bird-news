#!/usr/bin/env node
// Produce one WeatherSnapshot document from the live Open-Meteo free API.
//
// Usage (from apps/weather-radar/):
//   npm run weather:produce                 # open-meteo (default)
//   npm run weather:produce -- --source accuweather   # disabled seam, fails loudly
//
// Properties this script deliberately keeps:
//   - zero runtime dependencies (Node built-ins only);
//   - one unauthenticated GET per run, no retry loop;
//   - validate before writing: a document that fails the contract is never
//     written, so the served file is always schema-valid;
//   - atomic write: temp file in the same directory, then rename, so a reader
//     never sees a half-written snapshot.
//
// Open-Meteo returns real data with no key and requires attribution
// (CC BY 4.0, non-commercial); see the runbook at docs/protocols/pc-pull-runbook.md.

import { createHash } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATTRIBUTION, buildWeatherSnapshot } from './weather-normalize.mjs';
import { validateSnapshot } from '../src/app/weather/snapshot-validate.ts';

const TAG = '[weather:produce]';
const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const TARGET = join(APP_ROOT, 'weather-data', 'weather', 'necochea', 'v1', 'latest.json');
const TIMEOUT_MS = 25_000;

const OPEN_METEO_URL =
  'https://api.open-meteo.com/v1/forecast' +
  '?latitude=-38.5545&longitude=-58.7396' +
  '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,' +
  'precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,' +
  'wind_direction_10m,wind_gusts_10m' +
  '&hourly=temperature_2m,apparent_temperature,precipitation_probability,' +
  'precipitation,weather_code,wind_speed_10m,wind_gusts_10m,is_day' +
  '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,' +
  'precipitation_probability_max,sunrise,sunset,uv_index_max,wind_speed_10m_max' +
  '&timezone=America%2FArgentina%2FBuenos_Aires&forecast_days=7&wind_speed_unit=kmh';

class ProducerError extends Error {
  /**
   * @param {string} code One of the contract's SnapshotErrorCode values.
   * @param {string} message Human-readable diagnostics.
   */
  constructor(code, message) {
    super(message);
    this.name = 'ProducerError';
    this.code = code;
  }
}

function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

async function main() {
  const sourceId = parseArgs(process.argv.slice(2));

  // The source registry. open-meteo is the only implemented upstream; the
  // accuweather adapter is imported lazily so the default path never loads it.
  if (sourceId === 'accuweather') {
    const { descriptor, fetchRaw } = await import('./accuweather-adapter.mjs');
    console.error(
      `${TAG} source=${descriptor.id} enabled=${descriptor.enabled}: exercising the disabled seam only`,
    );
    // fetchRaw() performs the plain GET and always throws today: FETCH_BLOCKED
    // on the measured 403, NOT_IMPLEMENTED otherwise (HTML parsing is absent).
    await fetchRaw();
    throw new Error('unreachable: accuweather adapter returned data without a parser');
  }

  const payload = await fetchOpenMeteo();
  const now = new Date();
  const doc = buildWeatherSnapshot(payload, { now, hash: sha256Hex });

  const validation = validateSnapshot(doc);
  if (!validation.ok) {
    console.error(`${TAG} SCHEMA_INVALID: the built document failed validation; nothing written.`);
    for (const error of validation.errors) {
      console.error(`${TAG}   - ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  const json = `${JSON.stringify(doc, null, 2)}\n`;
  const bytes = Buffer.byteLength(json, 'utf8');
  await mkdir(dirname(TARGET), { recursive: true });

  // Temp file in the SAME directory, so rename() stays atomic on one filesystem.
  const tempPath = `${TARGET}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempPath, json, 'utf8');
    await rename(tempPath, TARGET);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }

  console.log(
    `${TAG} snapshotId=${doc.snapshotId} fetchedAt=${doc.timing.fetchedAt} ` +
      `bytes=${bytes} target=${relative(APP_ROOT, TARGET)} source=${ATTRIBUTION}`,
  );
}

async function fetchOpenMeteo() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(OPEN_METEO_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      // The producer is not the app: following a redirect here is acceptable.
      redirect: 'follow',
      signal: controller.signal,
    });

    if (response.status !== 200) {
      const retryAfter = response.headers.get('retry-after');
      const suffix = retryAfter === null ? '' : ` (Retry-After: ${retryAfter}s)`;
      throw new ProducerError(
        errorCodeForStatus(response.status),
        `Open-Meteo returned HTTP ${response.status}${suffix}`,
      );
    }

    try {
      return await response.json();
    } catch {
      throw new ProducerError('PARSE_ERROR', 'Open-Meteo response was not valid JSON');
    }
  } catch (error) {
    if (error instanceof ProducerError) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new ProducerError('UPSTREAM_UNAVAILABLE', `Open-Meteo request failed: ${detail}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Contract error codes for the producer log line. */
function errorCodeForStatus(status) {
  if (status === 403) {
    return 'FETCH_BLOCKED';
  }
  if (status === 429) {
    return 'RATE_LIMITED';
  }
  return 'HTTP_ERROR';
}

function parseArgs(argv) {
  let source = 'open-meteo';
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source') {
      const value = argv[index + 1];
      if (value === undefined) {
        fail('missing value for --source (expected "open-meteo" or "accuweather")');
      }
      source = value;
      index += 1;
    } else if (arg.startsWith('--source=')) {
      source = arg.slice('--source='.length);
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npm run weather:produce [-- --source open-meteo|accuweather]');
      process.exit(0);
    } else {
      fail(`unknown argument "${arg}"`);
    }
  }

  if (source !== 'open-meteo' && source !== 'accuweather') {
    fail(`unknown source "${source}" (expected "open-meteo" or "accuweather")`);
  }
  return source;
}

function fail(message) {
  console.error(`${TAG} ${message}`);
  process.exit(1);
}

main().catch((error) => {
  if (error instanceof ProducerError) {
    console.error(`${TAG} ${error.code}: ${error.message}`);
  } else if (error instanceof Error && typeof error.code === 'string') {
    // Errors thrown by the isolated adapter carry a contract-style code too.
    console.error(`${TAG} ${error.code}: ${error.message}`);
  } else {
    console.error(`${TAG} ${error instanceof Error ? error.message : String(error)}`);
  }
  process.exitCode = 1;
});
