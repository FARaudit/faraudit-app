// One-shot schema audit on apex-production. Lists every public table, flags
// orphans against the known-active list, checks RLS status, generates DROP
// TABLE SQL — but does NOT execute drops. CEO approves before anything runs.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// @ts-expect-error tsx
const { supabase } = await import("./queue.ts");

// Tables every active component reads or writes — keep these.
const ACTIVE_TABLES = new Set<string>([
  // Audit AI worker (this session)
  "audits",
  "pending_audits",
  "fa_intelligence_corpus",
  // bullrize-cron
  "signal_corpus",
  "sec_filings",          // bullrize ingestion writes here
  "smart_money_tracker",  // bullrize tracking
  "retail_sentiment",     // bullrize divergence model
  // apex-intel-pipeline
  "ceo_session_memory",
  "ceo_affirmations",
  "ceo_runway",
  // FARaudit app
  "fa_audit_findings",
  "fa_audit_runs",
  "fa_solicitations",
  "fa_prospects",
  "fa_outreach",
  "ko_intelligence",
  "fa_awards",
  "fa_competitor_intel"
]);

// Tables we KNOW to be problems (per CEO instruction).
const KNOWN_RISKS = new Set<string>(["churn_risk_cust"]);

// Tables that the audits-related fa_intelligence_v2.sql migration creates,
// but that aren't in the active list above. Surface these for explicit
// CEO review rather than auto-marking orphan.
const STAGED_FOR_REVIEW = new Set<string>([
  "fa_weekly_briefs",     // weekly intelligence briefs — fa_intelligence_v2.sql
  "user_preferences"      // CEO timezone/display prefs — fa_intelligence_v2.sql
]);

async function listTables(): Promise<{ table_name: string; row_count: number | null; rls_enabled: boolean }[]> {
  // information_schema isn't directly queryable via PostgREST without an RPC,
  // so we hit the `pg_tables` catalog through a view-style query. Instead use
  // the Supabase REST trick: select count(*) from each candidate. We'll get
  // table names by sampling each candidate.
  //
  // Cleanest path: use rpc('exec_sql', ...) if a security-definer function
  // exists. Try it first; fall back to enumerating known tables.
  const probe = await supabase.rpc("exec_sql", { sql: "select 1" });
  if (!probe.error) {
    // Has exec_sql — query information_schema directly.
    const tables = await supabase.rpc("exec_sql", {
      sql: `
        SELECT
          c.relname AS table_name,
          c.relrowsecurity AS rls_enabled,
          (SELECT reltuples::bigint FROM pg_class WHERE oid = c.oid) AS row_count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY c.relname;
      `
    });
    if (!tables.error && Array.isArray(tables.data)) {
      return tables.data as any[];
    }
  }
  return [];
}

async function listTablesViaPgMeta(): Promise<{ table_name: string; row_count: number | null; rls_enabled: boolean }[]> {
  // Supabase exposes pg-meta via the dashboard; not available via service-role
  // PostgREST. Fall back to: hit the OpenAPI spec at /rest/v1/ which lists
  // every table the service role can see.
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "") + "/rest/v1/";
  const res = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
      Authorization: "Bearer " + (process.env.SUPABASE_SERVICE_ROLE_KEY || "")
    }
  });
  if (!res.ok) {
    console.error(`[audit] PostgREST OpenAPI fetch ${res.status}`);
    return [];
  }
  const spec = await res.json();
  const tableNames = Object.keys(spec.definitions || {});
  // No row counts or RLS info from OpenAPI. We'll fill those in via a probe.
  const out: { table_name: string; row_count: number | null; rls_enabled: boolean }[] = [];
  for (const t of tableNames) {
    let count: number | null = null;
    try {
      const r = await supabase.from(t).select("*", { count: "exact", head: true });
      count = r.count ?? null;
    } catch { /* swallow — some tables may have RLS blocking even service role oddly */ }
    out.push({ table_name: t, row_count: count, rls_enabled: true /* we can't tell from REST */ });
  }
  return out;
}

async function main() {
  console.log("[schema-audit] querying public schema on apex-production");

  let tables = await listTables();
  let usedFallback = false;
  if (tables.length === 0) {
    console.log("[schema-audit] exec_sql RPC unavailable — falling back to PostgREST OpenAPI introspection");
    tables = await listTablesViaPgMeta();
    usedFallback = true;
  }

  if (tables.length === 0) {
    console.error("[schema-audit] could not enumerate tables · service role may lack pg_class read");
    process.exit(1);
  }

  console.log(`[schema-audit] found ${tables.length} tables in public schema\n`);

  const active: typeof tables = [];
  const staged: typeof tables = [];
  const orphans: typeof tables = [];
  const known_risks: typeof tables = [];

  for (const t of tables) {
    if (KNOWN_RISKS.has(t.table_name)) known_risks.push(t);
    else if (ACTIVE_TABLES.has(t.table_name)) active.push(t);
    else if (STAGED_FOR_REVIEW.has(t.table_name)) staged.push(t);
    else orphans.push(t);
  }

  const fmtCount = (n: number | null) => n === null ? "?" : n.toLocaleString();
  const fmtRls = (b: boolean) => usedFallback ? "?" : (b ? "Y" : "N");

  console.log(`═══ ACTIVE (${active.length}) — keep ═══`);
  active.forEach(t => console.log(`  ${t.table_name.padEnd(35)} rows=${String(fmtCount(t.row_count)).padStart(10)}  rls=${fmtRls(t.rls_enabled)}`));

  console.log(`\n═══ STAGED FOR REVIEW (${staged.length}) — known migration tables, may or may not be in use ═══`);
  staged.forEach(t => console.log(`  ${t.table_name.padEnd(35)} rows=${String(fmtCount(t.row_count)).padStart(10)}  rls=${fmtRls(t.rls_enabled)}`));

  console.log(`\n═══ KNOWN RISKS (${known_risks.length}) — drop first per CEO ═══`);
  known_risks.forEach(t => console.log(`  ${t.table_name.padEnd(35)} rows=${String(fmtCount(t.row_count)).padStart(10)}  rls=${fmtRls(t.rls_enabled)}`));

  console.log(`\n═══ ORPHANS (${orphans.length}) — not on active list, candidates for drop ═══`);
  orphans.forEach(t => console.log(`  ${t.table_name.padEnd(35)} rows=${String(fmtCount(t.row_count)).padStart(10)}  rls=${fmtRls(t.rls_enabled)}`));

  // Generate DROP TABLE SQL. Risks first, then orphans.
  const dropTargets = [...known_risks, ...orphans];
  if (dropTargets.length > 0) {
    console.log(`\n═══ DROP TABLE SQL — DO NOT RUN UNTIL CEO APPROVES ═══`);
    console.log(`-- Generated ${new Date().toISOString()} by schema-audit.ts`);
    console.log(`-- Total: ${known_risks.length} known-risk + ${orphans.length} orphan = ${dropTargets.length} table(s)`);
    console.log(`-- Run inside a transaction so a single failure aborts the whole batch.`);
    console.log(`BEGIN;`);
    for (const t of dropTargets) {
      console.log(`DROP TABLE IF EXISTS public.${t.table_name} CASCADE;  -- rows=${fmtCount(t.row_count)}`);
    }
    console.log(`COMMIT;`);
  }
}

main().catch((e) => { console.error("[schema-audit] fatal", e); process.exit(1); });
