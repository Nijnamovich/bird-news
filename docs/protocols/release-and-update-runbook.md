---
id: release-and-update-runbook
category: protocols
tags:
- protocol
- release
- eas
- ota
- android
- github-pages
- weather
- runbook
aliases:
- Release and Update Runbook
- Install and update the Android app
related:
- project
- weather-radar-debt
- weather-data-sources
- weather-radar-slice
- pc-pull-runbook
version: 1.0
status: active
---

# Release and Update Runbook — Build an APK, Ship OTA, Publish Snapshots

## Problem

The app runs in Expo Go today. Installing it as a standalone APK, updating the JavaScript without
a rebuild, rolling a bad update back, and keeping the GitHub Pages snapshot fresh are four
procedures that fail in non-obvious ways: an APK built before `updates.url` exists can never
receive OTA; a native change without a `version` bump strands updates on a runtime no binary has;
a Pages workflow on a feature branch never fires on schedule. This runbook is the copy-paste
sequence and the reasoning behind the ordering.

Scope: `apps/weather-radar/` for every app command — never the repository root. The decisions are
in [ADR-0003](../adrs/adr-0003-eas-build-and-update.md) and
[ADR-0004](../adrs/adr-0004-github-pages-for-snapshots.md); this page is the procedure.

## Solution

Commands assume the working directory is **`apps/weather-radar/`**. Steps 1, 2 and 8 need a human
(a browser login, a phone, a workflow dispatch); none of them is automated.

### 1. One-time EAS setup — order is load-bearing

```sh
cd apps/weather-radar

npx eas-cli@latest login          # or: npm install -g eas-cli && eas login
npx eas-cli@latest init           # writes extra.eas.projectId into app.json
npx eas-cli@latest update:configure  # writes updates.url + channel wiring
```

- `login` opens a browser (or takes a pasted token); it is interactive and human-only.
- `init` creates/links the EAS project and writes **`extra.eas.projectId`**.
- `update:configure` writes **`updates.url`** and wires the `eas.json` build profiles' channels.

**Configure before the first build.** `updates.url` is compiled into the native binary. An APK
built before this step has no update URL, so `expo-updates` disables itself (`INVALID_MISSING_URL`
→ `DisabledUpdatesController`, embedded update loaded) and that binary can never receive OTA — the
fix is another build, not another publish. After the three commands, confirm both fields are
present:

```sh
grep -n 'projectId\|updates' app.json
```

Expected today: neither `extra.eas.projectId` nor `updates.url` is present yet — EAS is not
initialized (TD-13). Until a human runs the three commands above, no APK exists.

### 2. First APK

```sh
npx eas-cli@latest build --platform android --profile preview
```

The `preview` profile is `distribution: "internal"`, `android.buildType: "apk"`,
`channel: "preview"`; `cli.appVersionSource: "local"`, so the version comes from `app.json`, not
from EAS. The command prints a build URL; when the build finishes, download the `.apk` from that
page.

Install on the phone:

- **From the phone's browser/files app** — open the APK; Android asks to allow
  "Install unknown apps" for that app the first time. Grant it for that app only.
- **Over USB, if `adb` is available** — `adb install -r <file>.apk` (`-r` reinstalls over an
  existing copy of the same signature).

The first launch runs the bundled JavaScript. Give it a moment; the screen paints the fixture and
then performs one `GET` of the Pages snapshot on cold start.

### 3. Ship a JS change over the air

Edit the JS, then from `apps/weather-radar/`:

```sh
npx eas-cli@latest update --channel preview --environment preview --message "…"
```

- `--channel preview` publishes to the branch linked to the channel the build listens on; the
  `preview` build's `channel: "preview"` is auto-linked to the `preview` branch on first publish.
  Publishing to a branch no channel points at reaches no phone.
- `--environment preview` is **required for projects on Expo SDK 55 or greater** (this app is SDK
  58). Omitting it makes `eas update` stop and ask for it.
- If you prefer naming the branch directly, `--branch preview --environment preview` is equivalent
  once that branch is the one the channel points at.
- The phone checks for updates on the next **cold start**; the default `checkAutomatically` is on
  load. Force-stop and reopen the app to see it immediately.
- No build is consumed; EAS Update free-tier billing counts MAU, not publishes.

The update must match the binary's runtime version. Under
`runtimeVersion: { "policy": "appVersion" }` that identifier comes from `expo.version`, so a JS-only
change needs no version edit — and a native change (step 5) needs one.

### 4. Inspect and roll back

```sh
npx eas-cli@latest update:list --branch preview
npx eas-cli@latest update:rollback <update-group-id>   # roll back the latest group on its branch
npx eas-cli@latest update:republish --group <update-group-id>  # republish one specific group
```

The dashboard offers the same rollback. A rollback **republishes** an earlier update group; it does
not delete the bad one. `update:rollback <group>` acts on the latest group for that branch and
runtime and republishes the group published before it; `update:republish --group <id>` republishes
the group you name. Both reach the phone on its next cold start.

### 5. When a native change forces a new APK

A new build is required when the change touches anything the binary compiles or declares:

- a new or changed native dependency (anything outside pure JS);
- a config plugin or a plugin change;
- a permission or manifest-level setting;
- an Expo SDK upgrade;
- any native field in `app.json` (package name, `versionCode`, icons, orientation, plugins…).

Sequence: bump **`expo.version`** and **`expo.android.versionCode`** in
`apps/weather-radar/app.json`, then run the step 2 build again.

| File | Field | Why |
|---|---|---|
| `apps/weather-radar/app.json` | `expo.version` | Feeds `runtimeVersion` under the `appVersion` policy; without a bump, OTA targets the old runtime. |
| `apps/weather-radar/app.json` | `expo.android.versionCode` | Must increase for Android to install the new APK over the previous one. |

A native change without the `expo.version` bump is the silent failure: the new APK reports the old
runtime version, the update you publish matches the old runtime, and the phone accepts an update
that was built for the previous binary.

### 6. Version bump rules

| Change | `expo.version` | `android.versionCode` | New build? |
|---|---|---|---|
| JS only (logic, styles, copy, existing assets) | — | — | No — `eas update` |
| Native code, dependency, plugin, permission, SDK | **bump** | **bump** | **Yes** |
| Same native code, new attempt at the same release | — | **bump** | Yes |

`android.versionCode` must strictly increase for the phone to install over an existing APK of the
same package (`com.nijnamovich.weather`).

### 7. Keystore — download and keep a backup

```sh
npx eas-cli@latest credentials
```

The managed keystore lives on Expo's servers. Choose the Android build profile and download the
keystore to a safe place outside the repository. **If it is lost with no backup, a build with the
same signature cannot be recreated**: the phone must uninstall the app — losing its on-device
snapshot — and install a new-signature APK. OTA publishing itself does not use the Android
keystore, so a lost key does not stop updates to an already-installed app; it stops the next
install.

### 8. Snapshots: GitHub Pages

Pages is already enabled on the repository (verified 2026-11-13 with
`gh api -X POST repos/Nijnamovich/bird-news/pages -f build_type=workflow`, which returned
`html_url: https://nijnamovich.github.io/bird-news/` and `build_type: workflow`). The UI equivalent
is Settings → Pages → Build and deployment → Source: **GitHub Actions**.

The workflow `.github/workflows/weather-data.yml` runs every 30 minutes and on demand. No deploy has
run yet — the workflow has only existed on a feature branch. After it merges:

```sh
gh workflow run weather-data.yml
gh run list --workflow=weather-data.yml --limit 1
```

or use Actions → **"Weather data → GitHub Pages"** → Run workflow. The repository must be public
for Pages on the Free plan, and the schedule only fires from the default branch's copy of the
workflow.

Verify the published document:

```sh
curl -sS -D - https://nijnamovich.github.io/bird-news/weather/necochea/v1/latest.json -o /dev/null
```

Expect a `200` with `content-type: application/json`, and the document's `timing.fetchedAt` moving
forward between runs. A `404` usually means the artifact path is not
`apps/weather-radar/weather-data`, or the deploy step has not completed.

### 9. Local development caveat

`PULL_BASE_URL` is committed as the Pages origin (`https://nijnamovich.github.io/bird-news`), so a
local producer loop cannot simply add `DEV_HTTP_BASE_URL`: setting both constants throws at
startup. To exercise the local producer over `adb reverse`, **temporarily empty** `PULL_BASE_URL`
in `src/app/app.ts`, set `DEV_HTTP_BASE_URL = 'http://localhost:8080'`, and restore both
afterwards. The full local loop is in the [pc-pull runbook](pc-pull-runbook.md).

## When to use

Run this when installing the app on the phone for the first time, publishing a JS fix, rolling one
back, deciding whether a change needs a new APK, backing up the keystore, or triggering/verifying
the Pages snapshot deploy.

## When not to use

Do not use it for the local produce → serve → `adb reverse` loop — that is the
[pc-pull runbook](pc-pull-runbook.md). Do not use it to publish to the Play Store: distribution is
internal, to one phone. Do not run these commands from the repository root; there is no root
package. Do not run `eas init`/`update:configure` non-interactively or in CI — they need a human
login and they rewrite `app.json`.

## Examples

A JS-only iteration, end to end:

```sh
cd apps/weather-radar
# edit src/app/app.ts
npx eas-cli@latest update --channel preview --environment preview --message "fix: banner wording"
# on the phone: force-stop the app, reopen -> new JS loads
```

A native iteration:

```sh
cd apps/weather-radar
# change a config plugin; bump expo.version and expo.android.versionCode in app.json
npx eas-cli@latest build --platform android --profile preview
# download the APK from the build URL, install with `adb install -r <file>.apk`
```

A bad update, rolled back:

```sh
npx eas-cli@latest update:list --branch preview
npx eas-cli@latest update:rollback <the-bad-group-id>
```

Snapshot verification in one line:

```sh
curl -sS https://nijnamovich.github.io/bird-news/weather/necochea/v1/latest.json \
  | grep -o '"fetchedAt": "[^"]*"'
```

## Common mistakes

- **Building before `eas update:configure`.** No `updates.url` in the binary, updates disabled, OTA
  unreachable. Rebuild is the only fix.
- **Publishing to `production` for a `preview` build.** Channels select branches; the `preview`
  APK reads `preview`.
- **Bumping only `android.versionCode`** on a native change — `runtimeVersion` follows
  `expo.version`.
- **Omitting `--environment` on SDK 55+.** `eas update` requires it (SDK 58 here), so the command
  stops before publishing.
- **Expecting an update after a background resume.** The default check is on cold start; force-stop
  first.
- **Treating rollback as delete.** It republishes an earlier group.
- **Assuming the 30-minute cron is exact, or survives 60 days of repository inactivity.** It is
  best-effort, and GitHub disables the schedule after 60 idle days.
- **Leaving `PULL_BASE_URL` and `DEV_HTTP_BASE_URL` both set.** Startup throws by design.

## References

- [ADR-0003 — EAS Build and Update](../adrs/adr-0003-eas-build-and-update.md) — distribution
  decision, OTA scope, free-tier caveats.
- [ADR-0004 — GitHub Pages for snapshots](../adrs/adr-0004-github-pages-for-snapshots.md) —
  hosting decision, URL shape, cron caveats.
- [pc-pull runbook](pc-pull-runbook.md) — local produce/serve/read-back loop.
- [weather-data-sources](../context/weather-data-sources.md) — strategies, failure semantics,
  cadence.
- [weather-radar-debt](../context/weather-radar-debt.md) — TD-13 (EAS not initialized), TD-07
  (iOS unverified).
- [project](../project.md) — commands and routing.
- `apps/weather-radar/app.json`, `apps/weather-radar/eas.json`,
  `.github/workflows/weather-data.yml` — the configuration this procedure drives.
- `https://docs.expo.dev/eas-update/introduction/` — OTA scope.
