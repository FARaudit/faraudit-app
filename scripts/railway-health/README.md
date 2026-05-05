# Railway Dashboard Health Probe · Sprint 2.2.0

Catches silent drift across the cron-fleet **before** it goes red for days.

The trigger: Email-AI ran for ~24h with every cron tick failing because the
Railway dashboard's Root Directory drifted to `/` and `next build` ran instead
of `node agents/email-ai/index.js`. No alerts fired. CEO discovered it via
inbox-non-organization (no `⚠️ Action Required` labels appearing).

This probe queries Railway's deployment state, compares against an expected-
state manifest, and flags drift in three categories:

1. **Config drift** — `rootDirectory` or `cronSchedule` differs from manifest
2. **Stale last-success** — too long since a SUCCESS deployment for this
   service's cron cadence
3. **Chronic failures** — ≥3 of the last 10 deployments FAILED/CRASHED

## When to run

Start of every morning brief. Add to the morning-routine checklist:

```bash
npx tsx scripts/railway-health/probe.ts
```

Exit code 0 = all green. Exit code 1 = something needs attention (see table).

## Output modes

```bash
# human-readable table (default)
npx tsx scripts/railway-health/probe.ts

# JSON output for piping / dashboards / Notion ingestion
npx tsx scripts/railway-health/probe.ts --json

# only print if any service is red — quiet morning brief integration
npx tsx scripts/railway-health/probe.ts --quiet
```

## Reading the output

```
service             │ status   │ last_run     │ drift                            │ action_needed
Email-AI            │ 🔥 red   │ 4m ago       │ rootDirectory: null vs expected… │ Set Root Directory to "agents/email-ai"…
```

| Column | Meaning |
|---|---|
| service | Railway service name (matches manifest key) |
| status | ✅ green / ⚠️ yellow / 🔥 red / ⏭ skipped (service not found) |
| last_run | Time since last SUCCESS deployment (relative format) |
| drift | Comma-separated list of drift signals |
| action_needed | First-best-guess remediation step |

### Status semantics

- **green** — zero drift, recent SUCCESS, no failure pattern
- **yellow** — only "stale last_success" (cron skipped or service idle)
- **red** — config drift OR chronic failures OR multiple drift signals

### Caveats

- Railway's `SUCCESS` deployment status means **deploy infrastructure
  succeeded**, not necessarily that the cron command exited 0. For agents
  whose container exits with an error, Railway may still mark the deployment
  SUCCESS (the deploy/build succeeded; the runtime crash is logged
  separately). Cross-check via `railway logs <deployment-id>` when a service
  is suspect.
- `rootDirectory: null` is reported as drift but does NOT always mean the
  service is broken. Most agents in the responsible-perfection monorepo run
  with full-path `startCommand`s (e.g. `node agents/audit-ai/index.js`) that
  work regardless of Root Directory. The drift IS still real and worth fixing
  for build-phase consistency, but rootDirectory drift alone is not a
  reliable operational-failure signal.
- Operational signal: a service is genuinely failing if `last_run` shows
  "no SUCCESS in last 10 deployments" OR last_run is much older than the
  configured cadence.

## Maintaining the manifest

`scripts/railway-health/manifest.json` is the source of truth for expected
state. Fields per service:

```json
{
  "Service-Name": {
    "rootDirectory": "agents/foo",
    "cronSchedule": "0 12 * * *",
    "max_minutes_since_last_success": 1500,
    "_notes": "human-readable context"
  }
}
```

- `rootDirectory` — the dashboard Settings → Root Directory value. Use `null`
  for services that don't need one (root-level / legacy).
- `cronSchedule` — exact cron string (UTC, Railway uses UTC). Match the
  schedule defined in `agents/<name>/railway.toml`.
- `max_minutes_since_last_success` — alarm threshold for staleness. A daily
  cron should have this set to 1500 (≈25h, so a ~24h-cycle service that
  missed one tick goes yellow but not red after just one miss). A
  every-30-min cron should be ≤60.

When adding a new Railway service:
1. Add an entry to `manifest.json`.
2. Run the probe locally to verify it picks up the new service.
3. Commit both manifest + the new agent.

When a service is intentionally renamed or removed:
- Update the manifest key
- Run probe to confirm it shows up correctly (no `skipped` row)

## Why CLI subprocess instead of GraphQL

The Sprint 2.2.0 spec proposed reading Railway's GraphQL API directly with
`RAILWAY_TOKEN`. v1 uses `railway` CLI subprocess (`railway status --json`
and `railway deployment list --json`) instead. Trade-offs:

| Path | Pros | Cons |
|---|---|---|
| **CLI subprocess (v1)** | Auth handled · same JSON shape as GraphQL · already proven to work | Requires `railway` CLI installed + logged in (CEO laptop only) |
| **GraphQL direct (v2 future)** | CI portable · no CLI dep · single HTTP call | Token plumbing · personal-access-token expiry · GraphQL schema discovery |

The probe is designed to run on CEO's laptop at the start of every morning
brief — the CLI dependency is a no-op there. Migrating to GraphQL is a clean
swap (`fetchProjectStatus` and `fetchDeploymentList` are the only two
functions that touch the data source) when CI integration is needed.

## Notion alerting

v1 stub is in place. When `NOTION_TOKEN` and `NOTION_FLEET_ALERT_PAGE_ID`
are present in the environment AND any service is red, the script prints
a `[notion] would alert N red service(s)` line.

Wiring the actual Notion API call (POST to `https://api.notion.com/v1/pages`
with the alert payload) + dedup-within-the-hour logic is a v2 enhancement.

## Authorization model

- **Read-only** against Railway. Never modifies a service, never redeploys,
  never touches env vars. Pure `railway status` + `railway deployment list`.
- **Read/write** against Notion (when wired). Only appends to the dedicated
  Fleet Health Alerts page. Never modifies MEMORY.md or the Phase plan.
- **No env changes**, **no service redeploys**.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | All services green |
| 1 | One or more services red — action needed |
| 2 | Probe itself failed (CLI missing, JSON parse error, etc.) |
