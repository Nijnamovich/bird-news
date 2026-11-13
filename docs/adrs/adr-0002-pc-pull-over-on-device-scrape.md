---
id: adr-0002-pc-pull-over-on-device-scrape
category: adrs
tags:
- adr
- weather
- data-sources
- pc-pull
- scrape
aliases:
- ADR-0002
- PC pull over on-device scrape
related:
- adr-index
- weather-data-sources
- weather-endpoints
- pc-pull-runbook
version: 1.0
status: active
---

# ADR-0002: PC Pull Over On-Device Scrape

## Problem

The app needs weather data for Necochea without a backend of its own. Three strategies were
available: scrape the vendor page on the phone, have a home PC produce a snapshot that the phone
pulls, or have the PC push the snapshot to the phone. The on-device route promised the fewest
moving parts; it had to be measured before it could be chosen. It was measured, and it is blocked.

## Solution

**Adopt `pc-pull` as the production mode; do not implement on-device scraping; defer push.**

Decisions, itemized:

1. **`pc-pull` is the recommended and only implemented network mode.** A small Node producer on
   a PC fetches Open-Meteo, normalises and validates one `WeatherSnapshot`, and writes it
   atomically; the phone performs one conditional `GET` of that static document.
2. **On-device scraping is not implemented.** A plain `GET` to the AccuWeather forecast page
   returned **HTTP 403** (Akamai-style access denied, 436 B, `<TITLE>Access Denied</TITLE>`, no
   `__NEXT_DATA__`, no `application/ld+json`) on 2026-11-12, re-confirmed 2026-11-13. The page is
   also a JavaScript SPA, so a 200 would still require a headless browser.
3. **Push stays a future option.** It adds a push service, device tokens and a sender identity
   for no benefit until the phone must be woken without the user opening the app.
4. **The shipped default is offline**: both base-URL constants empty, bundled fixture, zero
   network requests. Enabling the pull requires an explicit one-constant edit.
5. **The producer source is Open-Meteo** (keyless, HTTP 200 verified, attribution CC BY 4.0);
   the AccuWeather adapter remains a disabled seam that fails loudly.
6. **The 30-minute cadence (≤ 48 fetches/day) is a contract**, but no scheduler ships with the
   repository (TD-10).

Rejected alternatives:

| Alternative | Why rejected |
| --- | --- |
| On-device scrape | Measured 403; JS-rendered SPA; would require fingerprint impersonation or a hidden WebView — outside the read-only, non-circumvention scope. |
| Push to the phone | Requires a push service, tokens and registration; no current need to wake the phone. |
| Direct phone → Open-Meteo | Would move normalisation and contract validation onto the phone and put a third party in the app's network surface; the producer keeps one adaptation point. |
| A hosted backend | Contradicts the no-backend, personal-demo scope and adds an operational surface. |

## When to use

Read this when changing where data comes from, adding a provider, or defending the absence of a
scraper. [weather-data-sources](../context/weather-data-sources.md) carries the measurements and
failure semantics; this record carries the choice.

## When not to use

Do not read the 403 as "scraping is merely untested" — it is measured-blocked and the page is a
SPA. Do not use this decision to add a polling timer or a background job: the cadence and the
cold-start-only refresh are separate constraints (TD-03, TD-10).

## Examples

The state this decision produces:

- **Committed default** — `PULL_BASE_URL = ''`, `DEV_HTTP_BASE_URL = ''`: fixture only, no
  socket opened.
- **DEV** — `DEV_HTTP_BASE_URL = 'http://localhost:8080'` + `adb reverse tcp:8080 tcp:8080`:
  one loopback `GET` of the produced document.
- **Production, later** — `PULL_BASE_URL = 'https://weather.<domain>'` on a **named** Cloudflare
  tunnel; a quick tunnel is rejected because its hostname rotates.

The commands live in the [pc-pull runbook](../protocols/pc-pull-runbook.md).

## Common mistakes

- **Re-attempting the scrape** without a fresh measurement from the actual target network; the
  only recorded result is a 403.
- **Choosing a quick tunnel** for production — the rotating hostname silently breaks the saved
  URL and the app falls back to the fixture.
- **Treating push as "just another transport"** — it carries a credential and a registration
  lifecycle the other modes do not.
- **Assuming the producer cadence is enforced** — it is a documented rule, not a shipped timer.

## References

- [adr-index](adr-index.md) — the decision-record hub.
- [weather-data-sources](../context/weather-data-sources.md) — the three strategies, the 403
  measurement, failure semantics and cadence.
- [weather-endpoints](../context/weather-endpoints.md) — endpoint inventory and read-only contract.
- [pc-pull runbook](../protocols/pc-pull-runbook.md) — produce, serve, `adb reverse`, named tunnel.
- [weather-radar-debt](../context/weather-radar-debt.md) — TD-01, TD-02, TD-05, TD-10.
