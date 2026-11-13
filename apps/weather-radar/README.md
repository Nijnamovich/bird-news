# weather-radar — Necochea weather (read-only)

A small personal Android app that shows the weather for **Necochea, Argentina**
(current conditions, next 24 hours, next 7 days). It is read-only by
construction: the only network call is a single parameterless `GET` for a JSON
snapshot, and no request body, cookie, authorization header, device identifier,
or user-data query parameter is ever sent.

The app is built with **ng-native 0.22.2** (Angular 22 + Expo SDK 58 + React
Native 0.88). It is not an Angular CLI workspace.

## Commands

All commands run from this directory (`apps/weather-radar/`), never from the
repository root:

```sh
npm start            # Metro; scan the QR code with Expo Go (or use npm run android)
npm run android      # freeze-proof launcher: waits for Metro, then opens the app
npm test             # vitest, hermetic (Node, no emulator)
npm run typecheck    # Angular AOT typecheck (ngc --noEmit)
npx expo export --platform android   # bundle proof, no device needed

# Real data without a tunnel (two commands, two terminals):
npm run weather:produce   # one Open-Meteo GET -> validated, atomically written snapshot
npm run weather:serve     # serve weather-data/ on :8080 with ETag/304
```

`npm run android` runs `scripts/start-android.mjs` (boot-completed wait, process
death wait, verified open + bounded retry). `npm run android:raw` keeps the
legacy `expo start --android` flow for reference.

To see live data: run the two `weather:*` commands above, `adb reverse tcp:8080
tcp:8080`, set `DEV_HTTP_BASE_URL = 'http://localhost:8080'` in
`src/app/app.ts` (empty by default, dev only) and start the app. Full sequence,
cleartext caveat and the later named-tunnel steps:
[`docs/weather/pc-pull-runbook.md`](../../docs/weather/pc-pull-runbook.md).

## Layout

```
src/main.ts                     mount + ng-native platform wiring
src/app/app.ts                  the only screen (current / 24 h / 7 d; all 24 hour cards)
src/app/icons.ts                small weather glyph set, drawn with native views
src/app/weather/
  weather-snapshot.types.ts     the contract, in TypeScript
  snapshot-validate.ts          dependency-free structural + cross-field validator
  snapshot-cache.ts             freshness state machine (loading/fresh/stale/expired/error)
  snapshot-icons.ts             IconCode -> local glyph (iconNameFor)
  snapshot-provider.ts          SnapshotProvider: fixture, HTTP pull (pc-pull)
  pull-base-url.ts              base-URL policy (https-only prod, dev HTTP opt-in)
  format.ts                     pure display helpers (es-AR)
  fixtures/necochea.snapshot.json
```

## Where the data comes from

The canonical contract is
[`docs/api/openapi.weather-snapshot.yaml`](../../docs/api/openapi.weather-snapshot.yaml)
(OpenAPI 3.1, `WeatherSnapshot` v1.0.0). Any producer that writes that document
can feed the app; the app does not care whether a phone or a PC produced it.

- Two providers in `snapshot-provider.ts`: `FixtureSnapshotProvider` (`fixture`) and
  `HttpPullSnapshotProvider` (`pc-pull`). `phone-scrape` and `push` are type-union
  placeholders with no implementation.
- `PULL_BASE_URL` at the top of `src/app/app.ts`: empty (the default) means the
  app stays on the bundled fixture and makes **zero** requests. Set it to a
  **stable `https://` origin** (a named Cloudflare tunnel or a custom domain —
  never a rotating quick tunnel) to enable one conditional `GET` on cold start.
  The client sends `If-None-Match: "<snapshotId>"` for the document it holds and
  keeps that document on `304`; non-HTTPS origins and redirects are refused.
- On-device scraping is **not implemented**: the source page returned HTTP 403
  to a plain read-only GET on 2026-11-12. See
  [`docs/weather/data-sources.md`](../../docs/weather/data-sources.md).

While offline or stale, the app keeps the document it loaded this session (in
memory) and says so; the bundled fixture is labelled "Datos de ejemplo". There is
no blank state. Revalidation happens on cold start only in this version; resume
and pull-to-refresh are follow-ups.

## Known limits

- The cache is in memory only; there is no on-device persistence yet.
- iOS is untested. The target exercised here is Android.

Docs: [`docs/weather/`](../../docs/weather/)
