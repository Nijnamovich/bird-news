# bird-news

## Purpose
Destination repository for security research outputs produced by the
`opencode` agent system, and — as of 2026-10-10 — also the home of a
**read-only mobile application** demo.

Two kinds of content live here:

- **Documentation** — the static security-audit reports under
  `docs/security-audits/` (the repository's **original deliverable**), plus,
  since 2026-11-12, the weather snapshot contract under `docs/api/` and the
  weather design notes under `docs/weather/`.
- **Application source** — a minimal, **read-only weather app for Necochea**
  under `apps/weather-radar/` (see "Slices"): current conditions, a 24-hour
  forecast and a 7-day forecast. The earlier WetterOnline "Weather & Radar"
  visual clone — radar map, layer panel,
  legend, webcam sheet, timeline, synthetic radar field and the WetterOnline
  config service — was removed in the 2026-11-12 reduction.

Both are DEFENSIVE in intent. The app is a **personal/educational,
read-only demonstration only**: no public release, no redistribution, no
premium/paywall bypass; vendor ToS and rate limits are respected.

## Stack / commands
Two stacks coexist; **there is NO build at the repository root**.

**Documentation** — Markdown + copied evidence files only. No build.

**App** (`apps/weather-radar/`) — **Angular Native** (ng-native 0.22.2) on
**Expo SDK 58** (`expo ~58.0.25`) / **React Native 0.88.1** (New Architecture) /
**Angular 22** / **React 19.3.0**. Target platform exercised: **Android** (iOS
assets exist in the template, but this demo is only exercised for Android).

The stack was upgraded from ng-native 0.9.0 / SDK 57 / RN 0.86 on 2026-11-13;
`docs/weather/stack-and-upgrade.md` records the lineage and the verification.

> ⚠️ **Never run commands from the repository root** — there is no root
> `package.json`. Run every app command from the
> **`apps/weather-radar/`** package directory.

Canonical app commands (all run from `apps/weather-radar/`):

- `npm test` — vitest (hermetic, Node, no emulator needed)
- `npm run typecheck` — Angular AOT typecheck (`node metro.config.js && ngc -p tsconfig.json --noEmit`)
- `npm start` / `npm run android` — Metro / Android via Expo Go or emulator
  (`android` = freeze-proof launcher `scripts/start-android.mjs`; see
  "Android launch path (2026-10-10)" below. `npm run android:raw` keeps the
  legacy `expo start --android` behavior)
- `npx expo export --platform android` — produce the Android Hermes bundle
  (a build/CI proof that needs no physical device)

Node requirement: **≥ 22.18** (the ng-native documented floor; its own dev
environment uses Node 24). Toolchain present on the authoring host: Node
v26.13.1, OpenJDK 27.

### Android toolchain on this host (Option A, user-local, no sudo)

As of **2026-10-10** the host **does** carry a full Android toolchain,
installed **without sudo** under `$HOME` (nothing outside the home
directory, nothing committed to this repo):

- **cmdline-tools** — Google's official
  `commandlinetools-linux-16111833_latest.zip` (rev 23.0), unzipped to
  `~/Android/Sdk/cmdline-tools/latest`. Filename + SHA-1
  (`e025545c62a8e64c7559119566a569fb1dec5f60`, 181 052 239 B) verified
  against Google's `repository2-3.xml` manifest before download.
- **SDK packages** (installed via `sdkmanager --install`, licenses accepted
  non-interactively — the new cmdline-tools CLI no longer prompts for
  `--licenses`): `platform-tools` 37.0.1, `platforms/android-36` (API 36,
  ext. 17), `build-tools/36.0.0`, `emulator` 37.2.12, and
  `system-images/android-36/google_apis/x86_64` r07. Total ~5.6 GB.
- **AVD** — `pixel`, device profile `pixel_7`, target
  `system-images;android-36;google_apis;x86_64`.
- **Acceleration** — `/dev/kvm` present and world-writable on this host
  (`crw-rw-rw- root kvm 10,232`); the user is not in the `kvm` group but
  the device node is group/world-writable, so KVM is usable without
  `usermod -aG kvm`. Software GL via SwiftShader (no host GPU passthrough).
- **Env** — `ANDROID_HOME` / `ANDROID_SDK_ROOT` +
  `cmdline-tools/latest/bin`, `platform-tools`, `emulator` on `PATH` are
  exported from `~/.bashrc` (inserted **above** the non-interactive guard,
  so they apply to non-interactive shells too).

**Verified end-to-end on 2026-10-10** (cold boot, `-no-window
-no-audio -no-snapshot -accel on -gpu swiftshader_indirect`):

> **Historical — the UI quoted below was the WetterOnline radar clone, removed
> on 2026-11-12.** The boot, bundling and launch-race conclusions still hold;
> the screens quoted do not describe today's app.

```
$ emulator -list-avds
pixel
$ adb devices
emulator-5554   device            # Android 16 / API 36
# Boot completed in 32162 ms
$ cd apps/weather-radar && npm run android      # freeze-proof launcher (waits for Metro)
Metro bundler started; Android Bundled 8890ms src/main.ts (1261 modules)
Expo Go (host.exp.exponent) installed on the emulator automatically
# In-app UI, read back via `adb shell uiautomator dump`  [radar UI — removed 2026-11-12]:
  "Weather Radar (read-only)" / "Public GET only · no data sent · personal/educational use"
  "Load live radar config"  ->  "source: radar.wo-cloud.com/config/config.json (HTTP 200, live GET)"
  layers turned ON: Lightning, Lightning realtime overlay, Webcams, Precipitation, Temperature, Gust
  "Radar map — MOCK (not live) / FICTIONAL"  (unchanged, as designed)
```

So on-device boot is **directly evidenced** by an emulator run (historical: for
the radar UI), in addition to the Android Hermes bundle, typecheck and unit
tests. Expo Go does host the ng-native custom native modules, so
`expo run:android` (a local Gradle dev build) is **not** required — note that it
would also have been blocked by OpenJDK 27, which is ahead of the AGP supported
range and cannot be changed without sudo.

### Android launch path (2026-10-10) — freeze root-caused and fixed

On 2026-10-10 the app was reported as **frozen / blank on the emulator**
("no muestra nada"). Root cause was **not** the app code and **not**
ng-native 0.9.0:

- **Expo Go launch race.** `expo start --android` opens the `exp://…`
  URL on the device **before Metro is serving** (observed: the CLI logs
  `› Opening exp://192.168.0.205:8081` immediately followed by
  `Waiting on http://localhost:8081`). Expo Go's native `expo-updates`
  then hangs **forever** on "Checking for new update…"; it does not
  recover even after Metro reports `packager-status:running`
  (reproduced: stuck >4 min with the spinner and an empty view tree,
  then the human dismissed the app after ~100 s). No ANR, no fatal
  crash, no Fabric/ng-native error anywhere in `logcat`.
- **App exonerated.** With Metro warm and the experience force-stopped,
  the same app **paints fully in ~12–30 s** on the SwiftShader emulator
  (`adb shell uiautomator dump` shows the whole UI) and the then-live GET to
  `https://radar.wo-cloud.com/config/config.json` returned **HTTP 200** —
  verified on-device twice. (Historical: that config endpoint was removed with
  the radar clone on 2026-11-12.)
- **Fix.** `npm run android` now runs `scripts/start-android.mjs`: it
  starts Metro, **waits** for `packager-status:running`, force-stops any
  hung Expo Go/`expo-updates` state, warms the Android bundle, then opens
  `exp://<auto-detected-LAN-IP>:8081` via `am start`. It is idempotent —
  re-running it is the recovery path. `npm run android:raw` preserves the
  legacy `expo start --android` flow for reference.
- **Framework verdict.** ng-native 0.9.0 alpha is **not** implicated;
  no fallback-stack change was made (rebuild-from-scratch was judged
  unnecessary: the app renders correctly once the launch race is gone).

#### 2026-10-13 update — cold-start intent race (second blank-screen class)

A **second, distinct** blank-screen class — `npm run android` leaves the app
open but blank, intermittently — was root-caused on 2026-10-13 (AVD `pixel`,
API 36).

- **Root cause.** An **Expo Go cold-start intent race**, not the app code, not
  ng-native, not the staged UI work. After the launcher force-stops Expo Go and
  re-opens `exp://…`, the intent can dead-land: Expo Go's JS intent-router is
  not up yet (`Could not find listener for key: openExperienceActivity` /
  `...loadBundleForExperienceActivity`), the `ExperienceActivity` never
  displays, and the process freezes in the background with **zero TCP
  connections** to Metro. `am start` **exits 0** regardless — its exit code
  proves nothing. The success path logs `Displayed
  host.exp.exponent/.experience.ExperienceActivity for user 0: +460ms`; the
  dead-land path never logs a `Displayed` line.
- **Fix** (`scripts/start-android.mjs`, +117/−17). `resolveDevice` waits for
  `sys.boot_completed=1` (2 s poll, 120 s cap, fatal + actionable message);
  `forceStopExpoGo` waits (best-effort, 5 s) for the `host.exp.exponent` PID to
  disappear; `openExperience` **verifies** the open — the focused/resumed
  activity line of `adb shell dumpsys activity activities` must name both
  `host.exp.exponent` and `ExperienceActivity` (task-history lines do NOT
  count) — and retries `am start` up to 3 attempts (20 s verify window, 2 s
  between). Exhausted retries are **non-fatal**: Metro stays up and the message
  tells the user to re-run (the launcher stays idempotent).
- **Verification.** On-device **5/5 launches painted** (2 fresh + 3 immediate
  re-runs; each re-run dead-landed on attempt 1 and **self-healed on attempt
  2**). `npm test` 24/24, `npm run typecheck` clean, `npx expo export
  --platform android` bundles (1287 modules). *Historical UI note (removed
  2026-11-12):* the `uiautomator dump` that proved painting quoted the radar
  clone — wordmark "Weather Radar", Legend/Radar layers/Webcams, timeline
  now/today/tomorrow/+3 d/+4 d/−24 h, "50 km" scale, "Simulated data ·
  read-only demo". That chrome is gone; only the launch-race finding remains
  current.

Notes:

- The new `sdkmanager` (cmdline-tools ≥ 23) is a thin wrapper over the
  new `android` CLI: it prints a deprecation warning, still **accepts the
  classic semicolon package paths** (`platforms;android-36`,
  `build-tools;36.0.0`, `system-images;android-36;google_apis;x86_64`) and
  still writes the classic on-disk layout.
- `/usr/bin/adb` (android-tools, 37.0.0) remains installed system-wide;
  the SDK's `platform-tools` (37.0.1) wins on `PATH` once
  `~/.bashrc` is sourced.

### Reduced weather screen (2026-11-12) — booted and read back

The reduced screen was booted on the `pixel` AVD (API 36, SwiftShader) with
`npm run android` and read back via `adb shell uiautomator dump`; it painted in
about 63 s:

```
Necochea / Parcialmente nublado / 19° / Sensación 18° / Viento 14 km/h SE /
Humedad 72% / "Datos de ejemplo · sin conexión" · hace 11 h /
Próximas horas (24 cards: 12:00 19° 10%, 13:00 20° 10%, …) /
Próximos 7 días (jue 12 11°/21°, vie 13 10°/22°, sáb 14 12°/23°, dom 15 13°/24°, …)
```

`npm test` 85/85, `npm run typecheck` clean, `npx expo export --platform android`
bundles (1099 modules → 3.5 MB / 3 532 252 B Hermes). Recorded honestly: during
that run the software-GL emulator raised a "System UI isn't responding" dialog
and its own `FATAL EXCEPTION: main` is in `logcat` at that moment; the app's JS
modules had loaded and the full tree above painted, so it is attributed to the
emulator's System UI, not the app. A re-run on a GPU-backed device is still the
way to close that caveat.

The `webcam-sheet.component.ts` file that produced the old `NG0318
[style.transform]` dev-startup warning was deleted in the same reduction, so
that warning cannot occur any more.

### Stack upgrade (2026-11-13) — 0.22.2 / SDK 58 booted

All six `@ng-native/*` packages (five runtime plus `@ng-native/testing`) moved to **0.22.2** in lockstep, `expo` to
`~58.0.25`, `expo-system-ui` to `~58.0.7`, `react-native` to `0.88.1` and
`react` to `19.3.0` (the version Expo SDK 58 pins, checked with
`npx expo install --check`); `package-lock.json` was regenerated. One source
change was needed: React Native 0.88 types `AppRegistry.registerRunnable`'s
runnable as `AppParameters` with an opaque `RootTag`, so `src/main.ts` no longer
annotates `rootTag` by hand.

Verification (2026-11-13): `npm test` **111/111**, `npm run typecheck` clean,
`npx expo export --platform android` bundles (1129 modules → 4 MB Hermes), and a
cold start on the `pixel` AVD (API 36) with the **Expo Go 58.0.5** client
painted the reduced screen. With `DEV_HTTP_BASE_URL` temporarily pointing at the
local producer, the same build rendered the live Open-Meteo document
("Actualizado", 15 °C, 89 % humidity, 24 hour cards, 7 day rows); the constant
was restored to `''` afterwards. The 57.0.9 client was replaced on the emulator
with 58.0.5 (SHA-256 `d979cf81c56c5432c5aa69adc9497521ee72d1f87e92eee33bc949167a40f1a6`)
because Expo Go must match the project's SDK.

### Read-only network contract (app)
The app is **read-only by construction**: HTTP **GET** only; no request
bodies, cookies, `Authorization`, device identifiers, or user-data query
parameters.

- There are **zero live endpoints by default**: with `PULL_BASE_URL` empty the
  app renders a bundled `fixture` snapshot and makes no network request. The
  last-known-good copy is **in memory, for the session only** — there is no
  on-device persistence in this version.
- The optional `pc-pull` provider performs one unauthenticated, zero-parameter
  `GET` of `https://<stable-host>/weather/necochea/v1/latest.json` (a static
  JSON snapshot), on **cold start only** in this version; resume and
  pull-to-refresh revalidation are follow-ups. It can send
  `If-None-Match: "<snapshotId>"` for the document it already holds and keeps
  that document on `304` — wired and server-verified, but not reachable in this
  version, because the only document held at first paint is the fixture.
  Redirects are refused, and `PULL_BASE_URL` must be `https://`.
- `phone-scrape` is **not implemented**: a plain on-device GET to the
  AccuWeather page returned **HTTP 403** (access denied) on 2026-11-12; see
  `docs/weather/data-sources.md`.
- The WetterOnline radar/webcam endpoints are **removed** and no longer
  referenced anywhere (config GET, nowcast, warnings, webcam).
- The audit's forbidden hosts are **never** contacted: the unattributed
  `geovis` AWS Lambda (`*.lambda-url.eu-central-1.on.aws/geovis`), Elastic
  APM (`*.apm.*.cloud.es.io`), and `tiles.*/analytics` telemetry.

Full inventory, each justified: `apps/weather-radar/ENDPOINTS.md`.

### Documentation map
- `docs/api/openapi.weather-snapshot.yaml` — canonical `WeatherSnapshot`
  contract, v1.0.0 (OpenAPI 3.1).
- `docs/weather/` — how the data gets updated (`data-sources.md`), the
  produce → serve → `adb reverse` → named-tunnel steps (`pc-pull-runbook.md`),
  the keep/rewrite/delete inventory (`prune-inventory.md`), and the
  stack/upgrade note (`stack-and-upgrade.md`).
- `docs/security-audits/` — the original static audit deliverable.

## Metadata
- doc_language: en
- repo created: 2026-10-10
- initial content: static security audit of a modded Android APK, produced
  with the REA toolkit (morluto/rea) as the analysis engine.
- 2026-10-10: added application source (`apps/weather-radar/`), derived
  from that audit's §8 endpoint inventory. Framework verified as
  **ng-native 0.9.0** (alpha, actively developed; Angular 22 / Expo 57 /
  React Native 0.86 / Node ≥22.18 confirmed against the live repo).
- 2026-10-10: **Android toolchain installed locally (no sudo)** and the
  app **booted on an emulator** — see "Android toolchain on this host"
  above. Supersedes the earlier "no emulator on this host" statement.
- 2026-10-10: **blank-screen freeze root-caused** to the Expo Go
  launch race (`expo start --android` opening the experience before
  Metro is serving → `expo-updates` hangs on "Checking for new
  update…"); ng-native 0.9.0 exonerated by direct on-device evidence.
  `npm run android` now runs the freeze-proof launcher
  (`scripts/start-android.mjs`, waits for Metro → force-stop → bundle
  warm → open); see "Android launch path (2026-10-10)" above.
- 2026-10-13: **second blank-screen class root-caused** — an Expo Go
  cold-start intent race in which `am start` exits 0 yet the experience never
  displays — and fixed in `scripts/start-android.mjs` with verify-open +
  bounded retry plus boot-completed and process-death waits. On-device 5/5
  launches painted (3/3 re-runs self-healed); see the "2026-10-13 update"
  sub-block above.
- 2026-11-12: **scope reduced** — the WetterOnline radar visual clone (radar
  map, layer panel, legend, webcam sheet, timeline, synthetic radar field,
  radar products, config service) was removed, together with
  `design-tokens.ts` and the condition-text mapping that only served it; the app
  is now a minimal current / 24 h / 7 d weather screen. Added the
  provider-agnostic snapshot contract **v1.0.0**
  (`docs/api/openapi.weather-snapshot.yaml`) and the weather docs
  (`docs/weather/`). Strategy evidence: a plain GET to the AccuWeather page
  returned **HTTP 403** (access denied, 436 B, zero `__NEXT_DATA__`, zero
  `application/ld+json`), so `pc-pull` is the recommended production mode and
  `phone-scrape` stays unimplemented. The app ships with `PULL_BASE_URL` empty,
  so it renders the fixture and makes zero requests. On-device boot of the
  reduced screen is **pending** (`expo export` proves bundling only).
  `docs/security-audits/**` remains the repository's original deliverable:
  a one-page static-audit summary, with the full evidence preserved in git
  history at commit `ce4ca74`.
- 2026-11-13: **pc-pull made usable without a tunnel and the stack upgraded.**
  Added a zero-dependency producer (`scripts/weather-produce.mjs`, Open-Meteo,
  keyless, HTTP 200 verified; AccuWeather HTML stayed 403 so its adapter is a
  disabled seam), a contract-faithful static server with ETag/304, the
  DEV-only `DEV_HTTP_BASE_URL` constant (empty by default; `PULL_BASE_URL`
  remains `''` or `https://` only) and
  `docs/weather/pc-pull-runbook.md` (produce → serve → `adb reverse` → live
  badge → named Cloudflare tunnel later). Live data verified on the emulator.
  Upgraded to `@ng-native/* 0.22.2` + Expo SDK 58 / RN 0.88.1 / React 19.3.0
  and removed the last references to that dropped feature, and the audit
  directory is now one ~50-line summary with its evidence in git history.

## Slices
| Slice | Description | Entry points | Primary agents |
| --- | --- | --- | --- |
| weather-radar-app | Personal read-only Necochea weather app (current/24h/7d); provider-agnostic snapshot contract (`docs/api/`) with design notes in `docs/weather/` | `apps/weather-radar/` | coder (angular), reviewer |

## Notes
- Analysis artifacts (APK copies, tool installs) live outside this repo, in
  `/tmp/opencode/`. Only reports, cited evidence, and app source are
  committed here. `node_modules/`, `.expo/`, `/android`, `/ios`, `dist/`
  are git-ignored inside the app (see `apps/weather-radar/.gitignore`).
- Scope discipline: all audits in this repo are DEFENSIVE and STATIC. No
  cracking, patching, circumvention, redistribution, or use of paid
  features. Nothing from the audited APK is executed.
- **ng-native is an alpha (0.22.2) community project**, not endorsed by
  Google/Angular/Expo; the demo is experimental. After the 2026-11-13 upgrade
  `npm audit` reports **3 moderate** findings (`minimatch` via
  `@expo/fingerprint` via `expo`), down from 30 on the 0.9.0 template —
  acceptable for a local read-only demo; revisit (`npm audit`) before wider use.
  The
  scaffold originally shipped template `AGENTS.md` / `CLAUDE.md` / `.claude/`
  as developer guidance; they were **removed by the human** to keep the
  package clean.
