# weather-radar — Necochea weather (read-only)

A small personal Android app that shows the weather for **Necochea, Argentina** (current
conditions, next 24 hours, next 7 days) from one validated JSON snapshot. Read-only by
construction: one parameterless `GET`, no body, cookies, authorization header, device identifier
or user-data query parameter.

ng-native 0.22.2 / Expo SDK 58 / React Native 0.88 / Angular 22. Not an Angular CLI workspace.
In production the app pulls its snapshot from GitHub Pages; Expo Go plus the local producer below
is the development loop.

The last pull document is kept in Expo's document directory and revalidated with
`If-None-Match` on the next cold start (and on resume only when stale), so an offline restart
shows the last real snapshot instead of the demo fixture.

## Commands

All commands run from this directory (`apps/weather-radar/`), never the repository root:

```sh
npm start                            # Metro; open with Expo Go
npm run android                      # freeze-proof launcher (waits for Metro, verifies the open)
npm test                             # vitest, hermetic (Node, no emulator)
npm run typecheck                    # Angular AOT typecheck (ngc --noEmit)
npx expo export --platform android   # bundle proof, no device needed

# Real data without a tunnel (two terminals):
npm run weather:produce              # one Open-Meteo GET -> validated, atomically written snapshot
npm run weather:serve                # serve weather-data/ on :8080 with ETag/304
```

`npm run android:raw` keeps the legacy `expo start --android` flow for reference.

## Docs

Canonical documentation entry point: [`docs/project.md`](../../docs/project.md).

- Slice map and accepted gaps: [`docs/context/weather-radar-slice.md`](../../docs/context/weather-radar-slice.md)
- Data sources and why `pc-pull`: [`docs/context/weather-data-sources.md`](../../docs/context/weather-data-sources.md)
- Network endpoints: [`docs/context/weather-endpoints.md`](../../docs/context/weather-endpoints.md)
- Live-data procedure (produce → serve → `adb reverse`; optional DEV tunnel):
  [`docs/protocols/pc-pull-runbook.md`](../../docs/protocols/pc-pull-runbook.md)
- Install the APK, ship an OTA update, and publish snapshots:
  [`docs/protocols/release-and-update-runbook.md`](../../docs/protocols/release-and-update-runbook.md)
- Distribution and hosting decisions: [`docs/adrs/adr-0003-eas-build-and-update.md`](../../docs/adrs/adr-0003-eas-build-and-update.md),
  [`docs/adrs/adr-0004-github-pages-for-snapshots.md`](../../docs/adrs/adr-0004-github-pages-for-snapshots.md)
- Debt and known limits: [`docs/context/weather-radar-debt.md`](../../docs/context/weather-radar-debt.md)
