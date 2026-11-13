#!/usr/bin/env node
// Dependency-free static server for the locally produced snapshot tree.
//
// It serves ONLY `apps/weather-radar/weather-data/` (produced by
// `npm run weather:produce`) so the phone can pull a faithful contract:
//   - GET and HEAD only (405 otherwise);
//   - `Content-Type: application/json; charset=utf-8`;
//   - `Cache-Control: max-age=300, must-revalidate`;
//   - `ETag: "<snapshotId>"`, answered with 304 when `If-None-Match` matches.
//
// A plain `python3 -m http.server` serves the same file but cannot answer 304
// or set Cache-Control, so it is only a fallback, not a contract test.
//
// Usage (from apps/weather-radar/):
//   npm run weather:serve            # PORT defaults to 8080
//   PORT=9090 npm run weather:serve

import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG = '[weather:serve]';
const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ROOT = join(APP_ROOT, 'weather-data');
const DEFAULT_PORT = 8080;
const SNAPSHOT_PATH = '/weather/necochea/v1/latest.json';
const CACHE_CONTROL = 'max-age=300, must-revalidate';
const CONTENT_TYPE = 'application/json; charset=utf-8';

const port = parsePort(process.env.PORT);

const server = createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error(`${TAG} request failed: ${error instanceof Error ? error.message : String(error)}`);
    if (!response.headersSent) {
      sendJson(response, 500, { error: 'internal_error', message: 'Unexpected server error.' });
    } else {
      response.end();
    }
  });
});

async function handle(request, response) {
  const method = request.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    sendJson(response, 405, {
      error: 'method_not_allowed',
      message: 'This producer is read-only: use GET or HEAD.',
    });
    return;
  }

  const pathname = safePathname(request.url);
  if (pathname === null) {
    sendJson(response, 400, { error: 'bad_request', message: 'Malformed request path.' });
    return;
  }

  const target = resolve(ROOT, pathname.replace(/^\/+/, ''));
  // Path-traversal guard: the resolved file must stay under the served root.
  if (target !== ROOT && !target.startsWith(`${ROOT}${sep}`)) {
    sendJson(response, 403, {
      error: 'forbidden',
      message: 'Only files under weather-data/ are served.',
    });
    return;
  }

  let fileStat;
  try {
    fileStat = await stat(target);
  } catch {
    sendMissing(response);
    return;
  }
  if (!fileStat.isFile()) {
    sendMissing(response);
    return;
  }

  const body = await readFile(target);
  let snapshotId = null;
  try {
    const parsed = JSON.parse(body.toString('utf8'));
    if (typeof parsed?.snapshotId === 'string' && /^[a-f0-9]{64}$/.test(parsed.snapshotId)) {
      snapshotId = parsed.snapshotId;
    }
  } catch {
    sendJson(response, 500, {
      error: 'invalid_document',
      message: `${pathname} is not valid JSON. Run \`npm run weather:produce\` to regenerate it.`,
    });
    return;
  }
  if (snapshotId === null) {
    sendJson(response, 500, {
      error: 'invalid_document',
      message: `${pathname} has no valid snapshotId. Run \`npm run weather:produce\` to regenerate it.`,
    });
    return;
  }

  const etag = `"${snapshotId}"`;
  response.setHeader('Cache-Control', CACHE_CONTROL);
  response.setHeader('ETag', etag);

  if (ifNoneMatchMatches(request.headers['if-none-match'], etag)) {
    response.statusCode = 304;
    response.end();
    return;
  }

  response.statusCode = 200;
  response.setHeader('Content-Type', CONTENT_TYPE);
  response.setHeader('Content-Length', String(body.byteLength));
  if (method === 'HEAD') {
    response.end();
    return;
  }
  response.end(body);
}

function safePathname(rawUrl) {
  try {
    const url = new URL(rawUrl ?? '/', 'http://localhost');
    const decoded = decodeURIComponent(url.pathname);
    if (decoded.includes('\0')) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function ifNoneMatchMatches(header, etag) {
  if (header === undefined) {
    return false;
  }
  const value = Array.isArray(header) ? header.join(',') : header;
  return value
    .split(',')
    .map((candidate) => candidate.trim())
    .some((candidate) => candidate === '*' || candidate === etag);
}

function sendMissing(response) {
  sendJson(response, 404, {
    error: 'not_found',
    message:
      'No snapshot at that path. Run `npm run weather:produce` to generate ' +
      'weather-data/weather/necochea/v1/latest.json.',
  });
}

function sendJson(response, status, payload) {
  const body = Buffer.from(`${JSON.stringify(payload)}\n`, 'utf8');
  response.statusCode = status;
  response.setHeader('Content-Type', CONTENT_TYPE);
  response.setHeader('Content-Length', String(body.byteLength));
  response.end(body);
}

function parsePort(raw) {
  if (raw === undefined || raw === '') {
    return DEFAULT_PORT;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    console.error(`${TAG} invalid PORT "${raw}" (expected an integer 1-65535)`);
    process.exit(1);
  }
  return parsed;
}

function lanAddress() {
  const candidates = [];
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      const isIpv4 = address.family === 'IPv4' || address.family === 4;
      if (isIpv4 && !address.internal) {
        candidates.push(address.address);
      }
    }
  }
  return candidates.find((candidate) => candidate.startsWith('192.168.')) ?? candidates[0] ?? null;
}

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`${TAG} port ${port} is already in use; stop the other server or set PORT.`);
  } else {
    console.error(`${TAG} ${error.message}`);
  }
  process.exit(1);
});

server.listen(port, '0.0.0.0', () => {
  const lan = lanAddress();
  console.log(`${TAG} serving ${ROOT}`);
  console.log(`${TAG} http://localhost:${port}${SNAPSHOT_PATH}`);
  console.log(`${TAG} adb reverse tcp:${port} tcp:${port}`);
  if (lan !== null) {
    console.log(`${TAG} LAN: http://${lan}:${port}${SNAPSHOT_PATH}`);
  } else {
    console.log(`${TAG} LAN: no non-internal IPv4 address found; use adb reverse instead.`);
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`${TAG} received ${signal}; shutting down.`);
    server.close(() => process.exit(0));
  });
}
