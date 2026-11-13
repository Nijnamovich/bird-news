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
moved_from:
- docs/weather/data-sources.md
---

# How the Weather Data Gets Updated

## Problem

The app needs current conditions, a 24-hour forecast and a 7-day forecast for Necochea,
Argentina, on an Android phone, with no backend of its own and no vendor SDK. That leaves three
places the data can come from: the phone fetches a public weather page directly, a home computer
fetches and normalises the data and the phone pulls the finished snapshot, or a home computer
pushes the snapshot to the phone. The question is which becomes the default, what breaks when it
fails, and what the phone shows while it is broken.

## Solution

### The three strategies

| | On-device scrape | PC produces + phone pulls | PC pushes |
| --- | --- | --- | --- |
| **What runs where** | A parser inside the app fetches the vendor page and extracts values on the phone | A small producer on a PC (cron / timer every 30 min) fetches upstream, normalises it, writes one JSON snapshot; the phone does a `GET` of that snapshot | The same producer, but it initiates delivery to the phone |
| **Transport** | HTTPS `GET` from the phone to the vendor | HTTPS `GET` from the phone to a stable host serving a static file; HTTPS `GET` from the PC to the vendor | Push channel (remote push, or a message queue the phone subscribes to) |
| **Auth / trust** | None available; the vendor treats the phone as a bot | None on the phone side; the static file is public-but-unlisted. The PC holds no vendor credentials either | Requires a push service, device tokens and a sender identity — a credential and a registration step |
| **Data quality** | Whatever the page renders; fragile against markup and anti-bot changes | Normalised once, validated against the contract, identical for every consumer | Same normalisation as pull, but delivery timing is opaque |
| **Freshness** | Only as fresh as the last successful on-device fetch | 30-minute producer cadence; the phone revalidates on cold start in this version | Producer decides; the phone has no say |
| **Phone-only?** | Yes | No — needs the PC reachable at least occasionally (soft dependency) | No — needs the PC and a push service |
| **Failure modes** | 403/429, bot challenge, JS-only page, regex/DOM drift, battery/Doze | PC asleep, tunnel hostname change, half-written file, stale edge cache | All pull failures plus push registration, token expiry, delivery delay |
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

- **empty** (the shipped default) → fixture only, **zero network requests**;
- **set to an `https://` origin** → the persisted last-known-good paints on later starts
  (the fixture on a true first run), then one conditional `GET` on cold start.

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

**`pc-pull` is the production mode.** The app ships with both base-URL constants empty, so it
renders the persisted last-known-good (or the bundled `fixture` on a first run) and makes
**zero network requests** until an origin is set.
`phone-scrape` stays unimplemented (blocked by the measured 403); `push` stays a future option.
The decision and its rejected alternatives are recorded in
[ADR-0002](../adrs/adr-0002-pc-pull-over-on-device-scrape.md).

Why this option wins today:

- It is the **only strategy that yields parseable data without a headless browser**. The measured
  alternative returns an access-denied page.
- The phone stays **out of the anti-bot arms race**. If AccuWeather changes its markup or
  challenge, one producer on one machine adapts; the app does not ship a new APK.
- The PC dependency is **soft, not hard**: the snapshot is a static file, the app keeps the last
  good copy on the device and revalidates it on the next launch, and the bundled fixture covers
  the very first launch. A phone that never reaches the PC still shows *something* and says how
  old it is.
- It keeps the **offline path** intact: fixture → persisted last-known-good → stale badge. No
  network is a normal state, not a crash.

`push` buys nothing until there is a reason to wake the phone without the user opening the app,
and it costs a push service and a device-token lifecycle.

### Failure modes and what the phone shows

| Failure | What happens | What the phone shows |
| --- | --- | --- |
| **PC asleep** | Pull fails at the transport layer (`UPSTREAM_UNAVAILABLE`) | The persisted last-known-good document, or the fixture on a true first run; an age badge keeps aging |
| **Tunnel hostname rotation** | The saved production URL stops resolving | Transport error; the fixture or persisted last-known-good stays. Fix: a **named tunnel with a custom domain**, never a quick tunnel whose hostname changes on restart |
| **Half-written file** | The producer is mid-write when the phone reads | Invalid JSON → `PARSE_ERROR`; JSON that fails the schema → `SCHEMA_INVALID`. The previous document stays on screen |
| **Stale edge cache** | A CDN or proxy serves an older snapshot | Values look old; the `timing` block still tells the truth. `Cache-Control: max-age=300, must-revalidate` bounds the damage |
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

- **Producer:** at most one fetch every **30 minutes** — 48 upstream fetches per day. The
  repository ships **no scheduler**: the command is run by hand (`npm run weather:produce`) or
  from the operator's own cron, and the ceiling is a rule to keep, not an automatic guarantee
  (TD-10).
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
2. One `GET https://<host>/weather/necochea/v1/latest.json` runs. `If-None-Match` is omitted on
   a first run (the held document is the fixture) and sent with the persisted `snapshotId`
   otherwise.
3. A 200 + valid document replaces the held one; the banner becomes `Actualizado hace …`.
4. A 304 keeps the held document and only restarts its local receipt clock; no follow-up request
   is issued.

With both constants empty (the committed state), step 2 never happens and no socket is opened.

## Common mistakes

- **Setting a quick tunnel** (`trycloudflare.com`) as the production origin: its hostname rotates
  on restart, the saved URL breaks, and the app keeps the persisted last-known-good (or the
  fixture on a first run).
- **Assuming the phone scrape is merely untested** — it is measured-blocked (403) and the page is
  a JS SPA; a 200 would still not make a regex parser viable.
- **Treating the fixture as a network failure**: it is bundled data, labelled as a sample, and
  the intended first paint.
- **Adding a background timer** to "keep data fresh": it burns battery, Expo Go cannot run it
  reliably, and the producer only changes twice an hour.
- **Turning the 48/day ceiling into an automatic claim** — no scheduler ships with the repo.

## References

- [ADR-0002 — pc-pull over on-device scrape](../adrs/adr-0002-pc-pull-over-on-device-scrape.md)
- [pc-pull runbook](../protocols/pc-pull-runbook.md) — the commands and the tunnel upgrade.
- [weather-endpoints](weather-endpoints.md) — every endpoint and its justification.
- [weather-radar-debt](weather-radar-debt.md) — TD-01, TD-02, TD-03, TD-10.
- `docs/api/openapi.weather-snapshot.yaml` — the contract every provider must satisfy.
