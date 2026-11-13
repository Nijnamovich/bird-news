---
last_updated: 2026-11-13
status: current
description: Keep / rewrite / delete inventory for the reduction from the radar visual clone to the minimal weather app.
tags: [weather, prune, inventory, refactor, radar]
---

# Prune inventory — radar clone → minimal weather app

This is the disposition of every file touched by the reduction. The delete was
**atomic**: the new weather screen and all its modules landed before the radar
files went, in one coherent change, so the app never sat in a broken state.
`npm test` and `npm run typecheck` are green at the end of the change.

## What this removes and what the app still does

Removed: the full-bleed radar map, the layer panel with its synthetic product
switches, the legend overlay, the webcam sheet, the timeline/time control, the
synthetic radar field and its test, the radar product catalogue, the
WetterOnline config service, and the old root-component test. Also removed are
the design tokens module, the radar-only icon glyphs and the condition-text
mapping — each existed only to serve that chrome.

What remains is one weather screen for Necochea: **current conditions, a 24-hour
strip and a 7-day list**, fed by a provider-agnostic `WeatherSnapshot`
(`docs/api/openapi.weather-snapshot.yaml`). The screen renders entirely on the
phone from a JSON document — no radar imagery, no map engine, no webcams, no
timeline. It renders **all 24** hourly entries in a horizontal strip and all 7
day rows.

## (a) `apps/weather-radar/src/**`

| Path | Verdict | Why | Replacement |
| --- | --- | --- | --- |
| `src/app/radar-map.component.ts` | **delete** | Rendered a mock radar map with no real imagery or map engine; gone from the reduced screen | — |
| `src/app/layer-panel.component.ts` | **delete** | Only existed to switch synthetic radar products and fetch vendor config | — |
| `src/app/legend-overlay.component.ts` | **delete** | Radar colour-ramp legend; meaningless without the map | — |
| `src/app/webcam-sheet.component.ts` | **delete** | Vendor webcam sheet, never fed by live data | — |
| `src/app/time-control.component.ts` | **delete** | Radar timeline / frame scrubber; the new screen has no frames | — |
| `src/app/radar-field.ts` | **delete** | Synthetic radar field generator (fictional frames) | — |
| `src/app/radar-field.test.ts` | **delete** | Tests the deleted synthetic field | — |
| `src/app/radar-products.ts` | **delete** | Radar product catalogue (layers, periods, frame counts) | — |
| `src/app/radar-config.service.ts` | **delete** | The one live WetterOnline GET; replaced by the snapshot providers | `src/app/weather/snapshot-provider.ts` |
| `src/app/app.test.ts` | **delete** | Asserts the removed chrome (Legend, Radar layers, Webcams, timeline) | New tests next to `src/app/weather/` and the reduced screen |
| `src/app/app.ts` | **rewrite** | Becomes the minimal weather screen: loading / fresh / stale / expired / error states, current + all 24 h + 7 d; holds `PULL_BASE_URL` | New root template over `src/app/weather/**` |
| `src/app/icons.ts` | **rewrite** | Trim to the glyphs the screen actually uses — condition icons, `info`, `drop`, `warnings`; drop radar/webcam/timeline glyphs. There is no `refresh` glyph: this version has no refresh control | Smaller `IconName` union, same native-view technique |
| `src/app/design-tokens.ts` | **delete** | The palette / type / layout metrics no longer earned their own module: the reduced screen is their only consumer, so the constants live next to it in `app.ts` | Local `COLOR` / `FONT_FAMILY` / `LAYOUT` consts in `app.ts` |
| `src/app/weather/condition-mapping.ts` | **delete** | Free-text → code mapping has no in-app consumer: the app consumes `ConditionCode` values a producer already normalised. The producer-side rule is documented in the OpenAPI `ConditionCode` description | `snapshot-icons.ts` keeps `iconCodeFor` (IconCode → glyph) |
| `src/main.ts` | **keep** | Mounts the app and the ng-native platform. It no longer registers `provideNativeHttpClient()`: nothing injects `HttpClient`, and the single GET uses global `fetch` | — |
| `src/app/weather/weather-snapshot.types.ts` | **new** | TypeScript mirror of the frozen snapshot contract | `docs/api/openapi.weather-snapshot.yaml` |
| `src/app/weather/snapshot-validate.ts` | **new** | Dependency-free runtime validation of every field plus the cross-field invariants the schema cannot express | §"Enforced by the client validator" in the OpenAPI `info.description` |
| `src/app/weather/snapshot-cache.ts` | **new** | In-memory freshness state machine (`loading` / `fresh` / `stale` / `expired` / `error`), driven by the document's own `timing`, with `expiresAt` first, stale-while-revalidate, 7-day local purge, and no last-known-good for `ok:false` | — |
| `src/app/weather/snapshot-icons.ts` | **new** | `IconCode` → local glyph (`iconCodeFor`); the app never downloads an icon | — |
| `src/app/weather/snapshot-provider.ts` | **new** | The two `SnapshotProvider` implementations, both in this one file: `FixtureSnapshotProvider` (`fixture`) and `HttpPullSnapshotProvider` (`pc-pull`, conditional GET, 304 keeps the cache) | `docs/weather/data-sources.md` |
| `src/app/weather/format.ts` | **new** | Pure, locale-aware number, temperature, wind and time formatting for the screen (es-AR) | — |
| `src/app/weather/fixtures/necochea.snapshot.json` | **new** | Bundled first-paint snapshot so a cold offline launch is never empty | — |
| `src/app/weather/*.test.ts` | **new** | Hermetic tests for the validator, the cache and the formatter | — |

## (b) `docs/**`, app docs and root READMEs

| Path | Verdict | Why | Replacement |
| --- | --- | --- | --- |
| `docs/project.md` | **rewrite (targeted)** | Purpose, stack note, Slices row and metadata still describe the radar clone | Updated in place; toolchain and launch-race history preserved |
| `docs/api/openapi.weather-snapshot.yaml` | **new** | Canonical contract for the snapshot | — |
| `docs/weather/data-sources.md` | **new** | Answers "how does the data get updated"; records the 403 evidence and the `pc-pull` recommendation | — |
| `docs/weather/prune-inventory.md` | **new** | This file | — |
| `docs/weather/stack-and-upgrade.md` | **new** | Stack lineage versus the newest upstream, plus the framework option comparison | — |
| `apps/weather-radar/README.md` | **rewrite** | Still says "My Angular Native app"; describes the radar demo | Reduced app, commands, module map, contract link |
| `apps/weather-radar/ENDPOINTS.md` | **rewrite** | Lists WetterOnline radar/webcam endpoints as if they still existed | Zero-live-default + optional `pc-pull` + producer-side AccuWeather note |
| `docs/security-audits/**` | **trimmed to a one-page summary** | This is the repository's **original deliverable** per `docs/project.md`: the static audit of the modded APK. `report.md` now carries the verdict, identity, signing facts and top findings; the full evidence is preserved at commit `ce4ca74` | `report.md` (evidence at `ce4ca74`) |
| Root `README.md` / root docs | **none present** | There is no root README to update; `docs/project.md` is the entry point | — |
| `package.json` / `package-lock.json` | **keep** | Command names and dependency versions are a separate concern; the reduction does not require a dependency change | — |
| `app.json` | **keep** | Expo identity, icons and the `@ng-native/metro` plugin are still correct | — |
| `metro.config.js` | **keep** | Build wiring for ng-native | — |
| `vitest.config.mts` | **keep** | Hermetic Node tests against the native fake | — |
| `tsconfig.json` | **keep** | Strict Angular/TS settings | — |
| `scripts/start-android.mjs` | **keep** | The freeze-proof Android launcher and its two documented races | — |
| `assets/**` | **keep** | Icons and splash art | — |
| `LICENSE` | **keep** | MIT | — |

## Ordering guarantee

The reduction is one change, not a sequence of half-migrated states:

1. Add `src/app/weather/**`, the new `app.ts` body, the trimmed `icons.ts`, and
   the new tests.
2. Point `src/main.ts` at the unchanged `App` root.
3. Delete the radar files and, in the same change, `design-tokens.ts` and
   `condition-mapping.ts`.
4. Verify `npm test`, `npm run typecheck`, and `npx expo export --platform
   android`.

If any step fails, the whole change is reverted — there is no intermediate
commit where the app renders an empty screen.

## Pending follow-ups

- **On-device verification: done 2026-11-12** on the `pixel` AVD — the screen
  painted (Necochea / 19° / "Datos de ejemplo · sin conexión" / 24 hour cards /
  7 day rows) and `npx expo export --platform android` bundles it (1099 modules
  → 3.5 MB Hermes). The software-GL emulator raised its own System UI ANR during
  the run, so a GPU-backed re-run is a nice-to-have, not an open blocker.
- **Persistence** of the snapshot. The cache is in memory only; there is no
  AsyncStorage/MMKV layer today.
- **Revalidation on resume and pull-to-refresh.** This version revalidates on
  cold start only.
