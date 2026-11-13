# Endpoints

This app is a **read-only** weather screen. This file documents every network
endpoint related to it, whether it is called, and why.

## Standing contract

> Read-only by construction: GET only, no request bodies, no cookies or
> `Authorization`, no device identifiers, no user-data query parameters, no
> telemetry.

Concretely, the app never:

- sends any HTTP verb other than `GET`;
- sends a request body, cookies, an `Authorization` header, or any custom
  identifying header;
- sends a device id, location, advertising id, or any user-identifying query
  parameter;
- touches any `*.lambda-url.eu-central-1.on.aws/geovis` host, any
  `*.apm.*.cloud.es.io` host, or any `/analytics` path.

At most `Accept: application/json` plus the conditional `If-None-Match`
validator (`"<snapshotId>"`); neither carries nor derives a device identifier.

## Endpoints

| Endpoint | Status | Called by the app? | Justification |
| --- | --- | --- | --- |
| *(none)* | — | **No** | With `PULL_BASE_URL` empty (the default), the app renders the bundled fixture and makes zero network calls. |
| `GET https://<stable-host>/weather/necochea/v1/latest.json` | optional, read-only, unauthenticated; ETag/304 supported | **Only when `PULL_BASE_URL` is set** | The single snapshot document (`WeatherSnapshot` v1.0.0). Fired on cold start only in this version. The client sends `If-None-Match: "<snapshotId>"` for the document it holds and keeps that document on `304`; no polling timer, no query string, redirects refused. |
| `https://www.accuweather.com/es/ar/necochea/2924/weather-forecast/2924` | **HTTP 403** on a plain GET (measured 2026-11-12: 436 B, `<TITLE>Access Denied</TITLE>`, no `__NEXT_DATA__`, no `application/ld+json`) | **No** | Producer-side source only. A phone-side scrape is blocked, so `phone-scrape` is not implemented. If used on a PC it is personal/educational, once per 30 min at most, with attribution carried in every document. |

## Removed endpoints

The previous WetterOnline radar clone and its endpoint inventory are **gone**.
No `radar.wo-cloud.com`, `api-app.wo-cloud.com`, `tiles.wo-cloud.com`, or
`api.wetteronline.de/webcam` host is referenced anywhere in `src/` any more.
The forbidden hosts listed in the standing contract are still never contacted.

## Where the single call lives

`src/app/weather/snapshot-provider.ts` (`HttpPullSnapshotProvider.load`) makes
the optional GET. `src/app/app.ts` triggers it once, after the bundled fixture
has painted, and only swaps the document when `shouldAcceptIncoming` accepts it.
The contract and its error semantics are in
`docs/api/openapi.weather-snapshot.yaml`.
