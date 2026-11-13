---
id: adr-index
category: adrs
tags:
- adr
- hub
- index
aliases:
- ADR Index
- Decision Records
related:
- adr-0001-stay-on-ng-native
- adr-0002-pc-pull-over-on-device-scrape
- project
version: 1.0
status: active
---

# ADRs Index

The hub of `docs/adrs/` — a gatekeeper, not a content page.

**What belongs here:** decision records for load-bearing choices — framework/stack selection,
data-source strategy, contract-breaking schema changes. Append-only, named
`adr-NNNN-<slug>.md`; the four-digit sequence is the next free number, never reused.

**Contents:**

- [adr-0001-stay-on-ng-native.md](adr-0001-stay-on-ng-native.md) — keep Angular Native
  (`@ng-native/*` 0.22.2) instead of rewriting the rendering layer or the app; pin the alpha in
  lockstep and require on-device proof.
- [adr-0002-pc-pull-over-on-device-scrape.md](adr-0002-pc-pull-over-on-device-scrape.md) —
  `pc-pull` as the production mode, on-device scraping unimplemented because the vendor page
  measured HTTP 403, push deferred.

**What belongs elsewhere:** current versions and verification live in
[weather-stack](../context/weather-stack.md); the data-source measurements in
[weather-data-sources](../context/weather-data-sources.md); the commands in the
[pc-pull runbook](../protocols/pc-pull-runbook.md). A superseded decision stays here with its
successor's `supersedes` pointer — nothing is deleted.

New records: copy the shape of an existing ADR and list the result in Contents above, in the same
commit.
