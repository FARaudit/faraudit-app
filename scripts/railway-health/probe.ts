// Railway dashboard health probe · Sprint 2.2.0
//
// Catches silent drift across the cron-fleet BEFORE it goes red for days.
// The Email-AI Root-Directory regression (May 4 2026) ran for ~24h with
// every cron tick failing because the dashboard's Root Directory drifted
// to "/" and `next build` ran instead of `node index.js`. This probe
// would have flagged that within minutes.
//
// Data source · Railway CLI subprocess.
//   - `railway status --json` (entire project view including all services)
//   - `railway deployment list --json` per service (last ~20 deployments)
// Pragmatic v1 choice over GraphQL: CLI handles auth automatically (CEO's
// existing `railway login` token works) and the JSON shape is the same as
// what the GraphQL endpoint returns. Future v2 can add direct GraphQL via
// process.env.RAILWAY_TOKEN for CI portability — see README.md.
//
// Usage:
//   npx tsx scripts/railway-health/probe.ts            # human-readable table
//   npx tsx scripts/railway-health/probe.ts --json     # machine output
//   npx tsx scripts/railway-health/probe.ts --quiet    # only print if any service red
//
// Exit codes:
//   0 — all green
//   1 — one or more services red (drift OR last-success too old OR chronic failures)
//   2 — probe itself failed (CLI missing, JSON parse error, etc.)

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ━━ CLI args ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const args = process.argv.slice(2);
const FLAG_JSON = args.includes("--json");
const FLAG_QUIET = args.includes("--quiet");

// ━━ Types ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface Manifest {
  [serviceName: string]: {
    rootDirectory: string | null;
    cronSchedule: string | null;
    max_minutes_since_last_success: number;
    _notes?: string;
  };
}

interface Deployment {
  id: string;
  status: string;
  createdAt: string;
  meta?: {
    rootDirectory?: string | null;
    cronSchedule?: string | null;
    serviceManifest?: { deploy?: { startCommand?: string } };
    buildOnly?: boolean;
  };
}

interface ServiceInstance {
  id: string;
  serviceId: string;
  serviceName: string;
  cronSchedule?: string | null;
  startCommand?: string | null;
  latestDeployment?: Deployment;
}

type DriftReason = string;

interface ServiceHealth {
  service: string;
  status: "green" | "yellow" | "red" | "skipped";
  drift: DriftReason[];
  lastSuccess?: string;
  lastSuccessAge?: string;
  recentFailureCount?: number;
  actualRootDirectory?: string | null;
  actualCronSchedule?: string | null;
  actionNeeded?: string;
}

// ━━ Helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function loadManifest(): Manifest {
  const raw = readFileSync(join(__dirname, "manifest.json"), "utf8");
  return JSON.parse(raw) as Manifest;
}

function fetchProjectStatus(): { services: ServiceInstance[] } {
  let stdout: string;
  try {
    stdout = execSync("railway status --json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`railway status --json failed: ${msg}\nIs the railway CLI installed and logged in?`);
  }
  const parsed = JSON.parse(stdout) as {
    environments?: { edges?: Array<{ node: { serviceInstances?: { edges?: Array<{ node: ServiceInstance }> } } }> };
  };
  const services: ServiceInstance[] = [];
  for (const env of parsed.environments?.edges || []) {
    for (const svc of env.node.serviceInstances?.edges || []) {
      services.push(svc.node);
    }
  }
  return { services };
}

function fetchDeploymentList(serviceName: string): Deployment[] {
  try {
    execSync(`railway service "${serviceName}"`, { stdio: "ignore" });
    const stdout = execSync("railway deployment list --json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return JSON.parse(stdout) as Deployment[];
  } catch {
    return [];
  }
}

function minutesSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

function fmtAge(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m ago`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)}h ago`;
  return `${(minutes / 1440).toFixed(1)}d ago`;
}

// ━━ Drift check per service ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function checkService(svc: ServiceInstance, expected: Manifest[string], deployments: Deployment[]): ServiceHealth {
  const drift: DriftReason[] = [];
  const actualRootDirectory = svc.latestDeployment?.meta?.rootDirectory ?? null;
  const actualCronSchedule = svc.cronSchedule ?? null;

  // 1. rootDirectory drift
  if (expected.rootDirectory !== undefined && actualRootDirectory !== expected.rootDirectory) {
    drift.push(`rootDirectory: ${actualRootDirectory ?? "null"} vs expected ${expected.rootDirectory ?? "null"}`);
  }

  // 2. cronSchedule drift
  if (expected.cronSchedule !== undefined && actualCronSchedule !== expected.cronSchedule) {
    drift.push(`cronSchedule: "${actualCronSchedule ?? "null"}" vs expected "${expected.cronSchedule ?? "null"}"`);
  }

  // 3. Time since last SUCCESS
  const successDeployment = deployments.find((d) => d.status === "SUCCESS");
  let lastSuccessAgeMin: number | undefined;
  let lastSuccess: string | undefined;
  if (successDeployment) {
    lastSuccessAgeMin = minutesSince(successDeployment.createdAt);
    lastSuccess = successDeployment.createdAt;
    if (lastSuccessAgeMin > expected.max_minutes_since_last_success) {
      drift.push(`last success ${fmtAge(lastSuccessAgeMin)} (max ${expected.max_minutes_since_last_success}m)`);
    }
  } else if (deployments.length > 0) {
    drift.push(`no SUCCESS in last ${deployments.length} deployments`);
  }

  // 4. Chronic failure pattern: ≥3 of last 10 are FAILED/CRASHED
  const recentFailures = deployments.slice(0, 10).filter((d) => /FAIL|CRASH|ERROR/.test(d.status));
  if (recentFailures.length >= 3) {
    drift.push(`chronic failures: ${recentFailures.length}/10 recent`);
  }

  let status: ServiceHealth["status"];
  if (drift.length === 0) status = "green";
  else if (drift.length === 1 && /last success/.test(drift[0])) status = "yellow";
  else status = "red";

  // Action-needed hint
  let actionNeeded: string | undefined;
  if (drift.some((d) => d.startsWith("rootDirectory"))) {
    actionNeeded = `Set Root Directory to "${expected.rootDirectory}" in Railway dashboard → ${svc.serviceName} → Settings`;
  } else if (drift.some((d) => d.startsWith("cronSchedule"))) {
    actionNeeded = `Update cron schedule in railway.toml + redeploy`;
  } else if (drift.some((d) => /chronic failures/.test(d))) {
    actionNeeded = `Inspect recent deployment logs · investigate root cause`;
  } else if (drift.some((d) => /last success/.test(d))) {
    actionNeeded = `Cron skipped or stuck · check Cron Runs tab in Railway dashboard`;
  }

  return {
    service: svc.serviceName,
    status,
    drift,
    lastSuccess,
    lastSuccessAge: lastSuccessAgeMin !== undefined ? fmtAge(lastSuccessAgeMin) : undefined,
    recentFailureCount: recentFailures.length,
    actualRootDirectory,
    actualCronSchedule,
    actionNeeded
  };
}

// ━━ Output renderers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const STATUS_ICON = { green: "✅", yellow: "⚠️", red: "🔥", skipped: "⏭" } as const;

function renderTable(rows: ServiceHealth[]): string {
  const cols = ["service", "status", "last_run", "drift", "action_needed"];
  const widths = [22, 10, 18, 50, 60];

  const lines: string[] = [];
  const pad = (s: string, w: number) => s.length >= w ? s.slice(0, w - 1) + "…" : s + " ".repeat(w - s.length);
  lines.push(cols.map((c, i) => pad(c, widths[i])).join(" │ "));
  lines.push(widths.map((w) => "─".repeat(w)).join("─┼─"));

  for (const r of rows) {
    const driftCell = r.drift.length > 0 ? r.drift.join(" · ") : "";
    const cells = [
      r.service,
      `${STATUS_ICON[r.status]} ${r.status}`,
      r.lastSuccessAge ?? "—",
      driftCell,
      r.actionNeeded ?? ""
    ];
    lines.push(cells.map((c, i) => pad(c, widths[i])).join(" │ "));
  }

  // Summary
  const counts = { green: 0, yellow: 0, red: 0, skipped: 0 };
  for (const r of rows) counts[r.status]++;
  lines.push("");
  lines.push(`Summary · ${counts.green}✅ ${counts.yellow}⚠️ ${counts.red}🔥 ${counts.skipped}⏭ across ${rows.length} services`);

  return lines.join("\n");
}

// ━━ Main ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function main() {
  const manifest = loadManifest();
  const { services } = fetchProjectStatus();

  // Save the originally-linked service so we can restore at end
  let originallyLinked = "";
  try {
    originallyLinked = execSync("railway status 2>/dev/null", { encoding: "utf8" })
      .split("\n").find((l) => l.startsWith("Service:"))?.replace("Service:", "").trim() || "";
  } catch { /* swallow */ }

  const rows: ServiceHealth[] = [];

  // For each manifest entry, find the live service + its deployments
  for (const expectedName of Object.keys(manifest)) {
    const live = services.find((s) =>
      s.serviceName === expectedName ||
      s.serviceName.toLowerCase() === expectedName.toLowerCase()
    );
    if (!live) {
      rows.push({
        service: expectedName,
        status: "skipped",
        drift: ["service not found in current Railway project · check project link or rename"]
      });
      continue;
    }
    const deployments = fetchDeploymentList(live.serviceName);
    rows.push(checkService(live, manifest[expectedName], deployments));
  }

  // Restore originally-linked service so the caller's shell isn't left re-linked
  if (originallyLinked) {
    try { execSync(`railway service "${originallyLinked}"`, { stdio: "ignore" }); } catch { /* swallow */ }
  }

  const anyRed = rows.some((r) => r.status === "red");
  const anyYellow = rows.some((r) => r.status === "yellow");

  if (FLAG_JSON) {
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), services: rows }, null, 2));
  } else if (FLAG_QUIET) {
    if (anyRed) console.log(renderTable(rows.filter((r) => r.status === "red")));
  } else {
    console.log(renderTable(rows));
  }

  // Notion alert path · opt-in via NOTION_TOKEN + NOTION_FLEET_ALERT_PAGE_ID env vars.
  // v1 stub: log intent only · full Notion API integration is a follow-up task.
  if (anyRed && process.env.NOTION_TOKEN && process.env.NOTION_FLEET_ALERT_PAGE_ID) {
    if (!FLAG_JSON) console.log("\n[notion] would alert " + rows.filter((r) => r.status === "red").length + " red service(s) · NOTION integration v2 ticket");
  }

  process.exit(anyRed ? 1 : 0);
}

main().catch((err) => {
  console.error(`[railway-health] probe failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
});
