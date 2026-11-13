# PC pull runbook — real data today, named tunnel later

Status: current (2026-11-13). Scope: `apps/weather-radar/` and this document.
All app commands run from **`apps/weather-radar/`**, never the repository root.

## 1. What this is / what it does not do

Makes the read-only weather app show **real** Necochea data today, without a
tunnel: `npm run weather:produce` fetches Open-Meteo once and writes a validated
`WeatherSnapshot` under `weather-data/`; `npm run weather:serve` serves that tree
over plain HTTP on 8080; `DEV_HTTP_BASE_URL` points the app at it (usually via
`adb reverse`). Later a **named** Cloudflare tunnel replaces the dev URL by
setting one constant, `PULL_BASE_URL`.

It does **not** create a tunnel or public hostname (section 7, later), push data
to the phone (`push` is out of scope), use anything but `GET` (no body, cookies,
`Authorization`, device identifier or user-data query parameter), run faster than
one producer fetch per 30 minutes (48/day ceiling), or scrape HTML / invent
values — the AccuWeather adapter is present but **disabled**.

## 2. Source reality check (verified, not assumed)

| Upstream | Result from this network | Role today |
| --- | --- | --- |
| Open-Meteo free API | **HTTP 200**, ~10.8 kB JSON, **no API key** (verified 2026-11-13) | The only implemented producer source |
| AccuWeather forecast HTML | **HTTP 403**, 436 B, `<TITLE>Access Denied</TITLE>` (measured 2026-11-12, re-confirmed 2026-11-13) | Adapter exists, `enabled: false` |

Open-Meteo terms: attribution is mandatory (**CC BY 4.0**) and commercial use is
not allowed. The document carries the honest line `Datos meteorológicos por
Open-Meteo (open-meteo.com) — CC BY 4.0`, and the app renders it on screen.

Trade-off: Open-Meteo is keyless and machine-readable; the vendor page is blocked
and is a JavaScript SPA, so parsing it would need a headless browser and sit
close to anti-bot circumvention. The swap seam is
`scripts/accuweather-adapter.mjs`: verify a 200 from your own network, flip
`enabled` to `true`, write a parser + normalizer, and register it in
`scripts/weather-produce.mjs`; until then `--source accuweather` fails loudly.

## 3. Produce one snapshot

```sh
cd apps/weather-radar
npm run weather:produce
```

Expected output (values vary per run):

```
[weather:produce] snapshotId=1185eeaf… fetchedAt=2026-11-13T03:04:02.099Z bytes=11255 target=weather-data/weather/necochea/v1/latest.json source=Datos meteorológicos por Open-Meteo (open-meteo.com) — CC BY 4.0
```

Target `weather-data/weather/necochea/v1/latest.json` maps to the URL path
`/weather/necochea/v1/latest.json`. The document is validated **before** writing
(a contract failure prints the errors and exits 1 without touching the previous
file), and the write is atomic (temp file in the same directory, then
`fs.rename`), so a reader never sees half-written JSON. `snapshotId` is
`sha256('pc-pull|necochea-ar|<timing.fetchedAt>')` and is the `ETag` the server
sends, so conditional `GET` works. `weather-data/` is git-ignored; live data is
never committed. Open-Meteo publishes no run id, so `issuedAt` equals `fetchedAt`.

## 4. Serve on the LAN

```sh
npm run weather:serve          # PORT env or 8080; binds 0.0.0.0
```

Startup prints the served root, the localhost URL, the `adb reverse` command and
the LAN URL. Check the contract by hand:

```sh
curl -sS -D - http://localhost:8080/weather/necochea/v1/latest.json
```

Expect `HTTP/1.1 200 OK`, `Content-Type: application/json; charset=utf-8`,
`Cache-Control: max-age=300, must-revalidate`, `ETag: "<snapshotId>"`. Revalidate:

```sh
SNAPSHOT_ID=$(curl -sS http://localhost:8080/weather/necochea/v1/latest.json | sed -n 's/.*"snapshotId": "\([a-f0-9]*\)".*/\1/p')
curl -sS -H "If-None-Match: \"$SNAPSHOT_ID\"" -o /dev/null -w '%{http_code}\n' \
  http://localhost:8080/weather/necochea/v1/latest.json   # → 304
```

Missing file → `404` with a JSON body naming `npm run weather:produce`;
`POST`/`PUT`/… → `405`; only `weather-data/` is reachable. Fallback without Node:
`python3 -m http.server 8080 --directory weather-data` serves the file, but it
**cannot** answer `304` or set `Cache-Control`, so use the Node server for a
faithful contract test.

## 5. Point the phone at it

Emulator/USB (recommended; avoids LAN and cleartext-host surprises):

```sh
adb reverse tcp:8080 tcp:8080
```

Then edit `src/app/app.ts`:

```ts
const PULL_BASE_URL = '';                           // production stays empty
const DEV_HTTP_BASE_URL = 'http://localhost:8080';  // DEV ONLY
```

A physical phone on the same Wi-Fi can use `http://<LAN-IP>:8080` instead (the
serve command prints the LAN URL). Start the app with `npm run android`.

Confirm on device: the banner flips from `Datos de ejemplo · sin conexión` to a
live freshness label (e.g. `Actualizado hace …`) and the temperature matches the
produced document. Read the tree back with:

```sh
adb shell uiautomator dump /sdcard/ui.xml && adb shell cat /sdcard/ui.xml
```

**Verified on the emulator (2026-11-13).** With `DEV_HTTP_BASE_URL` temporarily
set to `http://localhost:8080`, the `pixel` AVD (API 36, SwiftShader) booted the
app through `npm run android` and `adb shell uiautomator dump` read back the
live document (re-verified after the stack upgrade, on the Expo Go **58.0.5**
client that SDK 58 requires):

```
Necochea / Cubierto / 15° / Sensación 12° / Viento 22 km/h ENE / Humedad 89%
"Actualizado · hace 2 min"                       (not "Datos de ejemplo")
Próximas horas: 00:00 15° 14%, 01:00 15° 13%, 02:00 14° 10% …
Próximos 7 días: vie 13 100% 14° / 24°, sáb 14 100% 14° / 17° …
```

Those values match the produced document field for field (14.5 °C, 89 %,
22.1 km/h ENE, `daily[0]` 14.2/23.8 at 100 %). The constant was then restored to
`''`; the committed default is empty, so the shipped behaviour is still
fixture-only until someone opts in. Verified over `adb reverse` (loopback); the
LAN-IP variant is **not** verified in this pass.

## 6. Android cleartext caveat (verify, do not paper over)

`targetSdk >= 28` blocks cleartext HTTP by default. Expo Go is **expected** to
permit it in development, but that must be verified on the emulator — it is not
assumed here. If the pull fails, the failure text is:

```
CLEARTEXT communication to <host> not permitted by network security policy
```

If that appears: (1) use `adb reverse tcp:8080 tcp:8080` with
`http://localhost:8080` (no LAN IP), so the request never leaves the device
loopback; (2) if it still fails, **stop and report**. Do not disable TLS, do not
add a permissive `networkSecurityConfig`, and do not switch to a public tunnel
as a workaround.

Measured 2026-11-13: Expo Go on the `pixel` AVD (API 36) pulled
`http://localhost:8080` over `adb reverse` with **no** cleartext block — the
live snapshot rendered. That is the loopback path only; a LAN-IP `http://` pull
is not verified and is the case most likely to hit the policy above.

## 7. Later: the tunnel (named, never quick)

A quick tunnel (`trycloudflare.com`) is rejected: its hostname rotates on every
restart, so the saved `PULL_BASE_URL` breaks and the app silently falls back to
the fixture. Use a named tunnel with a custom domain.

```sh
cloudflared tunnel login
cloudflared tunnel create weather-necochea      # note the credentials JSON path
cloudflared tunnel route dns weather-necochea weather.<your-domain>
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: <tunnel-uuid>
credentials-file: /home/<user>/.cloudflared/<tunnel-uuid>.json
ingress:
  - hostname: weather.<your-domain>
    service: http://localhost:8080
  - service: http_status:404
```

```sh
cloudflared tunnel run weather-necochea
```

Then the one-constant upgrade: keep `npm run weather:serve` running and set
`PULL_BASE_URL = 'https://weather.<your-domain>'` while leaving
`DEV_HTTP_BASE_URL = ''`. `PULL_BASE_URL` accepts `https://` only; setting both
constants is a startup error ("set only one"), so a stale dev value cannot
silently win. Unverified in this pass: tunnel creation and DNS routing need the
human's Cloudflare account and domain.

## 8. Verification checklist

- [ ] `npm test` — 110 tests pass (includes the normalizer + base-URL policy).
- [ ] `npm run typecheck` — clean.
- [ ] `npm run weather:produce` — one summary line, file exists, validates.
- [ ] `curl` — `200` with `Cache-Control` + `ETag`; matching `If-None-Match` → `304`.
- [ ] `git status --short` — no `weather-data/` entry (git-ignored).
- [x] On device — banner shows a live label, not `Datos de ejemplo`
      (verified 2026-11-13 over `adb reverse`; see section 5).

What the phone shows on failure (contract semantics, briefly):

| Failure | Local state / what stays on screen |
| --- | --- |
| Producer not running / network down | `UPSTREAM_UNAVAILABLE`; fixture or in-session last-known-good |
| `403` from an upstream | `FETCH_BLOCKED`; current document stays |
| `429` | `RATE_LIMITED`; wait `Retry-After`; current document stays |
| Any other non-`200` | `HTTP_ERROR`; current document stays |
| Invalid JSON / schema mismatch | `PARSE_ERROR` / `SCHEMA_INVALID`; current document stays |
| Non-`https://` prod base URL or `?`/`#` | Rejected before any request; fixture stays |

## 9. Terms and limits

- **≤ 48 upstream fetches/day** (one per 30 minutes). Do not loop the producer.
- Honour `Retry-After` on `429` and `5xx`; back off instead of retrying tightly.
- No redistribution and no commercial use of Open-Meteo data; attribution is
  displayed in the app and stored in every document.
- The phone talks only to the snapshot host. The forbidden audit hosts
  (`*.lambda-url.eu-central-1.on.aws/geovis`, `*.apm.*.cloud.es.io`,
  `tiles.*/analytics`) are never contacted.
- No secrets in committed files: base URLs are literals, tunnel credentials stay
  in `~/.cloudflared/`.
