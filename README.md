# bird-news

A personal, defensive repository: a **read-only Necochea weather app** (`apps/weather-radar/`)
and the **static security audit** that started the repository (`docs/security-audits/`).

**Documentation entry point: [`docs/project.md`](docs/project.md).** It is the canonical map for
humans and agents — stack, slices, commands, conventions, context index and symptom lookups. This
README intentionally does not duplicate it.

- App commands and doc pointers: [`apps/weather-radar/README.md`](apps/weather-radar/README.md)
- Live-data procedure: [`docs/protocols/pc-pull-runbook.md`](docs/protocols/pc-pull-runbook.md)
- Audit deliverable: [`docs/security-audits/security-audits-index.md`](docs/security-audits/security-audits-index.md)

There is **no `package.json` at the repository root**. Every app command runs from
`apps/weather-radar/`.

Scope: no public release, no redistribution of vendor data, no premium/paywall bypass, no
telemetry, no on-device scraping. The audit is static and defensive; the audited APK was never
executed, installed or redistributed.
