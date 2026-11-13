---
id: adr-0001-stay-on-ng-native
category: adrs
tags:
- adr
- stack
- angular
- ng-native
- expo
aliases:
- ADR-0001
- Stay on ng-native
related:
- adr-index
- weather-stack
- weather-radar-slice
version: 1.0
status: active
---

# ADR-0001: Stay on ng-native for the Android App

## Problem

The app must render Angular on an Android phone, and Angular has **no first-party mobile or
React Native integration**. The chosen framework, ng-native, is an independent community
**alpha** (0.22.2 at decision time) with a fast release cadence — thirteen releases in four
weeks on the same line. Every alternative either rewrites the rendering layer (Ionic/Capacitor,
NativeScript) or rewrites the app (Expo + React). The question was whether to keep an alpha
framework or pay for a rewrite.

## Solution

**Stay on ng-native, and upgrade it in lockstep rather than switching frameworks.**

Decisions, itemized:

1. **Keep ng-native** as the rendering layer; the app remains Angular 22 with real native views
   and no WebView.
2. **Pin the alpha exactly** — `@ng-native/*` 0.22.2 across all six packages (five runtime plus
   `@ng-native/testing`), never a range.
3. **Upgrade the surrounding stack with it** — Expo SDK 58 (`expo ~58.0.25`), React Native
   0.88.1, React 19.3.0, lockfile regenerated; Expo Go 58.0.5 on the emulator to match the SDK.
4. **Accept one source change** for the upgrade: React Native 0.88 types the runnable as
   `AppParameters` with an opaque `RootTag`, so `src/main.ts` no longer annotates `rootTag`.
5. **Require on-device proof**, not just a bundle: 111/111 tests, clean `ngc` typecheck, an
   Android Hermes export, and a cold start that paints on the emulator.

Rejected alternatives:

| Alternative | Why rejected |
| --- | --- |
| Ionic + Capacitor 8.6.2 | Mature, but a WebView UI — the app would stop rendering native views and effectively rewrite its presentation layer. |
| NativeScript Angular 22.0.2 | Native views and an official Angular story, but also a rendering-layer rewrite, with a smaller ecosystem than Ionic and no reuse of the current component code. |
| Expo + React (SDK 58) | First-party and mature, but not Angular: it rewrites the whole app. |
| Freeze on ng-native 0.9.0 | Four weeks behind an alpha that publishes weekly; the known fixes and SDK 58 compatibility would be lost. |

Known cost, accepted: `npm audit` reports 3 moderate findings in Expo's transitive tree; the
suggested fix is a breaking Expo downgrade (TD-09 in the debt register).

## When to use

Read this when someone asks "why are we on an alpha?", proposes a framework switch, or plans a
dependency upgrade. It is the decision; [weather-stack](../context/weather-stack.md) is the
current factual record of versions and verification.

## When not to use

Do not use it to justify upgrading without on-device verification, and do not edit it to record a
newer version — versions belong in `weather-stack.md`. A reversal is a **new ADR** carrying
`supersedes: adr-0001-stay-on-ng-native`, not an edit of this text.

## Examples

The upgrade that this decision authorized (2026-11-13):

```sh
cd apps/weather-radar
npx expo install --check
npm test                       # 111/111
npm run typecheck              # clean
npx expo export --platform android
npm run android                # painted on the pixel AVD, Expo Go 58.0.5
```

A partial `@ng-native/*` bump is the failure mode this decision forbids: the six packages are a
lockstep set, and mixing versions produces duplicate native modules or opaque runtime failures.

## Common mistakes

- **Treating "alpha" as a temporary excuse** — the decision is to manage the alpha (pin exact,
  verify on device), not to pretend it is stable.
- **Upgrading one package** of the lockstep set.
- **Reusing the previous SDK's Expo Go client**, which cannot load the bundle.
- **Reading release velocity as maturity**: thirteen releases in four weeks is activity, not
  stability.
- **Recording the framework decision only in prose** — hence this ADR; the next session should
  not re-litigate it from scratch.

## References

- [adr-index](adr-index.md) — the decision-record hub.
- [weather-stack](../context/weather-stack.md) — current versions, option comparison, upgrade evidence.
- [android-toolchain](../context/android-toolchain.md) — host SDK, emulator and launch path.
- [weather-radar-debt](../context/weather-radar-debt.md) — TD-07 (iOS), TD-09 (audit findings).
- `apps/weather-radar/package.json` — the pinned versions.
