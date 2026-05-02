// QA AI — Railway cron worker. Every 30 min, runs all checks against all 3
// production domains. If any regression fires, posts a structured Telegram
// alert to APEX CEO BOT. DRY_RUN=true (default) logs results without alerting.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// Dynamic imports AFTER env load — checks.ts and telegram.ts both capture
// process.env at module-init time.
// @ts-expect-error tsx
const checksNs: any = await import("./checks.ts");
const c = checksNs.default ?? checksNs;
const { ALL_CHECKS, runCheck } = c;

// @ts-expect-error tsx
const telegramNs: any = await import("./telegram.ts");
const t = telegramNs.default ?? telegramNs;
const { sendAlert } = t;

const DRY_RUN = process.env.DRY_RUN !== "false";  // default true for safety
const ALERT_ON = (process.env.ALERT_ON || "route_status,auth_wall,api_endpoint,html_marker")
  .split(",").map((s) => s.trim()).filter(Boolean);

interface FailureGroup {
  kind: string;
  failures: any[];
}

function fmtDuration(ms: number): string {
  return `${ms}ms`;
}

function groupFailures(results: any[]): FailureGroup[] {
  const groups = new Map<string, any[]>();
  for (const r of results) {
    if (r.ok) continue;
    if (!groups.has(r.spec.kind)) groups.set(r.spec.kind, []);
    groups.get(r.spec.kind)!.push(r);
  }
  return Array.from(groups.entries()).map(([kind, failures]) => ({ kind, failures }));
}

function buildAlertMessage(groups: FailureGroup[], totalChecks: number): string {
  const ts = new Date().toISOString().replace("T", " ").replace(/\..*/, "");
  const failureCount = groups.reduce((acc, g) => acc + g.failures.length, 0);
  const lines: string[] = [];
  lines.push(`🚨 *QA AI — ${failureCount} regression${failureCount === 1 ? "" : "s"} of ${totalChecks} checks*`);
  lines.push(`_${ts} UTC_`);
  lines.push("");

  const KIND_LABEL: Record<string, string> = {
    route_status: "🌐 Route status",
    auth_wall:    "🔒 Auth wall",
    api_endpoint: "🔌 API endpoint",
    html_marker:  "📄 HTML marker"
  };

  for (const g of groups) {
    lines.push(`*${KIND_LABEL[g.kind] || g.kind}*`);
    for (const f of g.failures) {
      lines.push(`• ${f.spec.name}`);
      lines.push(`  ${f.reason}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  const startedAt = new Date();
  console.log(`[qa-ai] start ${startedAt.toISOString()} · DRY_RUN=${DRY_RUN}`);
  console.log(`[qa-ai] running ${ALL_CHECKS.length} checks`);

  // Run checks in parallel — they're independent HTTP requests.
  const results = await Promise.all(ALL_CHECKS.map((spec: any) => runCheck(spec)));

  let okCount = 0;
  for (const r of results) {
    if (r.ok) {
      okCount++;
      console.log(`  ✓ ${r.spec.name} · ${r.status} · ${fmtDuration(r.durationMs)}`);
    } else {
      console.log(`  ✗ ${r.spec.name} · ${r.status ?? "—"} · ${r.reason} · ${fmtDuration(r.durationMs)}`);
    }
  }

  const failureCount = results.length - okCount;
  console.log(`\n[qa-ai] result · ok=${okCount} fail=${failureCount} of ${results.length}`);

  if (failureCount === 0) {
    console.log("[qa-ai] all green — no alert");
    return;
  }

  // Filter failures to only the kinds the user opted into alerting on.
  const groups = groupFailures(results).filter((g) => ALERT_ON.includes(g.kind));
  if (groups.length === 0) {
    console.log("[qa-ai] failures present but none in ALERT_ON list — no alert");
    return;
  }

  const message = buildAlertMessage(groups, results.length);
  console.log("\n[qa-ai] alert message:\n" + message);

  if (DRY_RUN) {
    console.log("\n[DRY_RUN] not sending Telegram alert — set DRY_RUN=false to enable");
    return;
  }

  const alert = await sendAlert(message);
  if (alert.ok) {
    console.log("[qa-ai] Telegram alert sent");
  } else {
    console.error(`[qa-ai] Telegram alert FAILED: ${alert.reason}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[qa-ai] fatal", e);
  process.exit(1);
});
