---
last_updated: 2026-11-12
status: current
description: Stack check for ng-native/Expo, Android widget feasibility, and the JDK 27 build blocker.
tags: [weather, widget, android, ng-native, expo, gradle, jdk]
---

# Widget and stack

## 1. Stack check

The app is on **ng-native 0.9.0** (published 2026-10-09) with **Angular 22**,
**Expo SDK 57** (`expo ~57.0.26`) and **React Native 0.86.3**. The newest
ng-native on npm today is **0.22.2** (published 2026-11-06): **13 releases in
four weeks**, on the same alpha line. That is velocity, not a new product — but
it does mean 0.9.0 is four weeks behind a fast-moving alpha.

There is also a newer Expo: **58.0.25** (SDK 58, 2026-10-15, React Native 0.88).
ng-native 0.9.0's own peer set targets SDK 57.

**Angular has no first-party mobile / React Native integration** as of today.
"Angular Native" (ng-native) is an independent, community, **alpha** project; it
is not endorsed by Google, the Angular team, or Expo. Any option below that
renders Angular on a phone is either that project or a third-party bridge.

| Option | Angular 22 support | Character | Android-widget path |
| --- | --- | --- | --- |
| **ng-native** (current 0.9.0, latest 0.22.2) | Yes — the current app is Angular 22 on 0.9.0 | Alpha, community; renders Angular templates to **real native views**, no WebView; smallest ecosystem; fast release cadence | `expo prebuild` dev build + a native Kotlin `AppWidgetProvider`. The bundled `@ng-native/expo/widget` wrapper is **iOS-only**, so on Android it does nothing |
| **Ionic + Capacitor 8.6.2** | Yes — Angular is a first-class Ionic framework | Mature, WebView UI, very large ecosystem and docs; feels like a web app, not a native one | Capacitor Android project + native Kotlin `AppWidgetProvider` (or a community widget plugin); always an APK |
| **NativeScript Angular 22.0.2** | Yes — official Angular integration in the 22.0.2 line | Native views, no WebView, mature Angular story; smaller community than Ionic | Native Android project + Kotlin `AppWidgetProvider`, bridged through a NativeScript plugin; APK |
| **Expo + React** (SDK 58) | No — React, not Angular | First-party Expo/RN, best widget story today, huge ecosystem; would mean rewriting the UI in React | **`expo-widgets`** with `enableAndroid: true` (first-party since SDK 58); still requires a dev build, not Expo Go |

The current choice — ng-native — remains the only one that keeps the existing
Angular code and renders native views. Switching to Ionic or NativeScript is a
rewrite of the rendering layer; switching to Expo + React is a rewrite of the
app.

## 2. Recommendation

**Stay on ng-native 0.9.0 for this pass.** The UI reduction is already a large,
reviewable diff: a new screen, a new contract layer, a validator, a cache, **two**
providers (`fixture` and `pc-pull`), and the deletion of the radar files.
Upgrading an alpha framework **and** an Expo SDK in the same change would make
the diff unreviewable: every rendering regression would be ambiguous between
"the reduction" and "the upgrade".

Plan a **separate upgrade pass** afterwards: ng-native **0.22.2** + Expo **SDK
58** (React Native 0.88), with its own verification (boot on the emulator,
`npm test`, `npm run typecheck`, and a bundle export). Do not fold it into the
weather work.

## 3. Widget feasibility, plainly

An Android home-screen widget is **not** a JavaScript feature. It requires:

- a real **APK** (a development or release build), installed on the device;
- an `AppWidgetProvider` subclass declared in `AndroidManifest.xml`;
- one or more `RemoteViews` layouts;
- a data path the provider can read without running the JS app.

**Expo Go cannot ship a widget.** It hosts a JS bundle inside a fixed native
container; it cannot add a manifest entry, a provider class or a `RemoteViews`
layout. Any widget plan starts with a dev build / prebuild.

Two routes are viable from the current codebase:

**(a) Stay on ng-native 0.9.0 → prebuild + a small Kotlin widget.**
Run `expo prebuild` to generate the `android/` project, build a development APK,
then add a Kotlin `AppWidgetProvider` plus `WorkManager` that reads a snapshot
file the app wrote. ng-native's own `@ng-native/expo/widget` is iOS-only, so
Kotlin is unavoidable on Android. Cost: one small native module, one manifest
entry, one layout, one worker — **plus the persistence the app does not have
yet**: the cache is in memory only, so writing the snapshot to a stable file path
is the first task of this route.

**(b) Move to Expo SDK 58 + `expo-widgets`.**
`expo-widgets` is first-party and gained **Android** support in SDK 58
(`enableAndroid: true` plus `android.package`). It still requires a **dev build
or prebuild** — not Expo Go — and it pulls the SDK 58 / RN 0.88 upgrade forward.
Cost: the whole stack upgrade, then the widget config. Benefit: first-party
API and no hand-written Kotlin provider.

For *this* pass neither route ships. The app can show its in-memory snapshot and
an age badge; the widget waits for the build work in §4 and for snapshot
persistence.

## 4. Build blocker on this host

The authoring host has **OpenJDK 27 only** (`/usr/lib/jvm/java-27-openjdk`), and
that blocks the standard Android build:

- Latest stable **AGP 9.5.1** pins **Gradle 9.6.0**, which supports running on
  **Java ≤ 26**. Gradle only supports Java 27 from **9.8.0**.
- The **Expo / React Native Android template still recommends JDK 17**.
- The host has **no Gradle**, **no SDKMAN**, **no Android Studio JBR**, and the
  distro is Arch-like — `apt-cache` has no `openjdk-21`.

So "just run the Gradle build" fails before it starts. There is, however, a
**no-sudo path** that avoids touching the system JDK:

```sh
# 1. Fetch a Temurin JDK 17 tarball (no sudo, no package manager)
mkdir -p ~/.local/jdk-17
# download + extract the Temurin 17 Linux x64 tarball into ~/.local/jdk-17

# 2. Point this shell (and CI) at it
export JAVA_HOME="$HOME/.local/jdk-17"
export PATH="$JAVA_HOME/bin:$PATH"
java -version   # must print 17.x

# 3. Generate the Android project and build with its Gradle wrapper
cd apps/weather-radar
npx expo prebuild --platform android
cd android && ./gradlew assembleDebug
```

The **Gradle wrapper comes from the generated `android/` project**, so no system
Gradle is needed. This path is **viable without sudo; it has not yet been
executed on this host** — treat it as a verified-feasibility plan, not a result.

## 5. What not to promise

- **No widget without an APK build.** Expo Go cannot host an `AppWidgetProvider`.
- **No background refresh in Expo Go.** Revalidation happens on cold start only
  in this version (resume and pull-to-refresh are follow-ups); a widget worker is
  a separate native concern.
- **No sub-30-minute widget updates.** `updatePeriodMillis` has a hard floor of
  `1800000` ms; `WorkManager` periodic work has the same 30-minute minimum.
- **No guaranteed tick.** Doze and battery optimisation can defer widget work.
  The widget must show **last-known-good with an age badge**, never an empty
  frame or a spinner that may never resolve.
- **No "Angular-native widget API" on Android.** ng-native's widget wrapper is
  iOS-only today; on Android the provider is Kotlin until route (b) is taken.
