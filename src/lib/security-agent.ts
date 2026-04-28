// Security Agent — independent of all other agents.
// Reports only to CEO via Resend. Saves results to security_metrics.
// Runs from /api/cron/security-agent.

import type { SupabaseClient } from "@supabase/supabase-js";

export type Severity = "info" | "warning" | "critical";
export type CheckStatus = "pass" | "warn" | "fail";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  details: string;
  severity: Severity;
  metadata?: Record<string, unknown>;
}

const REQUIRED_ENV = [
  "ANTHROPIC_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CHECK 1 — API usage anomaly: today's calls vs 7-day avg
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function checkApiUsage(sb: SupabaseClient): Promise<CheckResult> {
  try {
    const dayAgo = new Date(Date.now() - 86400_000).toISOString();
    const sevenAgo = new Date(Date.now() - 7 * 86400_000).toISOString();

    // Best-effort: model_runs may or may not exist depending on the repo.
    const { count: today } = await sb
      .from("model_runs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", dayAgo);
    const { count: sevenDay } = await sb
      .from("model_runs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenAgo);

    const todayCount = today ?? 0;
    const sevenDayCount = sevenDay ?? 0;
    const avg = sevenDayCount > 0 ? sevenDayCount / 7 : 0;
    const ratio = avg > 0 ? todayCount / avg : 0;

    if (ratio > 2 && todayCount > 50) {
      return {
        name: "API usage anomaly",
        status: "warn",
        severity: "warning",
        details: `Today ${todayCount} calls vs 7d avg ${avg.toFixed(0)} (${ratio.toFixed(2)}x).`,
        metadata: { today: todayCount, seven_day_avg: avg, ratio }
      };
    }
    return {
      name: "API usage anomaly",
      status: "pass",
      severity: "info",
      details: `Today ${todayCount} · 7d avg ${avg.toFixed(0)} · ratio ${ratio.toFixed(2)}x`
    };
  } catch (err) {
    return {
      name: "API usage anomaly",
      status: "warn",
      severity: "info",
      details: `Telemetry unavailable: ${err instanceof Error ? err.message : "unknown"}`
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CHECK 2 — RLS verification: every public table has rowsecurity=true
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function checkRls(sb: SupabaseClient): Promise<CheckResult> {
  try {
    const { data, error } = await sb.rpc("rls_status_check");
    if (error || !data) {
      // Fall back to a raw query via the internal information_schema view if RPC not present.
      const { data: rows } = await sb
        .from("pg_tables_no_rls" as never)
        .select("tablename")
        .limit(50);
      if (Array.isArray(rows) && rows.length > 0) {
        return {
          name: "RLS verification",
          status: "fail",
          severity: "critical",
          details: `${rows.length} public tables WITHOUT row-level security.`,
          metadata: { tables: rows }
        };
      }
      return {
        name: "RLS verification",
        status: "warn",
        severity: "info",
        details: "rls_status_check RPC not available — install schema/security_agent.sql to enable."
      };
    }
    const noRls = (data as Array<{ tablename: string }>) ?? [];
    if (noRls.length > 0) {
      return {
        name: "RLS verification",
        status: "fail",
        severity: "critical",
        details: `${noRls.length} public tables WITHOUT RLS: ${noRls.map((r) => r.tablename).slice(0, 8).join(", ")}`,
        metadata: { tables: noRls }
      };
    }
    return {
      name: "RLS verification",
      status: "pass",
      severity: "info",
      details: "All public tables enforce row-level security."
    };
  } catch (err) {
    return {
      name: "RLS verification",
      status: "warn",
      severity: "warning",
      details: `RLS check failed: ${err instanceof Error ? err.message : "unknown"}`
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CHECK 3 — Failed authentication monitor (last 24h)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function checkFailedAuth(sb: SupabaseClient): Promise<CheckResult> {
  try {
    const { data, error } = await sb.rpc("auth_failures_24h");
    if (error || !Array.isArray(data)) {
      return {
        name: "Failed authentication",
        status: "warn",
        severity: "info",
        details: "auth_failures_24h RPC not available — install schema/security_agent.sql to enable."
      };
    }
    const offenders = (data as Array<{ ip_address: string; count: number }>).filter(
      (r) => r.count > 10
    );
    if (offenders.length > 0) {
      return {
        name: "Failed authentication",
        status: "fail",
        severity: "warning",
        details: `${offenders.length} IPs with > 10 failed logins in 24h.`,
        metadata: { offenders }
      };
    }
    return {
      name: "Failed authentication",
      status: "pass",
      severity: "info",
      details: "No IPs with > 10 failed logins in 24h."
    };
  } catch (err) {
    return {
      name: "Failed authentication",
      status: "warn",
      severity: "info",
      details: `Auth-log check failed: ${err instanceof Error ? err.message : "unknown"}`
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CHECK 4 — Required env vars present + non-empty
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function checkEnv(): CheckResult {
  const missing: string[] = [];
  for (const k of REQUIRED_ENV) {
    const v = process.env[k];
    if (!v || !v.trim()) missing.push(k);
  }
  if (missing.length > 0) {
    return {
      name: "Environment variables",
      status: "fail",
      severity: "critical",
      details: `Missing or empty: ${missing.join(", ")}`,
      metadata: { missing }
    };
  }
  return {
    name: "Environment variables",
    status: "pass",
    severity: "info",
    details: `${REQUIRED_ENV.length} required env vars present.`
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CHECK 5 — Cost spike (token volume today vs 7d avg)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function checkCostSpike(sb: SupabaseClient): Promise<CheckResult> {
  try {
    const dayAgo = new Date(Date.now() - 86400_000).toISOString();
    const sevenAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data: todayRows } = await sb
      .from("model_runs")
      .select("input_tokens, output_tokens")
      .gte("created_at", dayAgo);
    const { data: sevenRows } = await sb
      .from("model_runs")
      .select("input_tokens, output_tokens")
      .gte("created_at", sevenAgo);

    const sumTokens = (rows: Array<{ input_tokens: number | null; output_tokens: number | null }> | null) =>
      (rows ?? []).reduce((s, r) => s + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), 0);

    const today = sumTokens((todayRows as never) ?? null);
    const week = sumTokens((sevenRows as never) ?? null);
    const avg = week / 7;
    const ratio = avg > 0 ? today / avg : 0;

    if (ratio > 2 && today > 100_000) {
      return {
        name: "Cost spike",
        status: "warn",
        severity: "warning",
        details: `Tokens today ${today.toLocaleString()} vs 7d avg ${avg.toFixed(0)} (${ratio.toFixed(2)}x).`,
        metadata: { today, seven_day_avg: avg, ratio }
      };
    }
    return {
      name: "Cost spike",
      status: "pass",
      severity: "info",
      details: `Tokens today ${today.toLocaleString()} · 7d avg ${avg.toFixed(0)}`
    };
  } catch (err) {
    return {
      name: "Cost spike",
      status: "warn",
      severity: "info",
      details: `Cost telemetry unavailable: ${err instanceof Error ? err.message : "unknown"}`
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CHECK 6 — New user velocity (signups last 24h)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function checkNewUserVelocity(sb: SupabaseClient): Promise<CheckResult> {
  try {
    const { data, error } = await sb.rpc("new_users_24h");
    if (error || typeof data !== "number") {
      return {
        name: "New user velocity",
        status: "warn",
        severity: "info",
        details: "new_users_24h RPC not available — install schema/security_agent.sql."
      };
    }
    if (data > 50) {
      return {
        name: "New user velocity",
        status: "warn",
        severity: "warning",
        details: `${data} new signups in 24h — verify these are legitimate (bot signup possible).`,
        metadata: { count: data }
      };
    }
    return {
      name: "New user velocity",
      status: "pass",
      severity: "info",
      details: `${data} new signups in 24h.`
    };
  } catch (err) {
    return {
      name: "New user velocity",
      status: "warn",
      severity: "info",
      details: `Signup metric unavailable: ${err instanceof Error ? err.message : "unknown"}`
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CHECK 7 — Data access pattern (large bulk reads in last 24h)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function checkDataAccess(sb: SupabaseClient): Promise<CheckResult> {
  try {
    // Heuristic: if any single user produced > 1000 model_runs in last 24h
    // that's a candidate for unusual scraping or runaway loop.
    const dayAgo = new Date(Date.now() - 86400_000).toISOString();
    const { data: rows } = await sb
      .from("model_runs")
      .select("user_id")
      .gte("created_at", dayAgo)
      .limit(20_000);
    const counts = new Map<string, number>();
    for (const r of (rows ?? []) as Array<{ user_id: string | null }>) {
      const k = r.user_id ?? "anon";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const heavy = Array.from(counts.entries()).filter(([, c]) => c > 1000);
    if (heavy.length > 0) {
      return {
        name: "Data access pattern",
        status: "warn",
        severity: "warning",
        details: `${heavy.length} user(s) with > 1000 model runs in 24h.`,
        metadata: { heavy: heavy.map(([uid, c]) => ({ user_id: uid, count: c })) }
      };
    }
    return {
      name: "Data access pattern",
      status: "pass",
      severity: "info",
      details: "No outlier per-user query volume in 24h."
    };
  } catch (err) {
    return {
      name: "Data access pattern",
      status: "warn",
      severity: "info",
      details: `Pattern check failed: ${err instanceof Error ? err.message : "unknown"}`
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Orchestrator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function runAllChecks(sb: SupabaseClient): Promise<CheckResult[]> {
  const results = await Promise.all([
    checkApiUsage(sb),
    checkRls(sb),
    checkFailedAuth(sb),
    Promise.resolve(checkEnv()),
    checkCostSpike(sb),
    checkNewUserVelocity(sb),
    checkDataAccess(sb)
  ]);
  return results;
}

export function statusGlyph(s: CheckStatus): string {
  if (s === "pass") return "✅";
  if (s === "warn") return "⚠️";
  return "🚨";
}

export function renderTextReport(company: string, results: CheckResult[]): string {
  const date = new Date();
  const stamp = date.toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });
  const overall = results.some((r) => r.status === "fail")
    ? "🚨 ATTENTION REQUIRED"
    : results.some((r) => r.status === "warn")
    ? "⚠️ WARNINGS"
    : "✅ ALL CLEAR";

  const lines = [
    "APEX SECURITY REPORT",
    `${company} · ${stamp} CT`,
    "─────────────────────",
    overall,
    ""
  ];
  for (const r of results) {
    lines.push(`${statusGlyph(r.status)} ${r.name}`);
    lines.push(`   ${r.details}`);
    lines.push("");
  }
  return lines.join("\n");
}
