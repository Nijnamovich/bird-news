---
last_updated: 2026-11-13
status: active
description: Technical-debt register for the weather app — open items with evidence pointers, accepted items, and closed items with their resolution.
tags: [weather, debt, register, known-gaps, follow-ups]
version: 1.0
related:
- project
- weather-radar-slice
- weather-data-sources
- weather-endpoints
- weather-stack
- android-toolchain
- pc-pull-runbook
---

# Technical Debt Register — Weather Radar

This register is the single place where accepted incompleteness lives. Each item has a stable
`TD-nn` id (never reused, never renumbered), one observable claim, and an evidence pointer that
was verified against the committed tree before it was written. Moving an item to **Closed**
requires the fix to be in `main` and the evidence row to name the resolution; moving it to
**Accepted (won't fix)** requires a stated reason, not a mood.

## Open

| ID | Area | Claim / symptom | Evidence path:line | Impact | Next step |
|---|---|---|---|---|---|
| TD-04 | pc-pull / Android | Only the `adb reverse` loopback pull is verified. A LAN-IP `http://` pull is untested against the cleartext policy. | `docs/protocols/pc-pull-runbook.md:158` | A physical phone on Wi-Fi may fail with `CLEARTEXT … not permitted`; the documented workaround is loopback only. | Run one physical-device LAN pull and record the result, or document loopback as the only supported dev path. |
| TD-05 | producer / AccuWeather | The AccuWeather adapter is a disabled seam; `enabled: false` and `fetchRaw()` throws even on a 200. The vendor page measured HTTP 403 and is a JS SPA. | `apps/weather-radar/scripts/accuweather-adapter.mjs:34` | The app depends on Open-Meteo as its only implemented source; no vendor fallback exists. | Only if a 200 is measured from the operator's network: implement a parser + normalizer and register it; otherwise leave disabled. |
| TD-07 | app / platform | iOS is declared in `app.json` and has never been built or run. All on-device evidence is Android. | `apps/weather-radar/app.json:7` | iOS behaviour, layout and the pull path are unknown; "supported" overstates reality. | Either run an iOS build and record it, or state Android-only in the app metadata. |
| TD-10 | producer / scheduling | No scheduler ships with the repository. The 48-fetches/day ceiling is a rule, not a guarantee; producing requires a human or external cron. | `apps/weather-radar/package.json:35` | Snapshots go stale silently when nobody runs the producer. | Add an operator cron example (systemd timer or crontab) in the runbook, or explicitly accept manual production. |
| TD-11 | Android emulator | The 2026-11-12 boot raised the emulator's own "System UI isn't responding" dialog; the app tree had painted. A GPU-backed re-run is still outstanding. | `docs/context/android-toolchain.md:63` | A software-GL ANR remains a caveat on the only on-device evidence for that pass. | Re-run on a GPU-backed device/emulator and record the result. |
| TD-12 | app / icons | `iconCodeFor` (ConditionCode + day/night → IconCode) is exported and tested but has no screen consumer; the screen only uses `iconNameFor`. | `apps/weather-radar/src/app/weather/snapshot-icons.ts:22` | Dead public surface: a tested function that cannot drift loudly because nothing uses it. | Either use it where a condition code arrives without an icon code, or delete it and its tests. |

## Accepted (won't fix)

| ID | Area | Claim / symptom | Evidence path:line | Why accepted |
|---|---|---|---|---|
| TD-08 | app / widget | The Android home-screen widget is gone: no widget is implemented or configured, and the widget documentation (`docs/weather/widget-and-stack.md`) was deleted at commit `d2cbc11`. | `apps/weather-radar/app.json:6` (no widget entry); history at commit `d2cbc11` deleted `docs/weather/widget-and-stack.md` | No requirement asks for it, and restoring a widget would add a background-refresh surface this read-only demo deliberately avoids. Revisit only with a concrete user need. |
| TD-09 | dependencies | `npm audit` reports 3 moderate findings (`minimatch` via `@expo/fingerprint` via `expo`); `npm audit fix --force` proposes a breaking downgrade to `expo` 52.x. | `apps/weather-radar/package.json:14` | A local, read-only demo with no public deployment; the fix would break the SDK 58 stack. Re-run `npm audit` before any wider distribution. |

## Closed

| ID | Area | Claim / symptom | Resolution | Closed |
|---|---|---|---|---|
| TD-01 | pc-pull / ETag | The client is wired to send `If-None-Match`, but a cold start holds the fixture, so no pull-sourced `snapshotId` exists and the header is omitted. | `FileSnapshotStore` hydrates the last pull document before the first paint and `App` revalidates it with `If-None-Match: "<snapshotId>"`. A reachable server answers `304`, the document stays and its local receipt resets. Hermetic: `apps/weather-radar/src/app/app.test.ts:165`. On-device 2026-11-13 (proxy log in front of `npm run weather:serve`): an Expo Go data wipe made the first run send no `If-None-Match` → `200`; a force-stopped cold start sent `If-None-Match: "dbe4e0c6c6c6333bebd88d375d6207b813c21d2d03f5b3b6a0c9a88c0e1df697"` → **`304`**. | 2026-11-13 |
| TD-02 | app / cache | The snapshot cache is in memory only. Two restarts in a row both start from the fixture. | `SnapshotStore` seam (`apps/weather-radar/src/app/weather/snapshot-store.ts`) with a native-free `FileSnapshotStore` (`snapshot-file-adapter.ts`), its `expo-file-system ~58.0.13` factory (`snapshot-file-store.ts`, composed in `src/main.ts`) and an in-memory store for tests. Only `source.id === 'pc-pull'` + `status.ok === true` is written; reads re-run `validateSnapshot` and silently discard corrupt, foreign, error, fixture or 7-day-old files (`snapshot-persistence.ts`). `apps/weather-radar/src/app/app.test.ts:136`; `snapshot-persistence.test.ts:54`; `snapshot-file-adapter.test.ts:99`. | 2026-11-13 |
| TD-03 | app / freshness | Revalidation happens once, in the constructor. There is no resume hook; a `setInterval` only advances the age label. | `AppStateLifecycle` (`apps/weather-radar/src/app/weather/app-state-lifecycle.ts`) is composed at the entry point; `App` refreshes on `active` only when `freshness().shouldRevalidate` is true, and an in-flight flag collapses a burst. The 60 s interval still only advances the label and never fetches. `apps/weather-radar/src/app/app.test.ts:211`, `:244` and `:280`. | 2026-11-13 |
| TD-06 | git / origin | The `origin` remote pointed at the pre-transfer mirror `https://github.com/DaveR-ui/bird-news.git`, which 301-redirects to the canonical repository. | `git remote set-url origin https://github.com/Nijnamovich/bird-news.git`; `git remote -v` now shows the canonical URL for fetch and push, `git fetch` succeeds. No history rewrite. | 2026-11-13 |

## Maintenance

- Add a row **in the same change** that introduces the debt; do not batch them at review time.
- Evidence must be a real `path:line` in the committed tree (or a named commit for history-only
  items). Re-verify the line before closing: line numbers drift after refactors.
- A closed item keeps its id and its row; the register is append-only in spirit — history is not
  erased, it is annotated with a resolution.
