---
last_updated: 2026-11-13
status: active
description: Host Android toolchain (user-local, no sudo), emulator setup, the freeze-proof launcher, and both Expo Go launch-race root causes.
tags: [android, toolchain, emulator, expo-go, launch-race, adb, avd]
version: 1.0
related:
- project
- weather-radar-slice
- weather-stack
- weather-radar-debt
---

# Android Toolchain and Launch Path

## Problem

The app must run on an Android emulator on a host where nothing can be installed system-wide
(no `sudo`). Two separate blank-screen failures also had to be explained before "the app is
broken" could be distinguished from "the launcher is broken". Left undocumented, both the
install steps and the root causes get rediscovered on every cold machine.

## Solution

### Toolchain installed user-local (Option A, no sudo)

As of **2026-10-10** the host carries a full Android toolchain under `$HOME` — nothing outside
the home directory and nothing committed to this repository.

- **cmdline-tools** — Google's official `commandlinetools-linux-16111833_latest.zip` (rev 23.0),
  unzipped to `~/Android/Sdk/cmdline-tools/latest`. Filename + SHA-1
  (`e025545c62a8e64c7559119566a569fb1dec5f60`, 181 052 239 B) verified against Google's
  `repository2-3.xml` manifest before download.
- **SDK packages** (installed via `sdkmanager --install`, licenses accepted non-interactively —
  the new cmdline-tools CLI no longer prompts for `--licenses`): `platform-tools` 37.0.1,
  `platforms/android-36` (API 36, ext. 17), `build-tools/36.0.0`, `emulator` 37.2.12, and
  `system-images/android-36/google_apis/x86_64` r07. Total ~5.6 GB.
- **AVD** — `pixel`, device profile `pixel_7`, target
  `system-images;android-36;google_apis;x86_64`.
- **Acceleration** — `/dev/kvm` present and world-writable on this host
  (`crw-rw-rw- root kvm 10,232`); the user is not in the `kvm` group, but the device node is
  group/world-writable, so KVM is usable without `usermod -aG kvm`. Software GL via SwiftShader
  (no host GPU passthrough).
- **Env** — `ANDROID_HOME` / `ANDROID_SDK_ROOT` plus `cmdline-tools/latest/bin`,
  `platform-tools` and `emulator` on `PATH` are exported from `~/.bashrc` (inserted **above**
  the non-interactive guard, so they apply to non-interactive shells too).

Host versions observed: Node v26.13.1, OpenJDK 27. The app's documented Node floor is 22.18.

### Emulator notes

- The new `sdkmanager` (cmdline-tools ≥ 23) is a thin wrapper over the new `android` CLI: it
  prints a deprecation warning, still accepts the classic semicolon package paths
  (`platforms;android-36`, `build-tools;36.0.0`, `system-images;android-36;google_apis;x86_64`)
  and still writes the classic on-disk layout.
- `/usr/bin/adb` (android-tools 37.0.0) remains installed system-wide; the SDK's
  `platform-tools` (37.0.1) wins on `PATH` once `~/.bashrc` is sourced.
- Expo Go hosts ng-native's custom native modules, so `expo run:android` (a local Gradle dev
  build) is **not** required. It would also be blocked by OpenJDK 27, which is ahead of the AGP
  supported range and cannot be changed without sudo.
- A software-GL emulator can raise its own "System UI isn't responding" dialog; the app's JS tree
  may still be fully painted underneath. Attribute an ANR to the emulator only after reading the
  view tree back, and prefer a GPU-backed device for a clean run.

### The launch path (`scripts/start-android.mjs`)

`npm run android` does not hand the experience to `expo start --android`. It:

1. resolves a device and waits for `sys.boot_completed=1` (2 s poll, 120 s cap, fatal with an
   actionable message);
2. starts Metro and waits for `packager-status:running`;
3. force-stops Expo Go and waits (best-effort, 5 s) for the `host.exp.exponent` PID to disappear;
4. warms the Android bundle, then opens `exp://<auto-detected-LAN-IP>:8081` via `am start`;
5. **verifies** the open — the focused/resumed activity line of
   `adb shell dumpsys activity activities` must name both `host.exp.exponent` and
   `ExperienceActivity` (task-history lines do not count) — and retries up to 3 attempts (20 s
   verify window, 2 s between). Exhausted retries are non-fatal: Metro stays up and the message
   says to re-run.

It is idempotent; re-running it is the recovery path. `npm run android:raw` preserves the legacy
`expo start --android` flow for reference only.

### Launch races (blank screen)

Two distinct failures produced the same symptom — "the app opens but shows nothing". Neither was
app code, and neither implicated ng-native.

**Race 1 — Metro not serving (root-caused 2026-10-10).** `expo start --android` opens the
`exp://…` URL on the device before Metro is serving (the CLI logs `› Opening exp://…`
immediately followed by `Waiting on http://localhost:8081`). Expo Go's native `expo-updates`
then hangs forever on "Checking for new update…" and does not recover even after Metro reports
`packager-status:running` (reproduced: stuck >4 min, empty view tree, no ANR, no fatal crash).
With Metro warm and the experience force-stopped, the same app painted fully in ~12–30 s on the
SwiftShader emulator. **Fix:** the launcher waits for Metro before opening (step 2 above) and the
force-stop/warm sequence removes the hung state.

**Race 2 — Expo Go cold-start intent race (root-caused 2026-10-13).** After the launcher
force-stops Expo Go and re-opens `exp://…`, the intent can dead-land: Expo Go's JS intent-router
is not up yet (`Could not find listener for key: openExperienceActivity` /
`...loadBundleForExperienceActivity`), the `ExperienceActivity` never displays, and the process
freezes with **zero TCP connections** to Metro. `am start` **exits 0 regardless**, so its exit
code proves nothing. The success path logs
`Displayed host.exp.exponent/.experience.ExperienceActivity for user 0: +460ms`; the dead-land
path never logs a `Displayed` line. **Fix:** verified open + bounded retry (step 5 above), plus
the boot-completed and process-death waits. Measured **5/5 launches painted** (2 fresh + 3
immediate re-runs; each re-run dead-landed on attempt 1 and self-healed on attempt 2).

### Verification history

- **2026-10-10** — cold boot of the `pixel` AVD, Android 16 / API 36, boot completed in 32 162 ms;
  the app bundled (8890 ms, 1261 modules) and painted. This run quoted the *historical* radar UI,
  removed on 2026-11-12; only the boot and launch-race conclusions still apply.
- **2026-10-13** — 5/5 launches painted after the intent-race fix; 24/24 tests at that time.
- **2026-11-12** — the reduced weather screen booted in ~63 s and was read back with
  `uiautomator dump`; the emulator raised its own System UI ANR during the run (see notes above).
- **2026-11-13** — the 0.22.2 / SDK 58 build painted on the Expo Go 58.0.5 client, including the
  live Open-Meteo document with the DEV constant set.

## When to use

Read this when setting up a new host, when `npm run android` produces a blank screen, when `adb`
or the emulator misbehaves, or when a run must be evidenced on-device. It is the archaeology
behind the freeze-proof launcher; the launcher's code is the current truth.

## When not to use

Do not use it as the frame to upgrade frameworks (that is [weather-stack](weather-stack.md)) or
as the data-path runbook (that is the [pc-pull runbook](../protocols/pc-pull-runbook.md)). Do not
copy the host-specific `$HOME` paths into CI: nothing here is committed by design.

## Examples

```sh
emulator -list-avds                 # pixel
adb devices                         # emulator-5554  device
cd apps/weather-radar
npm run android                     # freeze-proof launcher; re-run to recover
adb shell uiautomator dump /sdcard/ui.xml && adb shell cat /sdcard/ui.xml
```

A dead-land diagnosis, in one command:

```sh
adb shell dumpsys activity activities | grep -E 'mResumedActivity|topResumedActivity'
# success: names host.exp.exponent AND ExperienceActivity
# dead-land: no such line, even though `am start` exited 0
```

## Common mistakes

- **Reading `am start`'s exit code as proof of launch** — it exits 0 on the dead-land path; only
  the resumed-activity line and a `Displayed` log line prove the experience opened.
- **Blaming the app or ng-native for a blank screen** — both races are launcher/Expo Go issues;
  a Metro-warm manual open paints the same build.
- **Killing Metro between attempts** — the recovery path expects Metro to stay up; the launcher
  is idempotent on purpose.
- **Using a Gradle dev build as the workaround** for a launch race: it is blocked by OpenJDK 27
  and unnecessary, since Expo Go hosts the native modules.
- **Taking the emulator's own System UI ANR as an app crash** without reading the view tree back.

## References

- [weather-stack](weather-stack.md) — versions and the SDK 58 / ng-native 0.22.2 upgrade.
- [pc-pull runbook](../protocols/pc-pull-runbook.md) — `adb reverse` and the live-data path.
- [weather-radar-debt](weather-radar-debt.md) — TD-07 (iOS unverified), TD-11 (GPU-backed re-run).
- `apps/weather-radar/scripts/start-android.mjs` — the launcher this note explains.
