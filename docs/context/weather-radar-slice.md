---
last_updated: 2026-11-13
status: active
description: Slice generalities for the weather app — purpose, boundaries, entry points, flows, conventions, dependencies and accepted gaps.
tags: [slice, generality, weather, android, angular]
version: 1.0
related:
- project
- weather-data-sources
- weather-endpoints
- weather-stack
- weather-radar-debt
---

# Weather Radar — Slice Generalities

## What this slice is

`apps/weather-radar/` is a **read-only weather screen** for Necochea, Argentina. It displays
current conditions, a 24-hour strip and 7 day rows, all rendered from one validated JSON
document; the phone holds no database, no account and no server. The producer and server
scripts that feed it belong to the `weather-data` slice; this slice consumes their output.

The form is: **one document is the state**. The screen derives every label — values, freshness
badge, offline wording — from `WeatherSnapshot` plus the local receipt time; there is no second
source to reconcile.

## Boundaries

**In scope**

- `src/app/app.ts` — the single screen, its styles, and the two base-URL constants.
- `src/app/weather/` — contract types, validator, freshness state machine, providers, icons,
  formatting, bundled fixture.
- `src/main.ts`, `src/app/icons.ts`, `app.json`, `metro.config.js`, `tsconfig.json`,
  `vitest.config.mts`.
- `apps/weather-radar/README.md` — app-local commands and doc pointers.

**Out of scope — belongs elsewhere**

- The producer, static server, AccuWeather seam and Android launcher (`scripts/`): the
  **weather-data** Slices row, documented in [weather-data-sources](weather-data-sources.md) and
  [weather-endpoints](weather-endpoints.md).
- The `WeatherSnapshot` contract itself: `docs/api/openapi.weather-snapshot.yaml` (a frozen
  artifact, not app code). See [weather-data-sources](weather-data-sources.md).
- Endpoint justification and the read-only standing contract: [weather-endpoints](weather-endpoints.md).
- Stack lineage and framework alternatives: [weather-stack](weather-stack.md).
- Host SDK/emulator installation and launch-race archaeology: [android-toolchain](android-toolchain.md).
- The static audit of the re-signed APK: `docs/security-audits/`.
- Documentation rules and the debt register: [project](../project.md),
  [weather-radar-debt](weather-radar-debt.md).

## Entry points

| Reader's question | Start at |
|---|---|
| What does the screen render? | `apps/weather-radar/src/app/app.ts` |
| How is data loaded and validated? | `apps/weather-radar/src/app/weather/snapshot-provider.ts` |
| How is freshness decided? | `apps/weather-radar/src/app/weather/snapshot-cache.ts` |
| How do I run or test it? | `apps/weather-radar/README.md`, then [project](../project.md#commands) |
| How do I get real data? | [pc-pull-runbook](../protocols/pc-pull-runbook.md) |
| What is the data contract? | `docs/api/openapi.weather-snapshot.yaml` |

## How it works

1. **Boot.** `App` constructs both providers. `paintFixtureThenRefresh()` paints the bundled
   fixture in the same microtask turn, so a cold offline launch is never blank.
2. **Optional pull.** If a base URL resolved from `PULL_BASE_URL` / `DEV_HTTP_BASE_URL` is
   non-empty, one conditional `GET` of `/weather/necochea/v1/latest.json` runs once, on cold
   start. Redirects are refused and the request times out after 8 s.
3. **Validate, then accept.** The response body passes `validateSnapshot` before it can replace
   the stored document. `shouldAcceptIncoming` orders documents by the producer's `fetchedAt`
   and refuses error documents; an older or duplicate document never overwrites a newer one.
4. **Render.** `evaluateSnapshot` derives `loading | fresh | stale | expired | error` from the
   document's `expiresAt`, its `fetchedAt`, and the local receipt time (7 day local purge). A
   60 s interval only advances the age label; it does not refetch.
5. **Fail soft.** Any transport, parse or schema failure keeps the last-known-good document in
   memory; with no document at all, an error state renders. The fixture stays labelled
   "Datos de ejemplo · sin conexión".

State ownership is deliberately narrow: the screen owns the `stored` signal and the failed
flag; the cache functions are pure and take `nowMs`; providers own only transport.

## Conventions of this slice

- **GET only** — no body, cookies, `Authorization`, device id or user-data query parameter.
- **Two constants, one origin** — setting both `PULL_BASE_URL` and `DEV_HTTP_BASE_URL` throws at
  startup rather than silently preferring one.
- **Validate before use** — a document is never rendered or written before the contract passes.
- **No persistence in this version** — the cache is in memory on purpose; a cold start falls
  back to the fixture.
- **Lowercase native element names are load-bearing** — an uppercase name is read as an unknown
  Angular component and commits as an empty view.
- **Values live next to their only consumer** — the palette and spacing constants are in
  `app.ts`, not a shared tokens module.
- **Honest labels** — the UI says "Datos de ejemplo", "Actualizado hace …", or a stale/expired
  badge; it never presents fixture data as live.

## Dependencies

**Upstream (this slice needs)**

- Expo SDK 58 / React Native 0.88 / ng-native 0.22.2 at runtime; Node ≥ 22.18 for scripts and
  tests.
- A reachable snapshot host only when a base URL is configured; otherwise nothing.
- Open-Meteo for the producer (keyless, attribution CC BY 4.0).

**Downstream (what breaks if this changes)**

- `docs/api/openapi.weather-snapshot.yaml` is the contract both sides compile against; a
  breaking change needs a MAJOR bump plus an ADR.
- The runbook's curl checks and the producer's ETag depend on the snapshot path and id shape.
- The docs' Slices table and Common Lookups route readers into this slice.

## Known gaps & accepted debt

Documented, not hidden. Each item has an id in [weather-radar-debt](weather-radar-debt.md).

- **No on-device persistence** — last-known-good dies with the process (TD-02).
- **Cold-start-only revalidation** — no resume hook, no pull-to-refresh (TD-03).
- **`If-None-Match` is wired but not reached in practice** — first paint holds the fixture, so
  no pull-sourced snapshot id exists to revalidate (TD-01).
- **No scheduler** — the producer runs by hand or from the operator's cron (TD-10).
- **LAN cleartext pull unverified** — only the `adb reverse` loopback path was measured (TD-04).
- **iOS unverified** — declared in `app.json`, never built or run (TD-07).
- **AccuWeather remains a disabled seam** — blocked by a measured 403 (TD-05).
- **`npm audit` reports 3 moderate findings** in Expo's transitive tree (TD-09).
