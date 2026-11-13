---
id: adr-0004-github-pages-for-snapshots
category: adrs
tags:
- adr
- hosting
- github-pages
- github-actions
- weather
- cron
aliases:
- ADR-0004
- GitHub Pages for snapshots
related:
- adr-index
- weather-data-sources
- pc-pull-runbook
- weather-radar-debt
version: 1.0
status: active
---

# ADR-0004: GitHub Pages for Weather Snapshots

## Problem

The phone needs one static `WeatherSnapshot` document for Necochea over HTTPS, from a hostname that
does not change, produced on a schedule. The previously documented production route was a producer
on a home machine served over a tunnel — never actually deployed: it needs that machine awake and
reachable, and a quick tunnel (`trycloudflare.com`) rotates its hostname on restart, which silently
breaks the saved `PULL_BASE_URL` and drops the app back to the fixture. The producer's output is
already a static artifact — one validated JSON file — so the hosting question is where a file can be
written on a timer and read by anyone with the URL, without operating a server.

## Solution

**Publish the snapshot as a GitHub Pages site built by a scheduled GitHub Actions workflow.**

Decisions, itemized:

1. **The workflow produces, Pages serves.** `.github/workflows/weather-data.yml` runs on cron
   `*/30 * * * *` plus `workflow_dispatch`, with `permissions: contents: read / pages: write /
   id-token: write` and `environment: github-pages`. On Node 24 it runs `npm ci` and
   `npm run weather:produce` in `apps/weather-radar`, uploads the artifact and deploys it with
   `actions/deploy-pages` (upload via `actions/upload-pages-artifact`), under one concurrency
   group. The producer validates before writing; Pages only ever receives a document that passed
   the contract.
2. **The artifact path is exactly `apps/weather-radar/weather-data`.** A project site keeps the
   repository name in the path, so `weather-data/weather/necochea/v1/latest.json` is served at
   `https://nijnamovich.github.io/bird-news/weather/necochea/v1/latest.json`. That URL is the
   composed `PULL_BASE_URL` (`https://nijnamovich.github.io/bird-news`) plus the contract path
   `/weather/necochea/v1/latest.json`.
3. **The repository is public and so is the snapshot.** GitHub Pages on the Free plan serves
   public repositories only, and a Pages site is public. `Nijnamovich/bird-news` is public, so this
   is consistent — but the snapshot is readable by anyone with the URL, not
   "public-but-unlisted". It contains weather data and Open-Meteo attribution, no personal data.
4. **Nothing is committed back.** The workflow deploys the uploaded artifact; `weather-data/`
   stays git-ignored and the repository history gains no data commit every 30 minutes.
5. **The read-only contract is unchanged.** The app still performs one parameterless `GET` of the
   snapshot path, with no body, cookies, `Authorization`, device identifier or user-identifying
   query parameter; the producer still makes one upstream fetch per run. Whether GitHub Pages
   answers a conditional `GET` with `304` is **not measured here** — the recorded on-device `304`
   (TD-01, closed 2026-11-13) targets the local Node server. The client is unaffected either way:
   a `200` replaces the document, a `304` keeps it and resets the local receipt clock.
6. **The 30-minute cadence is best-effort, not a guarantee.** GitHub's scheduler is delayed under
   load and its runs can be skipped; scheduled workflows are **disabled after 60 days of repository
   inactivity**, and the schedule only fires once the workflow exists on the default branch. The
   ≤ 48 fetches/day ceiling is therefore a target the cron respects, not an enforced timer.
7. **The site is already enabled.** Verified 2026-11-13:
   `gh api -X POST repos/Nijnamovich/bird-news/pages -f build_type=workflow` returned a Pages site
   with `html_url: https://nijnamovich.github.io/bird-news/`, `build_type: workflow`,
   `public: true`. No deploy has run yet — the workflow exists only on the feature branch. The UI
   equivalent is Settings → Pages → Build and deployment → Source: GitHub Actions.
8. **Cost and limits, stated plainly.** GitHub Actions minutes are free for public repositories;
   Pages is a free static host with no SLA, no cache-control contract and no support commitment.
   That is acceptable for a personal read-only demo, not for anything load-bearing.

Rejected alternatives:

| Alternative | Why rejected |
| --- | --- |
| Cloudflare quick tunnel (`trycloudflare.com`) | The hostname rotates on every restart, the saved URL breaks, and the app falls back to the fixture. Already rejected in ADR-0002. |
| Named tunnel + home PC | Requires an always-on machine and a tunnel process; "PC asleep" is a documented failure. The data is a static file — it does not need a live origin. |
| Cloudflare Pages | A second account, project and deploy integration for the same static artifact that GitHub already hosts next to the workflow; no capability is gained. |
| Vercel (or another static host) | Another third-party account and CI wiring for one JSON file, when the repository and its scheduler are already on GitHub. |
| Committing the snapshot to a `gh-pages` branch | Writes generated data into git history every 30 minutes, contradicts the git-ignored `weather-data/`, and turns a data refresh into repository churn. |
| A real backend / API service | Contradicts the no-backend, no-account, read-only scope; adds auth, uptime and an operational surface for one document. |

## When to use

Read this when changing where snapshots are published, debugging "the phone shows the fixture",
reasoning about snapshot freshness, or renaming the repository (the project-site path changes with
it). [weather-data-sources](../context/weather-data-sources.md) carries the strategy and failure
semantics; this record carries the hosting choice.

## When not to use

Do not use it as the procedure for producing or serving a snapshot locally — that is the
[pc-pull runbook](../protocols/pc-pull-runbook.md). Do not treat the cron as a freshness
guarantee: it is best-effort and stops after 60 days of repository inactivity. Do not read "public
site" as a licence to publish anything beyond the validated snapshot.

## Examples

The state this decision produces:

- **Published URL** — `https://nijnamovich.github.io/bird-news/weather/necochea/v1/latest.json`,
  readable with a plain `GET`; the app composes it from `PULL_BASE_URL =
  'https://nijnamovich.github.io/bird-news'`.
- **First run after merge** — the workflow must be on the default branch for the cron to fire;
  trigger it once with `gh workflow run weather-data.yml` (or Actions → "Weather data → GitHub
  Pages" → Run workflow), then `curl` the URL.
- **A skipped run** — the previously deployed document stays live; the app's freshness badge ages
  it. No 404, no gap.
- **A renamed repository** — the project-site prefix changes, so `PULL_BASE_URL` changes and a new
  binary is required.

## Common mistakes

- **Expecting the cron to be exact.** GitHub runs scheduled workflows on a best-effort basis; a
  delayed or skipped run is normal, and 60 days of inactivity disables the schedule entirely.
- **Assuming the workflow runs from a feature branch.** The schedule fires only from the default
  branch's copy of the workflow.
- **Deploying the wrong artifact path.** `apps/weather-radar/weather-data` is load-bearing: it
  yields the `/weather/necochea/v1/latest.json` path under the project-site prefix. A different
  directory publishes a 404.
- **Looking for an ETag/304 guarantee from Pages.** Only the local Node server's `304` was
  verified; Pages' conditional-GET behaviour is unmeasured.
- **Calling the snapshot private.** A Pages site on the Free plan is public; so is this JSON.

## References

- [adr-index](adr-index.md) — the decision-record hub.
- [ADR-0002 — pc-pull over on-device scrape](adr-0002-pc-pull-over-on-device-scrape.md) — why the
  phone pulls a static document at all.
- [ADR-0003 — EAS Build and Update](adr-0003-eas-build-and-update.md) — how the app is installed
  and updated.
- [weather-data-sources](../context/weather-data-sources.md) — strategies, measurements, failure
  semantics, cadence.
- [pc-pull-runbook](../protocols/pc-pull-runbook.md) — the local produce/serve/read-back loop.
- [release-and-update-runbook](../protocols/release-and-update-runbook.md) — triggering and
  verifying the Pages deploy.
- [weather-radar-debt](../context/weather-radar-debt.md) — TD-10 (scheduler, now closed), TD-04
  (DEV-only LAN caveat), TD-13 (EAS not initialized).
