---
last_updated: 2026-11-13
status: active
description: How the weather data gets updated — the three producer strategies, the measured AccuWeather 403, the failure semantics and the pc-pull decision.
tags: [weather, data-sources, providers, pc-pull, scrape, freshness, open-meteo]
version: 1.0
related:
- project
- weather-radar-slice
- weather-endpoints
- weather-radar-debt
- pc-pull-runbook
- release-and-update-runbook
moved_from:
- docs/weather/data-sources.md
---

# How the Weather Data Gets Updated

## Problem

The app needs current conditions, a 24-hour forecast and a 7-day forecast for Necochea,
Argentina, on an Android phone, with no backend of its own and no vendor SDK. That leaves three
places the data can come from: the phone fetches a public weather page directly, a scheduled job
fetches and normalises the data and the phone pulls the finished snapshot from a static host, or
the job pushes the snapshot to the phone. The question is which becomes the default, what breaks
when it fails, and what the phone shows while it is broken.

## Solution

### The three strategies

| | On-device scrape | Scheduled producer + phone pulls | Producer pushes |
| --- | --- | --- | --- |
| **What runs where** | A parser inside the app fetches the vendor page and extracts values on the phone | A producer runs in a **GitHub Actions** job on a 30-minute cron, fetches upstream, normalises it and writes one JSON snapshot; **GitHub Pages** serves it; the phone does a `GET` of that snapshot | The same producer, but it initiates delivery to the phone |
| **Transport** | HTTPS `GET` from the phone to the vendor | HTTPS `GET` from the phone to GitHub Pages (stable public URL); HTTPS `GET` from the runner to the vendor | Push channel (remote push, or a message queue the phone subscribes to) |
| **Auth / trust** | None available; the vendor treats the phone as a bot | None on the phone side; the Pages site is public. The producer holds no vendor credentials either | Requires a push service, device tokens and a sender identity — a credential and a registration step |
| **Data quality** | Whatever the page renders; fragile against markup and anti-bot changes | Normalised once, validated against the contract, identical for every consumer | Same normalisation as pull, but delivery timing is opaque |
| **Freshness** | Only as fresh as the last successful on-device fetch | 30-minute Actions cron (best-effort); the phone revalidates on cold start in this version | Producer decides; the phone has no say |
| **Phone-only?** | Yes | No — needs GitHub's scheduler and Pages; no personal machine has to be awake | No — needs the producer and a push service |
| **Failure modes** | 403/429, bot challenge, JS-only page, regex/DOM drift, battery/Doze | Scheduled run delayed or skipped, Pages deploy failure, half-written file, stale edge cache | All pull failures plus push registration, token expiry, delivery delay |
| **Verdict** | **Experimental / not implemented** | **Recommended production mode** | **Future** |

The contract is the same for all three: one `SnapshotProvider` interface,
`{ id: SourceId; load(knownSnapshotId?: string): Promise<SnapshotLoadResult> }`, where
`SnapshotLoadResult` is `{ kind: 'snapshot'; doc } | { kind: 'not-modified' }` (a `304` keeps
the cached document and refreshes its local receipt time). **Exactly two implementations ship:**

- `FixtureSnapshotProvider` — `id: 'fixture'`, the bundled
  `src/app/weather/fixtures/necochea.snapshot.json`. Local data; it never touches the network.
- `HttpPullSnapshotProvider` — `id: 'pc-pull'`, one conditional `GET` of
  `<base>/weather/necochea/v1/latest.json`.

`phone-scrape` and `push` exist only as members of the `SourceId` type union. Nothing constructs
them, and there is no implementation to construct.

There is **no single constant that switches provider**. The screen constructs the fixture
provider and the pull provider; the switch is the resolved base URL:

- **empty** → fixture only, **zero network requests**;
- **set to an `https://` origin** → the persisted last-known-good paints on later starts
  (the fixture on a true first run), then one conditional `GET` on cold start.

`PULL_BASE_URL` is committed as the GitHub Pages origin, so the shipped app performs that one
`GET`; emptying both constants restores fixture-only behaviour.

### Hosting

The snapshot is produced by `.github/workflows/weather-data.yml` (cron `*/30 * * * *` plus
`workflow_dispatch`, Node 24, `npm run weather:produce` in `apps/weather-radar`) and served by
**GitHub Pages**:

- **URL** — `https://nijnamovich.github.io/bird-news/weather/necochea/v1/latest.json`. A project
  site keeps the repository name in the path, so the uploaded artifact directory is exactly
  `apps/weather-radar/weather-data`.
- **Public by construction** — Pages on GitHub's Free plan serves public repositories only, and a
  Pages site is public. The repository is public, so the snapshot is readable by anyone with the
  URL. It carries weather data and Open-Meteo attribution, no personal data.
- **No commit-back** — the workflow deploys the artifact; `weather-data/` stays git-ignored and no
  data enters git history.
- **Best-effort cadence** — GitHub delays or skips scheduled runs and disables schedules after 60
  days of repository inactivity; the schedule fires only from the default branch's copy of the
  workflow.

The hosting decision is [ADR-0004](../adrs/adr-0004-github-pages-for-snapshots.md); the deploy
steps are in the [release runbook](../protocols/release-and-update-runbook.md). The frozen v1.0.0
contract (`docs/api/openapi.weather-snapshot.yaml`) still contains prose saying no scheduler ships
with the repository; the contract itself is unchanged and is not hand-edited in place — the
scheduler is described here and in ADR-0004.

### What we measured

A plain `GET` to the AccuWeather forecast page from the authoring network, with an Android
Chrome User-Agent and `Accept-Language: es-AR`, was blocked (2026-11-12, re-confirmed
2026-11-13):

```sh
curl -sS -D /tmp/accu.headers -o /tmp/accu.html \
  -A '<Android Chrome mobile User-Agent>' \
  -H 'Accept-Language: es-AR' \
  'https://www.accuweather.com/es/ar/necochea/2924/weather-forecast/2924'

head -n 1 /tmp/accu.headers                 # HTTP/… 403
wc -c < /tmp/accu.html                      # 436
grep -o '<TITLE>[^<]*</TITLE>' /tmp/accu.html   # <TITLE>Access Denied</TITLE>
grep -c '__NEXT_DATA__' /tmp/accu.html          # 0
grep -c 'application/ld+json' /tmp/accu.html    # 0
```

- **Status:** HTTP **403** (Akamai-style access-denied page), **436 bytes**.
- **No data markers:** zero `__NEXT_DATA__` blocks, zero `application/ld+json` blocks. There was
  nothing to parse even if the status had been 200.
- **No cookies were sent**, and the request carried no account, device or location identifier.

Two honest caveats:

1. A phone on mobile data has a different IP and a different TLS/HTTP fingerprint. It *might*
   pass where this network did not. That is **unverified** — the 403 above is the only
   measurement.
2. The AccuWeather page is a JavaScript-rendered SPA. Even a 200 would not make a regex scraper
   viable: the values are produced after client-side execution, so the only on-device route is a
   hidden WebView (or an equivalent JS runtime) plus DOM extraction — heavier, more fragile and
   closer to anti-bot circumvention than this project is willing to go.

### Recommendation and decision

**`pc-pull` is the production mode.** The app ships with `PULL_BASE_URL` set to the GitHub Pages
origin and `DEV_HTTP_BASE_URL` empty, so a cold start paints the persisted last-known-good (the
bundled `fixture` on a true first run) and then performs one conditional `GET`; emptying
`PULL_BASE_URL` restores the zero-network mode.
`phone-scrape` stays unimplemented (blocked by the measured 403); `push` stays a future option.
The decision and its rejected alternatives are recorded in
[ADR-0002](../adrs/adr-0002-pc-pull-over-on-device-scrape.md); the move away from the documented
home-machine tunnel to GitHub Pages is
[ADR-0004](../adrs/adr-0004-github-pages-for-snapshots.md).

Why this option wins today:

- It is the **only strategy that yields parseable data without a headless browser**. The measured
  alternative returns an access-denied page.
- The phone stays **out of the anti-bot arms race**. If AccuWeather changes its markup or
  challenge, one producer on one machine adapts; the app does not ship a new APK.
- The host dependency is **soft, not hard**: the snapshot is a static file, the app keeps the
  last good copy on the device and revalidates it on the next launch, and the bundled fixture
  covers the very first launch. A phone that never reaches GitHub Pages still shows *something*
  and says how old it is.
- It keeps the **offline path** intact: fixture → persisted last-known-good → stale badge. No
  network is a normal state, not a crash.

`push` buys nothing until there is a reason to wake the phone without the user opening the app,
and it costs a push service and a device-token lifecycle.

### Failure modes and what the phone shows

| Failure | What happens | What the phone shows |
| --- | --- | --- |
| **Scheduled run delayed or skipped** | GitHub's cron is best-effort; the previously deployed document stays live | The last deployed snapshot remains readable and its age badge grows; a cold start with no network falls back to the persisted last-known-good or the fixture |
| **Pages deploy failure / wrong artifact path** | The project site returns `404` or keeps the previous deploy | Transport failure or `HTTP_ERROR`; the persisted last-known-good or the fixture stays. Fix: upload exactly `apps/weather-radar/weather-data` |
| **DEV tunnel hostname rotation** (development only) | A quick tunnel's hostname changes on restart, so a saved `DEV_HTTP_BASE_URL` stops resolving | Transport error; the persisted last-known-good or the fixture stays. Production is unaffected — it reads HTTPS from GitHub Pages |
| **Repository rename** | The Pages project-site prefix changes, so the committed `PULL_BASE_URL` stops resolving | Transport error; the persisted last-known-good or the fixture stays. A new URL needs a new binary or an OTA update |
| **Half-written file** | The producer is mid-write when the phone reads | Invalid JSON → `PARSE_ERROR`; JSON that fails the schema → `SCHEMA_INVALID`. The previous document stays on screen |
| **Stale edge cache** | A cache serves an older snapshot | Values look old; the `timing` block still tells the truth. The local Node server sends `Cache-Control: max-age=300, must-revalidate`; GitHub Pages' cache TTL and conditional-GET behaviour are **unmeasured** (ADR-0004) |
| **Doze / battery** | Android defers background work | No background refresh exists: this version revalidates on **cold start**, and on resume only when the document is stale |
| **Clock skew** | Device clock differs from the producer's | `CLOCK_SKEW` is a **producer-side** error code; the client never emits it. The client derives age locally and purges a cached document at 7 days of local receipt age |
| **Rate limit / 429** | Producer or upstream refuses | `RATE_LIMITED`, wait at least `Retry-After`, keep the current document |
| **304 Not Modified** | The client hydrated a persisted pull document and sent `If-None-Match: "<snapshotId>"`; the producer's copy is unchanged | Keep the cached document and reset its local receipt time; no re-render and no follow-up request. Reached since 2026-11-13: the first run after an Expo Go data wipe sent no validator and got `200`; the next cold start sent the saved id and got `304` on device (TD-01 closed) |
| **Redirect** | The producer answers `3xx` | Refused (`redirect: 'error'`) → transport failure; the current document stays. A canonical URL avoids this entirely |
| **Non-HTTPS base URL** | The production constant is not `https://` | Rejected before any request is made; the fixture stays on screen |
| **Schema MAJOR bump** | The producer starts emitting `2.0.0` | `UNSUPPORTED_SCHEMA_VERSION`; the current document stays. A MINOR/PATCH bump is accepted |
| **Schema mismatch** | A field is missing, mistyped or out of range | `SCHEMA_INVALID`; the current document stays |
| **No network** | Every request fails | The persisted last-known-good if one exists; the fixture on a true first run; explicit age |

### Refresh cadence

- **Producer:** at most one fetch every **30 minutes** — 48 upstream fetches per day.
  `.github/workflows/weather-data.yml` runs the producer on a `*/30 * * * *` cron plus
  `workflow_dispatch` and deploys the result to GitHub Pages (TD-10 closed). GitHub's scheduler is
  **best-effort**: runs can be delayed or skipped, and schedules are disabled after 60 days of
  repository inactivity — the ceiling is respected by the cron, not enforced by it. The same
  command (`npm run weather:produce`) still runs locally.
- **App:** revalidates **once per cold start** (conditionally, with the persisted `snapshotId`)
  and again when the app returns to the foreground **only if the document is stale**
  (`freshness().shouldRevalidate`). A fresh document produces zero requests, and there is still
  no fetch timer: the 60 s interval only advances the age label. Pull-to-refresh remains a
  follow-up.

### Terms of service and the read-only contract

This is a **personal, educational, read-only** consumer.

- No public release and no redistribution of vendor data; every document carries
  `source.attribution` and `source.licenseNote`, and the UI displays the attribution.
- **At most 48 producer fetches per day** (one per 30 minutes).
- Honour `Retry-After` on 429 and 5xx; back off instead of retrying tightly.
- **No premium or paywall bypass**, no account use, no scraping behind a login.
- **No cookies, no `Authorization`, no device identifiers, no user-identifying query
  parameters** — on the phone and on the producer.
- The phone talks only to the stable snapshot host. The forbidden audit hosts
  (`*.lambda-url.eu-central-1.on.aws/geovis`, `*.apm.*.cloud.es.io`, `tiles.*/analytics`) are
  never contacted.

## When to use

Read this before changing where data comes from, adding a provider, changing the producer
cadence, or answering "why does the app show the fixture?". It is the decision record's prose
companion — the ADR states the choice, this note keeps the measurements current.

## When not to use

Do not use this note for the mechanical steps of producing and serving a snapshot — that is the
[pc-pull runbook](../protocols/pc-pull-runbook.md). Do not use it as an endpoint inventory; that
is [weather-endpoints](weather-endpoints.md). Do not treat the AccuWeather caveats as a
green light to attempt a scrape: the only measurement is a 403.

## Examples

A cold start with everything configured correctly:

1. On a true first run the fixture paints immediately (`Datos de ejemplo · sin conexión`);
   later cold starts hydrate the persisted pull document before the first paint.
2. One `GET https://nijnamovich.github.io/bird-news/weather/necochea/v1/latest.json` runs.
   `If-None-Match` is omitted on a first run (the held document is the fixture) and sent with the
   persisted `snapshotId` otherwise.
3. A 200 + valid document replaces the held one; the banner becomes `Actualizado hace …`.
4. A 304 keeps the held document and only restarts its local receipt clock; no follow-up request
   is issued.

With `PULL_BASE_URL` emptied, step 2 never happens and no socket is opened.

## Common mistakes

- **Setting a quick tunnel** (`trycloudflare.com`) as a **DEV** origin: its hostname rotates on
  restart, the saved URL breaks, and the app silently falls back to the fixture. Production reads
  GitHub Pages and has this problem only if the repository is renamed — the project-site prefix is
  part of `PULL_BASE_URL`, so a rename needs a new binary.
- **Assuming the phone scrape is merely untested** — it is measured-blocked (403) and the page is
  a JS SPA; a 200 would still not make a regex parser viable.
- **Treating the fixture as a network failure**: it is bundled data, labelled as a sample, and
  the intended first paint.
- **Adding a background timer** to "keep data fresh": it burns battery, Expo Go cannot run it
  reliably, and the producer only changes twice an hour.
- **Treating the GitHub Actions cron as exact** — it is best-effort, can be delayed or skipped, and
  is disabled after 60 days of repository inactivity.
- **Calling the published snapshot private** — a Pages site on the Free plan is public.

## References

- [ADR-0002 — pc-pull over on-device scrape](../adrs/adr-0002-pc-pull-over-on-device-scrape.md)
- [ADR-0004 — GitHub Pages for snapshots](../adrs/adr-0004-github-pages-for-snapshots.md)
- [pc-pull runbook](../protocols/pc-pull-runbook.md) — the local produce/serve loop.
- [release and update runbook](../protocols/release-and-update-runbook.md) — EAS build/update and
  the Pages deploy.
- [weather-endpoints](weather-endpoints.md) — every endpoint and its justification.
- [weather-radar-debt](weather-radar-debt.md) — TD-01, TD-02, TD-03, TD-10 (closed), TD-13.
- `docs/api/openapi.weather-snapshot.yaml` — the contract every provider must satisfy.
