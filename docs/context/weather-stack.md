---
last_updated: 2026-11-13
status: active
description: The app's stack lineage, the Angular-on-mobile option comparison, and what the 0.22.2 / SDK 58 upgrade changed.
tags: [weather, stack, ng-native, expo, react-native, angular, upgrade]
version: 1.0
related:
- project
- weather-radar-slice
- android-toolchain
- weather-radar-debt
moved_from:
- docs/weather/stack-and-upgrade.md
---

# Weather App — Stack and Upgrade

## Problem

An alpha framework and a fast release cadence make "which versions are we on, and why this
framework at all?" a question every new session asks. Without a recorded lineage, an upgrade
looks arbitrary and a framework choice gets re-litigated from scratch.

## Solution

### Current versions (2026-11-13)

| Layer | Version |
| --- | --- |
| Angular Native | `@ng-native/*` **0.22.2** (six packages: five runtime plus `@ng-native/testing`, in lockstep) |
| Expo SDK | **58** (`expo ~58.0.25`, `expo-system-ui ~58.0.7`) |
| Expo Go client | **58.0.5** on the emulator (must match the project SDK) |
| React Native | **0.88.1**, New Architecture |
| Angular | **22** (`^22.0.0`) |
| React | **19.3.0** (the version Expo SDK 58 pins) |
| TypeScript | `~6.0.3` |
| Tests | Vitest 5, hermetic on Node |
| Node floor | **≥ 22.18** (ng-native's documented minimum) |

### Why ng-native

**Angular has no first-party mobile / React Native integration.** "Angular Native" is an
independent, community, **alpha** project; it is not endorsed by Google, the Angular team or
Expo. Every option that renders Angular on a phone is either that project or a third-party
bridge.

| Option | Angular 22 support | Character |
| --- | --- | --- |
| **ng-native** (0.9.0 → 0.22.2) | Yes — the app is Angular 22 | Alpha, community; renders Angular templates to **real native views**, no WebView; smallest ecosystem; fast release cadence |
| **Ionic + Capacitor 8.6.2** | Yes — Angular is a first-class Ionic framework | Mature, WebView UI, very large ecosystem; feels like a web app, not a native one |
| **NativeScript Angular 22.0.2** | Yes — official Angular integration in the 22.0.2 line | Native views, no WebView, mature Angular story; smaller community than Ionic |
| **Expo + React** (SDK 58) | No — React, not Angular | First-party Expo/RN, huge ecosystem; would mean rewriting the UI in React |

ng-native is the only option that keeps the existing Angular code and renders native views.
Ionic or NativeScript would be a rewrite of the rendering layer; Expo + React a rewrite of the
app. The decision is recorded in [ADR-0001](../adrs/adr-0001-stay-on-ng-native.md).

### The 2026-11-13 upgrade

Moved in lockstep from ng-native 0.9.0 / SDK 57 / RN 0.86: `@ng-native/* 0.22.2`, `expo
~58.0.25`, `expo-system-ui ~58.0.7`, `react-native 0.88.1`, `react 19.3.0`, lockfile
regenerated. One source change was required: React Native 0.88 types `AppRegistry.registerRunnable`'s
runnable as `AppParameters` with an opaque `RootTag`, so `src/main.ts` no longer annotates
`rootTag` by hand.

Verified 2026-11-13: `npm test` **111/111**, `npm run typecheck` clean, `npx expo export
--platform android` bundles (1129 modules → ~4 MB Hermes), and a cold start on the `pixel` AVD
(API 36) with Expo Go **58.0.5** painted the reduced screen. With the DEV constant temporarily
pointing at the local producer, the same build rendered the live Open-Meteo document.

The 57.0.9 client was replaced on the emulator with 58.0.5 (SHA-256
`d979cf81c56c5432c5aa69adc9497521ee72d1f87e92eee33bc949167a40f1a6`) because Expo Go must match
the project's SDK.

### Known cost

`npm audit` reports **3 moderate** findings (`minimatch` via `@expo/fingerprint` via `expo`),
down from 30 on the 0.9.0 template. `npm audit fix --force` would downgrade `expo` to 52.x — a
breaking change — so the finding is accepted for a local read-only demo and tracked as TD-09.

## When to use

Read this before upgrading any package, evaluating an alternative framework, or answering
"why is the app on an alpha?". It is the factual counterweight to the ADR's decision rationale.

## When not to use

Do not use it as the install runbook for the host SDK and emulator — that is
[android-toolchain](android-toolchain.md). Do not use it to decide whether to attempt a
different framework: that is a new ADR, superseding ADR-0001, not an edit here.

## Examples

The version check that caught the peer drift during the upgrade:

```sh
cd apps/weather-radar
npx expo install --check     # reports packages whose version disagrees with the SDK pin
npm test                     # 111 tests
npm run typecheck            # ngc --noEmit
npx expo export --platform android
```

The upgrade is only "done" when all four pass and the app paints on the emulator — a green
bundle alone proves compilation, not rendering.

## Common mistakes

- **Upgrading one `@ng-native/*` package.** The six packages are a lockstep set; a partial bump
  produces duplicate native modules or opaque runtime failures.
- **Reusing an Expo Go client from the previous SDK.** It cannot load the bundle; the client
  version must match the SDK.
- **Treating `npm audit fix --force` as routine** — it proposes a breaking Expo downgrade.
- **Reading ng-native's release velocity as stability.** Thirteen releases in four weeks is an
  active alpha, not a stable product; pin exact versions and re-verify on device.

## References

- [ADR-0001 — stay on ng-native](../adrs/adr-0001-stay-on-ng-native.md)
- [android-toolchain](android-toolchain.md) — host SDK, emulator and launch races.
- [weather-radar-debt](weather-radar-debt.md) — TD-07 (iOS), TD-09 (audit findings).
- `apps/weather-radar/package.json` — the pinned versions.
