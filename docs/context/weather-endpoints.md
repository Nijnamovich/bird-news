---
last_updated: 2026-11-13
status: active
description: Every network endpoint connected to the weather app, whether the app calls it, and the read-only standing contract that forbids the rest.
tags: [weather, endpoints, network, read-only, security, audit]
version: 1.0
related:
- project
- weather-radar-slice
- weather-data-sources
- weather-radar-debt
moved_from:
- apps/weather-radar/ENDPOINTS.md
---

# Weather App — Network Endpoints

## Problem

A read-only app earns trust by making its network surface auditable. Without one page that lists
every endpoint, whether it is called, and why, a reviewer cannot tell an intentional optional
pull from a forgotten vendor call — and the audit's forbidden hosts have no visible boundary.

## Solution

### The standing contract

> Read-only by construction: GET only, no request bodies, no cookies or `Authorization`, no
> device identifiers, no user-data query parameters, no telemetry.

Concretely, the app never:

- sends any HTTP verb other than `GET`;
- sends a request body, cookies, an `Authorization` header, or any custom identifying header;
- sends a device id, location, advertising id, or any user-identifying query parameter;
- touches any `*.lambda-url.eu-central-1.on.aws/geovis` host, any `*.apm.*.cloud.es.io` host, or
  any `/analytics` path.

At most `Accept: application/json` plus the conditional `If-None-Match` validator
(`"<snapshotId>"`); neither carries nor derives a device identifier.

### Endpoints

| Endpoint | Status | Called by the app? | Justification |
| --- | --- | --- | --- |
| *(none)* | — | **No** | Fixture-only mode: with both base-URL constants empty the app renders the bundled fixture and makes zero network calls. Not the shipped configuration any more — `PULL_BASE_URL` points at GitHub Pages. |
| `GET https://nijnamovich.github.io/bird-news/weather/necochea/v1/latest.json` | optional, read-only, unauthenticated; ETag/304 supported by the producer contract, not yet measured on Pages | **Yes** — the committed `PULL_BASE_URL`; one call on cold start, and on a return to the foreground only when the document is stale | The single snapshot document (`WeatherSnapshot` v1.0.0), served by GitHub Pages from a scheduled GitHub Actions producer. The client sends `If-None-Match: "<snapshotId>"` when it holds a pull-sourced document and keeps that document on `304`; no polling timer, no query string, redirects refused. |
| `https://www.accuweather.com/es/ar/necochea/2924/weather-forecast/2924` | **HTTP 403** on a plain GET (measured 2026-11-12: 436 B, `<TITLE>Access Denied</TITLE>`, no `__NEXT_DATA__`, no `application/ld+json`) | **No** | Producer-side source only, and currently disabled. A phone-side scrape is blocked, so `phone-scrape` is not implemented. If ever enabled from a producer host it would be personal/educational, once per 30 min at most, with attribution carried in every document. |
| `https://api.open-meteo.com/v1/forecast` | **HTTP 200**, keyless, ~10.8 kB JSON (verified 2026-11-13) | **No** — never by the app; only by `npm run weather:produce` (scheduled Actions run or local) | The implemented producer source. Attribution CC BY 4.0 is stored in every document and displayed on screen. |

### Removed endpoints

The previous WetterOnline radar clone and its endpoint inventory are **gone**. No
`radar.wo-cloud.com`, `api-app.wo-cloud.com`, `tiles.wo-cloud.com`, or
`api.wetteronline.de/webcam` host is referenced anywhere in `src/` any more. The forbidden hosts
listed in the standing contract are still never contacted.

### Where the single optional call lives

`src/app/weather/snapshot-provider.ts` (`HttpPullSnapshotProvider.load`) makes the optional GET.
`FileSnapshotStore` (composed in `src/main.ts`) hydrates the last pull document before the first
paint; `src/app/app.ts` revalidates it with its `snapshotId` and only swaps the document when
`shouldAcceptIncoming` accepts it. An empty or discarded store falls back to the bundled fixture.
The contract and its error semantics are in `docs/api/openapi.weather-snapshot.yaml`.

## When to use

Read this before adding any network call, changing the snapshot path, reviewing the app's
security posture, or answering "what does the phone actually contact?". It is the inventory a
reviewer cites; the audit's forbidden-host list is enforced here in prose.

## When not to use

Do not use it for the data-source strategy or the measured 403 narrative — that is
[weather-data-sources](weather-data-sources.md). Do not use it for the producer commands — that
is the [pc-pull runbook](../protocols/pc-pull-runbook.md). An endpoint added here without a
matching code path is documentation rot, not a plan.

## Examples

The states, spelled out:

- **Committed default** — `PULL_BASE_URL = 'https://nijnamovich.github.io/bird-news'`,
  `DEV_HTTP_BASE_URL = ''`: one conditional `GET` of the Pages snapshot on cold start, and the
  bundled fixture whenever it fails.
- **DEV on a USB device** — first empty `PULL_BASE_URL`, then set `DEV_HTTP_BASE_URL =
  'http://localhost:8080'` + `adb reverse tcp:8080 tcp:8080`: exactly one
  `GET http://localhost:8080/weather/necochea/v1/latest.json`, which never leaves the phone's
  loopback. Setting both constants is a startup error.
- **Fixture only (opt-out)** — empty both constants: **zero** requests; the endpoint table's first
  row is the whole network surface.

## Common mistakes

- **Listing the producer's upstream as an app endpoint.** Open-Meteo and AccuWeather are called
  by the producer script (scheduled GitHub Action or local run), never by the phone; the table's
  "Called by the app?" column is the guard.
- **Reintroducing a polling timer** "because the endpoint supports ETag": the contract is one
  conditional GET per cold start plus a stale-only foreground revalidation, and a fetch timer
  violates the 48/day ceiling.
- **Adding a query parameter for location or device** — the snapshot is location-fixed
  (`necochea`) and the request must stay parameter-free.
- **Assuming HTTPS makes a LAN `http://` pull acceptable in production** — production accepts
  `https://` only; the HTTP path exists solely behind the DEV constant.

## References

- [weather-data-sources](weather-data-sources.md) — strategy, measurements, failure semantics.
- [weather-radar-debt](weather-radar-debt.md) — TD-04 (LAN cleartext unverified), TD-05 (403 seam).
- [pc-pull runbook](../protocols/pc-pull-runbook.md) — the commands that use these endpoints.
- `docs/api/openapi.weather-snapshot.yaml` — the payload contract.
- `docs/security-audits/security-audits-index.md` — the audit that produced the forbidden hosts.
