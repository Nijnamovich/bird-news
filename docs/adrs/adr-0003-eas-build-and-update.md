---
id: adr-0003-eas-build-and-update
category: adrs
tags:
- adr
- distribution
- eas
- ota
- android
- apk
- release
aliases:
- ADR-0003
- EAS Build and Update
related:
- adr-index
- weather-radar-debt
- release-and-update-runbook
version: 1.0
status: active
---

# ADR-0003: EAS Build and EAS Update for Android Distribution

## Problem

`apps/weather-radar/` has only ever run inside **Expo Go**, hosted by Metro on a development
machine. Installing it as a standalone app on the phone needs a signed native binary, and that
binary then needs a lifecycle: a way to fix JS without rebuilding, a version identity the phone
can reason about, and a signing key that survives. One constraint decides the build route:
`expo run:android` (a local Gradle build) is **blocked on the authoring host by OpenJDK 27**,
which is ahead of the Android Gradle Plugin's supported range — recorded in
[android-toolchain](../context/android-toolchain.md).

The distribution target is narrow: one personal Android phone, no Play Store listing, no public
release, no iOS.

## Solution

**Adopt EAS Build (cloud) for binaries and EAS Update (OTA) for JS changes; internal distribution
only.**

Decisions, itemized:

1. **Build in the cloud, not locally.** The local Gradle path is unavailable for an environmental
   reason (OpenJDK 27 on the authoring host), and that is the *reason* for the choice — not a
   defect to repair first. Fixing the host toolchain would not change the distribution model.
2. **Internal distribution only.** `eas.json` declares `build.preview` with
   `distribution: "internal"`, `android.buildType: "apk"` and `channel: "preview"`. Nothing is
   submitted to the Play Store; `submit.production` is an empty stub. The `production` profile
   exists as an `app-bundle` target but is unused today.
3. **APK, not AAB, for the phone.** An AAB is a Play Store upload format; a phone installs an APK.
   The `preview` profile therefore builds `android.buildType: "apk"`.
4. **Channel → branch.** A build's `channel` selects which EAS Update branch it reads. The first
   publish to a branch of the same name wires the pair: `channel: "preview"` → branch `preview`,
   `channel: "production"` → branch `production`. Publishing to a branch no build listens on
   reaches no phone.
5. **`runtimeVersion` follows `expo.version`.** `apps/weather-radar/app.json` sets
   `runtimeVersion: { "policy": "appVersion" }`, so the runtime identifier is derived from
   `expo.version` (`"1.0.0"`), **not** from `android.versionCode`. An update is only served to a
   binary whose runtime version matches; a native change that does not bump `expo.version`
   publishes under the old runtime, so it reaches binaries whose native layer no longer matches
   the update.
6. **OTA covers JavaScript, not native code.** It can change JS logic, styling and layout, copy and
   translations, images/assets the binary already references, and bug fixes. It **cannot** change
   native code or native dependencies, app permissions, the Expo SDK version, or anything that
   requires a new binary (`https://docs.expo.dev/eas-update/introduction/`).
7. **A binary without `updates.url` still starts.** Verified against the installed
   `expo-updates ~58.0.22`: `UpdatesConfiguration.kt` returns `INVALID_MISSING_URL` when
   `updates.url` is absent; `UpdatesController.kt` then logs "The expo-updates system is disabled
   due to an invalid configuration. Ensure a valid URL is supplied." and instantiates
   `DisabledUpdatesController`, which loads the embedded update; `build/Updates.js` documents
   `isEnabled === false` for a "missing or invalid URL in configuration" and that "the embedded
   update is loaded". `updates.enabled` itself defaults to `true` (`getIsEnabled` → `?: true`), so
   the missing URL is what disables updates — **no `updates.enabled: false` is required**. A
   release APK built before `updates.url` exists runs the bundled JS and simply cannot receive OTA.
8. **The signing keystore lives on Expo's servers.** `eas credentials` downloads/backs it up. If
   it is lost and no backup exists, a build with the same signature cannot be recreated: the phone
   must uninstall the app — losing its on-device snapshot — and install a new-signature APK. OTA
   publishing itself does not use the Android keystore.
9. **Free-tier caveats, per Expo's pricing page fetched 2026-11-13 — not independently
   re-verified.** EAS Build free: 15 Android + 15 iOS builds/month, low-priority queue (waits can
   reach 90+ minutes), 45-minute build timeout, hard cap with no overage billing. EAS Update free:
   1,000 MAU/month, 100 GiB bandwidth, 20 GiB storage, unlimited update publishes (billing counts
   MAU, not publishes), hard cap with no overage. This fits a one-phone app; it is not an SLA.
10. **The EAS project is not initialized yet.** `apps/weather-radar/app.json` declares
    `version: "1.0.0"`, `runtimeVersion.policy: "appVersion"`,
    `android.package: "com.nijnamovich.weather"` and `android.versionCode: 1`, but has **no**
    `extra.eas.projectId` and **no** `updates.url`; `eas.json` is present with
    `cli.appVersionSource: "local"`. `eas init` and `eas update:configure` are interactive and need
    a human login, so no APK has been built. Tracked as **TD-13**; the steps are in the
    [release runbook](../protocols/release-and-update-runbook.md).

Rejected alternatives:

| Alternative | Why rejected |
| --- | --- |
| Local Gradle build (`expo run:android` / EAS `--local`) | Blocked on the authoring host by OpenJDK 27 vs. the AGP range; a working local toolchain would also make the operator responsible for a signing key and a build box. |
| Play Store internal testing | Adds a store listing, a developer account and store review for an app that is never distributed publicly; an APK side-load covers one phone with less surface. |
| Expo Go as the permanent distribution | Expo Go needs a reachable Metro dev server and a matching client version; it is a development host, not an installed app, and it cannot run a bundled production build offline. |
| Rebuilding an APK for every JS change | Each text fix would cost a queue wait and one of 15 monthly builds; OTA exists precisely to publish JS in seconds without touching the binary. |
| A self-hosted update server | An extra always-on service and TLS hostname to serve what EAS Update already serves; no requirement justifies it. |

## When to use

Read this before building, before deciding whether a change can ship as an update or needs a new
APK, and before changing `app.json` fields that affect the runtime identity. The commands are in
the [release runbook](../protocols/release-and-update-runbook.md); this record carries the choice
and its limits.

## When not to use

Do not use this record as a build tutorial — it deliberately contains no interactive steps. It does
not cover iOS: iOS is declared in `app.json` and has never been built (TD-07). Do not read it as
approval for a public release or a Play Store submission: distribution is internal, to one phone.

## Examples

What this decision means for a change:

- **Copy fix, layout tweak, JS bug** — publish an update:
  `npx eas-cli@latest update --channel preview --environment preview --message "…"` (the
  `--environment` flag is required on SDK 55+). No binary, no version bump.
- **New permission, new native dependency, SDK upgrade, any native `app.json` field** — bump
  `expo.version` **and** `android.versionCode`, then build a new APK. Shipping the same JS as an
  update instead would target the old runtime and reach nobody.
- **First install** — after a human runs `eas init` and `eas update:configure`, build the
  `preview` profile and side-load the APK. `updates.url` must exist **before** that build, because
  it is baked into the native binary.
- **A bad update** — `npx eas-cli@latest update:rollback <group-id>` republishes the previous
  update group; the phone picks it up on the next cold start. Republishing, not deleting.

## Common mistakes

- **Building before `eas update:configure`.** The APK bakes in no `updates.url`, updates stay
  disabled (item 7), and OTA can never reach that binary — a rebuild is the only fix.
- **Bumping only `android.versionCode` for a native change.** `runtimeVersion` comes from
  `expo.version` under the `appVersion` policy; the update targets a runtime that does not exist.
- **Adding `updates.enabled: false` "so it still runs".** Unnecessary — a missing URL already
  yields the embedded update, as verified above.
- **Publishing to a branch no build listens on.** A build reads its profile's channel; a publish to
  an unrelated branch is silent.
- **Assuming a rollback deletes the bad update.** It republishes an earlier group; history remains.
- **Treating the free tier as capacity planning.** 15 builds/month and a 90-minute queue are hard
  limits, not a target.

## References

- [adr-index](adr-index.md) — the decision-record hub.
- [ADR-0004 — GitHub Pages for snapshots](adr-0004-github-pages-for-snapshots.md) — where the app
  reads its data from.
- [release-and-update-runbook](../protocols/release-and-update-runbook.md) — login, init,
  configure, build, update, rollback, credentials.
- [weather-radar-debt](../context/weather-radar-debt.md) — TD-13 (project not initialized), TD-07
  (iOS unverified).
- [android-toolchain](../context/android-toolchain.md) — the OpenJDK 27 / AGP constraint.
- `apps/weather-radar/app.json`, `apps/weather-radar/eas.json` — the declared identity and profiles.
- `https://docs.expo.dev/eas-update/introduction/` — what OTA can and cannot change.
- `https://expo.dev/pricing` — free-tier limits, fetched 2026-11-13, not independently re-verified.
