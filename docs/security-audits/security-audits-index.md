---
id: security-audits-index
category: security-audits
tags:
- security-audit
- hub
- index
- android
- apk
aliases:
- Security Audits Index
- Audit Deliverable
related:
- project
version: 1.0
status: active
---

# Security Audits Index

The hub of `docs/security-audits/` — the repository's **original deliverable**. This path is
kept stable because external citations point at it.

**What belongs here:** defensive, static audit summaries. One dossier per audited artifact, dated
in its folder name, with the verdict, identity facts and top findings inline. Full evidence is
not duplicated here — it is preserved in git history and cited from the summary.

**Recorded deviation:** the dated dossier is a read-only artifact volume (like `docs/api/`), not
a wiki note. It keeps provenance metadata only, and this hub is its corpus registration. That is
why the folder pairs the hub's note contract with the dossier's lighter key set — a deliberate
exception, not invisible drift.

**Contents:**

- [weather-radar-pro-2026-11-1/report.md](weather-radar-pro-2026-11-1/report.md) — the
  re-signed "Weather & Radar" APK (`de.wetteronline.wetterapppro` 2026.11.1): **BLOCK — do not
  install**, provenance and signing identity, top findings, toolchain. Full evidence at commit
  `ce4ca74`.

**What belongs elsewhere:** app source and network endpoints live in
[weather-endpoints](../context/weather-endpoints.md) and `apps/weather-radar/`; documentation
rules live in [project](../project.md). A new audit gets a new dated dossier and a row above —
existing summaries are not rewritten to look more current.

The dated dossier folder is a closed artifact volume: this hub is its gatekeeper, so the folder
does not carry a second `*-index.md`.
