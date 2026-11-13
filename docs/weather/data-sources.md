---
last_updated: 2026-11-13
status: current
description: How the weather data gets updated — the three producer strategies, the measured AccuWeather block, and the pc-pull recommendation.
tags: [weather, data-sources, providers, pc-pull, scrape, freshness]
---

# How the weather data gets updated

## 1. The question

The app needs current conditions, a 24-hour forecast and a 7-day forecast for
Necochea, Argentina, on an Android phone, with no backend of its own and no
vendor SDK. That leaves three places the data can come from: the phone fetches a
public weather page directly, a home computer fetches and normalises the data and
the phone pulls the finished snapshot, or a home computer pushes the snapshot to
the phone. The question this document answers is which of those becomes the
default, what breaks when it fails, and what the phone shows while it is broken.

## 2. The three strategies

| | On-device scrape | PC produces + phone pulls | PC pushes |
| --- | --- | --- | --- |
| **What runs where** | A parser inside the app fetches the vendor page and extracts values on the phone | A small producer on a PC (cron / timer every 30 min) fetches upstream, normalises it, writes one JSON snapshot; the phone does a `GET` of that snapshot | The same producer, but it initiates delivery to the phone |
| **Transport** | HTTPS `GET` from the phone to the vendor | HTTPS `GET` from the phone to a stable host serving a static file; HTTPS `GET` from the PC to the vendor | Push channel (remote push, or a message queue the phone subscribes to) |
| **Auth / trust** | None available; the vendor treats the phone as a bot | None on the phone side; the static file is public-but-unlisted. The PC holds no vendor credentials either | Requires a push service, device tokens and a sender identity — a credential and a registration step |
| **Data quality** | Whatever the page renders; fragile against markup and anti-bot changes | Normalised once, validated against `docs/api/openapi.weather-snapshot.yaml`, identical for every consumer | Same normalisation as pull, but delivery timing is opaque |
| **Freshness** | Only as fresh as the last successful on-device fetch | 30-minute producer cadence; the phone revalidates on cold start in this version | Producer decides; phone has no say |
| **Phone-only?** | Yes | No — needs the PC reachable at least occasionally (soft dependency, see §4) | No — needs the PC and a push service |
| **Failure modes** | 403/429, bot challenge, JS-only page, regex/DOM drift, battery/Doze | PC asleep, tunnel hostname change, half-written file, stale edge cache | All pull failures plus push registration, token expiry, delivery delay |
| **Verdict** | **Experimental / not implemented** | **Recommended production mode** | **Future** |

The contract is the same for all three: one `SnapshotProvider` interface,
`{ id: SourceId; load(knownSnapshotId?: string): Promise<SnapshotLoadResult> }`,
where `SnapshotLoadResult` is `{ kind: 'snapshot'; doc } | { kind: 'not-modified' }`
(a `304` keeps the cached document and refreshes its local receipt time). **Exactly two
implementations ship:**

- `FixtureSnapshotProvider` — `id: 'fixture'`, the bundled
  `src/app/weather/fixtures/necochea.snapshot.json`. Local data; it never
  touches the network.
- `HttpPullSnapshotProvider` — `id: 'pc-pull'`, one conditional `GET` of
  `<PULL_BASE_URL>/weather/necochea/v1/latest.json`.

`phone-scrape` and `push` exist only as members of the `SourceId` type union.
Nothing constructs them, and there is no implementation to construct.

There is **no single constant that switches provider**. The screen constructs
the fixture provider and the pull provider; the switch is `PULL_BASE_URL`:

- **empty** (the shipped default) → fixture only, **zero network requests**;
- **set to an `https://` origin** → fixture first paint, then one conditional
  `GET` on cold start.

## 3. What we measured today (2026-11-12)

A plain `GET` to the AccuWeather forecast page from the authoring network, with
an Android Chrome User-Agent and `Accept-Language: es-AR`, was blocked:

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
- **No data markers:** zero `__NEXT_DATA__` blocks, zero `application/ld+json`
  blocks. There was nothing to parse even if the status had been 200.
- **No cookies were sent**, and the request carried no account, device or
  location identifier.

Two honest caveats:

1. A phone on mobile data has a different IP and a different TLS/HTTP
   fingerprint. It *might* pass where this network did not. That is
   **unverified** — the 403 above is the only measurement.
2. The AccuWeather page is a JavaScript-rendered SPA. Even a 200 would not make
   a regex scraper viable: the values are produced after client-side execution,
   so the only on-device route is a hidden WebView (or an equivalent JS runtime)
   plus DOM extraction, which is heavier, more fragile and closer to the line of
   anti-bot circumvention than this project is willing to go.

## 4. Recommendation

**Use `pc-pull` as the production mode.** The app itself ships with
`PULL_BASE_URL` empty, so it renders the bundled `fixture` and makes **zero
network requests** until that constant is set to a stable `https://` origin.
`phone-scrape` stays unimplemented (blocked by the 403 above); `push` stays a
future option.

```ts
// src/app/app.ts — the only switch
const PULL_BASE_URL = '';        // production: '' or https://<named-tunnel> only
const DEV_HTTP_BASE_URL = '';    // DEV: 'http://localhost:8080' (adb reverse)
```

The implemented producer source is **Open-Meteo** (keyless, HTTP 200 verified
2026-11-13, attribution CC BY 4.0); the AccuWeather adapter is present but
disabled. `docs/weather/pc-pull-runbook.md` has the commands and the trade-off.

Setting the active constant makes the screen paint the fixture first, then issue one conditional
`GET` of `/weather/necochea/v1/latest.json` on cold start. It sends
`If-None-Match: "<snapshotId>"` when it already holds a document; `304` keeps
that document and only refreshes its local receipt time.

Why this option wins today:

- It is the **only strategy that yields parseable data without a headless
  browser**. The measured alternative returns an access-denied page.
- The phone stays **out of the anti-bot arms race**. If AccuWeather changes its
  markup or challenge, one producer on one machine adapts; the app does not ship
  a new APK.
- The PC dependency is **soft, not hard**: the snapshot is a static file, the
  app keeps the last good copy in memory for the session, and the bundled
  fixture covers the very first launch. A phone that never reaches the PC still
  shows *something* and says how old it is.
- It keeps the **offline path** intact: `fixture` → in-session last-known-good →
  stale badge. No network is a normal state, not a crash.

`push` stays a future option. It buys nothing until there is a reason to wake
the phone without the user opening the app, and it costs a push service and a
device-token lifecycle.

## 5. Failure modes and what the phone shows

| Failure | What happens | What the phone shows |
| --- | --- | --- |
| **PC asleep** | Pull fails at the transport layer (`UPSTREAM_UNAVAILABLE`) | The fixture on a cold start; a document already loaded this session stays on screen with an age badge |
| **Tunnel hostname rotation** | The saved `PULL_BASE_URL` stops resolving | Transport error; the fixture or in-session last-known-good stays. Fix: a **named tunnel with a custom domain**, never a quick tunnel whose hostname changes on restart |
| **Half-written file** | The producer is mid-write when the phone reads | Invalid JSON → `PARSE_ERROR`; JSON that fails the schema → `SCHEMA_INVALID`. The previous document stays on screen |
| **Stale edge cache** | A CDN or proxy serves an older snapshot | Values look old; the `timing` block still tells the truth. `Cache-Control: max-age=300, must-revalidate` bounds the damage |
| **Doze / battery** | Android defers background work | No background refresh exists: this version revalidates on **cold start only** (resume and pull-to-refresh are follow-ups) |
| **Clock skew** | Device clock differs from the producer's | `CLOCK_SKEW` is a **producer-side** error code; the client never emits it. The client derives age locally and purges a cached document at 7 days of local receipt age, so a skewed producer clock cannot keep an old copy alive |
| **Rate limit / 429** | Producer or upstream refuses | `RATE_LIMITED`, wait at least `Retry-After`, keep the current document |
| **304 Not Modified** | The client sent `If-None-Match: "<snapshotId>"` and the producer's copy is unchanged | Keep the cached document and refresh its local receipt time; no re-render |
| **Redirect** | The producer answers `3xx` | Refused (`redirect: 'error'`) → transport failure; the current document stays. A canonical URL avoids this entirely |
| **Non-HTTPS base URL** | `PULL_BASE_URL` is not `https://` | Rejected before any request is made; the fixture stays on screen |
| **Schema MAJOR bump** | The producer starts emitting `2.0.0` | `UNSUPPORTED_SCHEMA_VERSION`; the current document stays. A MINOR/PATCH bump is accepted |
| **Schema mismatch** | A field is missing, mistyped or out of range | `SCHEMA_INVALID`; the current document stays |
| **No network** | Every request fails | The fixture on a cold start; in-session last-known-good otherwise; explicit age |

## 6. Refresh cadence

- **Producer:** one fetch every **30 minutes**. That is 48 upstream fetches per
  day, the ceiling stated in §7.
- **App:** revalidates on **cold start only** in this version. There is no
  resume hook and no pull-to-refresh yet — both are follow-ups — and no
  background timers: Expo Go cannot run them reliably, and a timer would only
  burn battery to re-read a file that changes twice an hour.

## 7. Terms of service and the read-only contract

This is a **personal, educational, read-only** consumer.

- No public release and no redistribution of vendor data; every document carries
  `source.attribution` and `source.licenseNote`, and the UI displays the
  attribution.
- **At most 48 producer fetches per day** (one per 30 minutes).
- Honour `Retry-After` on 429 and 5xx; back off instead of retrying tightly.
- **No premium or paywall bypass**, no account use, no scraping behind a login.
- **No cookies, no `Authorization`, no device identifiers, no user-identifying
  query parameters** — on the phone and on the producer.
- The phone talks only to the stable snapshot host. The forbidden audit hosts
  (`*.lambda-url.eu-central-1.on.aws/geovis`, `*.apm.*.cloud.es.io`,
  `tiles.*/analytics`) are never contacted.

## 8. Decision (2026-11-13)

**`pc-pull` is the mode; there is no tunnel yet.** Until a named tunnel exists
the app uses the DEV-only plain-HTTP path, so real data is available today:

- `npm run weather:produce` then `npm run weather:serve` on this machine
  (Open-Meteo, keyless), reached from the phone through
  `adb reverse tcp:8080 tcp:8080` → `http://localhost:8080`;
- `DEV_HTTP_BASE_URL` is a **separate, empty-by-default** constant carrying that
  URL. `PULL_BASE_URL` stays `''` or `https://` only, and setting both is an
  error, so a dev value can never masquerade as production;
- the upgrade seam is one edit: once the named Cloudflare tunnel answers, put
  `https://weather.<your-domain>` in `PULL_BASE_URL` and empty the dev constant.

Commands, the Android cleartext caveat and the named-tunnel steps live in
`docs/weather/pc-pull-runbook.md`. The phone-on-mobile-data scrape spike stays
an optional experiment; it is not on the critical path.
