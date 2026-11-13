---
last_updated: 2026-11-13
status: active
description: Entry point for bird-news — a read-only Necochea weather app, its snapshot contract, and the repository's original static security audit.
tags: [project, entry-point, weather, android, documentation]
version: 1.0
doc_language: en
---

# Project Entry Point — bird-news

## Overview

bird-news is a personal, defensive repository with two deliverables. The **weather app**
(`apps/weather-radar/`) is a read-only Android screen for Necochea, Argentina: current
conditions, the next 24 hours and the next 7 days, rendered from one JSON document. The
**security audit** (`docs/security-audits/`) is the repository's original output: a static
analysis of a re-signed "Weather & Radar" APK, kept as a one-page summary with its evidence in
git history.

The app ships with no backend, no database and no account. Its default state is the bundled
fixture and **zero network requests**; an optional HTTP pull reads a static snapshot served
from a home machine. Anti-goals: no public release, no redistribution of vendor data, no
premium/paywall bypass, no telemetry, no on-device scraping, no secrets in the repository.

## Technology Stack

- **App**: Angular Native (`@ng-native/*` **0.22.2**) on **Expo SDK 58** (`expo ~58.0.25`),
  **React Native 0.88.1** (New Architecture), **Angular 22**, **React 19.3.0**, TypeScript
  `~6.0.3`, Vitest 5. Node **≥ 22.18**.
- **ng-native is a community alpha**, not a first-party Angular, Google or Expo product; the
  app is experimental. The decision and its rejected alternatives are in
  [ADR-0001](adrs/adr-0001-stay-on-ng-native.md).
- **Target exercised**: Android (API 36 emulator, Expo Go 58.0.5). iOS is declared in
  `app.json` but has never been built or run here.
- **Data contract**: one `WeatherSnapshot` **v1.0.0** document (OpenAPI 3.1) at
  `docs/api/openapi.weather-snapshot.yaml`; no backend, no database, no auth, no secrets.
- **Architecture pattern**: provider-agnostic snapshot — two `SnapshotProvider`
  implementations (bundled fixture, optional HTTP pull) behind a pure freshness state machine.
- **Docs**: Markdown corpus using the onrails document model — this file, `docs/context/` for
  strategic docs, `docs/protocols/` for procedures, and a generated `docs/tag-index.md`.

## Slices

| Slice | Description | Keywords | Entry points | Primary agents |
|---|---|---|---|---|
| weather-app | Read-only Necochea screen: current conditions, 24 h strip, 7 day rows, freshness banner, offline states | angular, ng-native, expo, react-native, component, template, signal, fixture, banner, emulator, android, metro, vitest | `apps/weather-radar/` | coder, tester |
| weather-data | Snapshot contract, Open-Meteo producer, static ETag server, data-source strategy and tunnel seam | openapi, snapshot, schema, etag, 304, if-none-match, open-meteo, accuweather, 403, producer, serve, tunnel, pc-pull | `apps/weather-radar/scripts/`, `docs/api/` | coder, architect, reviewer |
| docs | Documentation corpus: entry point, strategic context, procedures, ADRs, tag index, debt register | frontmatter, status, hub, adr, tag-index, protocol, debt, slice, context-index | `docs/`, `docs/context/`, `docs/protocols/`, `docs/adrs/` | documenter, explorer |
| security-audits | Original static-audit deliverable: verdict, artifact and signing identity, top findings | apk, signing, dex, manifest, audit, wetteronline, resign, evidence | `docs/security-audits/` | reviewer, explorer |

## Commands

There is **no `package.json` at the repository root**. Every app command runs from
`apps/weather-radar/`.

| Command | Working directory | Purpose |
|---|---|---|
| `npm test` | `apps/weather-radar/` | Vitest, hermetic (Node, no emulator) |
| `npm run typecheck` | `apps/weather-radar/` | `node metro.config.js && ngc -p tsconfig.json --noEmit` |
| `npm start` | `apps/weather-radar/` | Metro bundler for Expo Go |
| `npm run android` | `apps/weather-radar/` | Freeze-proof launcher: waits for Metro, verifies the open, bounded retry |
| `npm run android:raw` | `apps/weather-radar/` | Legacy `expo start --android`, kept for reference |
| `npx expo export --platform android` | `apps/weather-radar/` | Hermes bundle proof; needs no device |
| `npm run weather:produce` | `apps/weather-radar/` | One Open-Meteo GET → validated, atomically written snapshot |
| `npm run weather:serve` | `apps/weather-radar/` | Serve `weather-data/` on :8080 with `ETag` / `304` |
| `node <onrails>/validate-consumer.js --root <repo>` | methodology checkout | Read-only docs-contract check; run after doc changes |

## Repository Structure

```
bird-news/
├── README.md                     human front door → this file
├── apps/weather-radar/           the app (Expo/ng-native package; no root workspace)
│   ├── src/app/                  the single screen, icons, weather/ modules
│   ├── scripts/                  producer, static server, AccuWeather seam, Android launcher
│   ├── weather-data/             generated snapshots (git-ignored)
│   └── README.md                 app-local commands and doc pointers
└── docs/
    ├── project.md                canonical entry point (this file)
    ├── tag-index.md              generated tag → document surface
    ├── api/                      frozen OpenAPI contract (artifact, never hand-edited in place)
    ├── context/                  strategic docs (slice map, sources, endpoints, stack, toolchain, debt)
    ├── protocols/                procedures run by hand (pc-pull runbook)
    ├── adrs/                     append-only decision records + hub
    └── security-audits/          original static-audit deliverable + hub
```

## Key Conventions

- **Read-only by construction**: only `GET`; no request body, cookies, `Authorization`,
  device identifier or user-identifying query parameter. Never contact the audit's forbidden
  hosts (`*.lambda-url.eu-central-1.on.aws/geovis`, `*.apm.*.cloud.es.io`, `tiles.*`).
- **Two base-URL constants, never both set**: `PULL_BASE_URL` (empty or `https://`) and
  `DEV_HTTP_BASE_URL` (empty or `http://`, DEV only). Setting both is a startup error.
- **No app command from the repository root** — there is no root package.
- **The contract is frozen at v1.0.0**: a breaking change requires a MAJOR schema bump plus an
  ADR; producers validate before writing, clients validate before rendering.
- **Docs are English** (`doc_language: en`), filenames lowercase kebab-case, and every
  documented claim carries a path or a measured command — never an invented fact.
- **Unverified claims are labelled**: "verified" means an on-device or command observation
  recorded in the docs; everything else says so.
- **Technical debt is registered**, not remembered: one stable `TD-nn` id per item in
  `docs/context/weather-radar-debt.md`.
- **Evidence over archaeology**: refactor history lives in git; `docs/` records what is true now.

## Domain Entities

- **WeatherSnapshot** — the single JSON document the app renders; versioned by `schemaVersion`.
- **SnapshotProvider** — a source with `load(knownSnapshotId?)`: `fixture` (bundled) or
  `pc-pull` (HTTP). `phone-scrape` and `push` exist only as `SourceId` union members.
- **Snapshot id / ETag** — `sha256('pc-pull|necochea-ar|<fetchedAt>')`; doubles as the
  `If-None-Match` validator and the server's `ETag`.
- **Freshness state** — `loading | fresh | stale | expired | error`, derived from the
  document's `timing` plus local receipt time.
- **Producer** — the Node script on a home machine that fetches upstream and writes the snapshot.
- **Slice** — a human-demarcated area of the repository; the routing unit of the Slices table.
- **ADR** — an append-only decision record under `docs/adrs/`.
- **TD item** — a registered technical-debt entry with an id, evidence pointer and next step.

## Context Index

- `docs/context/weather-radar-slice.md` — slice map: what the app is, its boundaries, entry
  points, flows, dependencies and accepted gaps.
- `docs/context/weather-data-sources.md` — the three data strategies, the measured
  AccuWeather 403, and why `pc-pull` is the production mode.
- `docs/context/weather-endpoints.md` — every network endpoint, whether the app calls it, and
  the read-only standing contract (absorbs the old `apps/weather-radar/ENDPOINTS.md`).
- `docs/context/weather-stack.md` — stack lineage, the ng-native option comparison, and what
  the 0.22.2 / SDK 58 upgrade changed.
- `docs/context/android-toolchain.md` — host toolchain install (no sudo), emulator setup, and
  both Expo Go launch-race root causes.
- `docs/context/weather-radar-debt.md` — the technical-debt register: open, accepted and
  closed items with evidence pointers.
- `docs/protocols/pc-pull-runbook.md` — produce → serve → `adb reverse` → live badge, then the
  named-tunnel upgrade.
- `docs/adrs/adr-index.md` — decision records: ng-native stack and `pc-pull` over scraping.
- `docs/tag-index.md` — generated tag → document surface.
- `docs/api/openapi.weather-snapshot.yaml` — the canonical `WeatherSnapshot` contract.
- `docs/security-audits/security-audits-index.md` — hub for the original audit deliverable.

## Common Lookups

- "the app shows `Datos de ejemplo · sin conexión`" → `docs/context/weather-data-sources.md#the-three-strategies`
- "`CLEARTEXT communication to <host> not permitted by network security policy`" → `docs/protocols/pc-pull-runbook.md#5-android-cleartext-caveat`
- "`npm run android` opens Expo Go but the screen stays blank" → `docs/context/android-toolchain.md#launch-races-blank-screen`
- "how does a restart keep the last snapshot / reach `304`?" → `docs/context/weather-radar-slice.md#how-it-works`
- "AccuWeather answers `HTTP 403` / `Access Denied`" → `docs/context/weather-data-sources.md#what-we-measured`
- "`npm audit` reports 3 moderate findings" → `docs/context/weather-radar-debt.md#accepted-wont-fix`
- "why did the repository stay on ng-native?" → `docs/adrs/adr-0001-stay-on-ng-native.md#solution`
