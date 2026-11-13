---
last_updated: 2026-11-13
status: current
description: Stack lineage of the weather app versus the newest upstream ng-native and Expo releases, with the framework option comparison.
tags: [weather, stack, ng-native, expo, react-native, angular, upgrade]
---

# Stack and upgrade

## Stack lineage

The app's stack, as the 2026-11-12 reduction landed it, is **ng-native 0.9.0**
(published 2026-10-09) with **Angular 22**, **Expo SDK 57** (`expo ~57.0.26`),
**React Native 0.86.3** and **Node ≥ 22.18** (the ng-native documented floor).

The newest upstream is **ng-native 0.22.2** (published 2026-11-06) — **13
releases in four weeks**, on the same alpha line — with **Expo SDK 58**
(`58.0.25`) and **React Native 0.88**. That is velocity, not a new product: the
0.9.0 line is four weeks behind a fast-moving alpha.

**Angular has no first-party mobile / React Native integration.** "Angular
Native" (ng-native) is an independent, community, **alpha** project; it is not
endorsed by Google, the Angular team, or Expo. Any option below that renders
Angular on a phone is either that project or a third-party bridge.

| Option | Angular 22 support | Character |
| --- | --- | --- |
| **ng-native** (0.9.0 → 0.22.2) | Yes — the app is Angular 22 | Alpha, community; renders Angular templates to **real native views**, no WebView; smallest ecosystem; fast release cadence |
| **Ionic + Capacitor 8.6.2** | Yes — Angular is a first-class Ionic framework | Mature, WebView UI, very large ecosystem and docs; feels like a web app, not a native one |
| **NativeScript Angular 22.0.2** | Yes — official Angular integration in the 22.0.2 line | Native views, no WebView, mature Angular story; smaller community than Ionic |
| **Expo + React** (SDK 58) | No — React, not Angular | First-party Expo/RN, huge ecosystem; would mean rewriting the UI in React |

ng-native remains the only option that keeps the existing Angular code and
renders native views. Switching to Ionic or NativeScript is a rewrite of the
rendering layer; switching to Expo + React is a rewrite of the app.

## Upgrade outcome (2026-11-13)

Applied: `@ng-native/* 0.22.2` (five packages, in lockstep), `expo ~58.0.25`,
`expo-system-ui ~58.0.7`, `react-native 0.88.1`, `react 19.3.0` (the version
Expo SDK 58 pins), lockfile regenerated. One source change was required: React
Native 0.88 replaced the runnable's hand-written parameter type with
`AppParameters` / opaque `RootTag`, so `src/main.ts` no longer annotates
`rootTag`.

Verified on 2026-11-13: `npm test` 110/110, `npm run typecheck` clean,
`npx expo export --platform android` bundles (1129 modules → 4 MB Hermes), and a
cold start on the `pixel` AVD with the Expo Go **58.0.5** client painted the
reduced screen — and the live Open-Meteo document with the dev HTTP constant
temporarily set. `npm audit` reports 3 moderate findings (`minimatch` via
`@expo/fingerprint`), down from 30. See `docs/project.md` for the full record.
