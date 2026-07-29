// BD OS — server-side Supabase queries.
// Run inside server components with createServerClient (auth-aware) for
// per-user views; for global stats (corpus tab) use the service-role client
// from supabase-admin if available, falling back to the user's session.

import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Tab 7: Corpus ────────────────────────────────────────────────────────
export interface CorpusStats {
  total_audits: number;
  total_corpus_rows: number;
  trap_breakdown: { clause: string; count: number; severity: string | null }[];
  agency_breakdown: { agency: string; count: number }[];
  recent_30d_audits: number;
  pending_queue_size: number;
}

export async function fetchCorpusStats(client: SupabaseClient): Promise<CorpusStats> {
  const [auditsAll, auditsRecent, corpus, pending] = await Promise.all([
    client.from("audits").select("*", { count: "exact", head: true }),
    client
      .from("audits")
      .select("*", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString()),
    client.from("fa_intelligence_corpus").select("trap_type, metadata"),
    client.from("pending_audits").select("*", { count: "exact", head: true }).eq("status", "pending")
  ]);

  // Trap breakdown: aggregate corpus rows by trap_type.
  const trapMap = new Map<string, { count: number; severity: string | null }>();
  for (const row of (corpus.data as any[]) || []) {
    const key = row.trap_type || "unknown";
    const sev = row?.metadata?.severity || null;
    const entry = trapMap.get(key) || { count: 0, severity: sev };
    entry.count += 1;
    trapMap.set(key, entry);
  }
  const trap_breakdown = Array.from(trapMap.entries())
    .map(([clause, v]) => ({ clause, count: v.count, severity: v.severity }))
    .sort((a, b) => b.count - a.count);

  // Agency breakdown: top agencies by audit count.
  const { data: agencyRows } = await client
    .from("audits")
    .select("agency")
    .not("agency", "is", null)
    .limit(1000);
  const agencyMap = new Map<string, number>();
  for (const a of (agencyRows as any[]) || []) {
    const key = a.agency as string;
    agencyMap.set(key, (agencyMap.get(key) || 0) + 1);
  }
  const agency_breakdown = Array.from(agencyMap.entries())
    .map(([agency, count]) => ({ agency, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    total_audits: auditsAll.count || 0,
    total_corpus_rows: ((corpus.data as any[]) || []).length,
    trap_breakdown,
    agency_breakdown,
    recent_30d_audits: auditsRecent.count || 0,
    pending_queue_size: pending.count || 0
  };
}

// ─── Tab 3: Audit (history) ───────────────────────────────────────────────
export interface AuditRow {
  id: string;
  notice_id: string | null;
  solicitation_number: string | null;
  title: string | null;
  agency: string | null;
  // Card #450 — Past Audits NAICS + set-aside slicers read these off the audits
  // table (both columns exist + are 100% populated; no migration).
  naics_code: string | null;
  set_aside: string | null;
  recommendation: string | null;
  /** R3: extracted from compliance_json.v3.verdict; use poleToRecommendation(row) to read. */
  v3_verdict: string | null;
  compliance_score: number | null;
  document_type: string | null;
  audit_source: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  response_deadline: string | null;
  contract_type: string | null;
  outcome: string | null;
  bid_submitted: boolean | null;
  in_pipeline: boolean;
  prime_sub: "prime" | "sub" | null;
  // FA-126 — "SCORED" | "DECISION_GATE" | null. Gate-mode audits suppress
  // the numeric score on the report (view-model nulls it); ledger surfaces
  // must mirror that so the same audit never shows 35 in one place and "—"
  // in another.
  verdict_type: string | null;
  // FA-163 P0-4 — DECISION_GATE audits null their score; the gate array
  // (compliance_json.verdict.gates) drives the ledger "N gates" badge so they
  // don't fall through to a misleading "Watch".
  verdict_gates: unknown[] | null;
  // FA-167 — Recently Audited card bindings. office_leaf is the persisted SAM
  // buying-office leaf (FA-151); home/page.tsx server-resolves it through
  // cleanAgencyName() into office_display so the card never renders the
  // redundant "DEPT OF DEFENSE" parent. exec_* are the executive_summary
  // sub-fields the card binds (verdict pill + insight = verdict tail of `what`).
  office_leaf: string | null;
  exec_what: string | null;
  exec_verdict: string | null;
  exec_factors: string | null;
  // Server-derived in home/page.tsx — cleanAgencyName(office_leaf || agency).
  office_display?: string;
}

// ─── Tab 4: Defense Spending Intel (FA-96) ────────────────────────────────
export interface DefenseRecipient { name: string; amount: number }
export interface DefenseRecompete { award_id: string; recipient: string; amount: number; agency: string; end_date: string }
export interface DefenseStateBucket { state: string; amount: number }

export interface DefenseSpendingRow {
  id: string;
  naics_code: string;
  fiscal_year: number;
  total_obligations: number | null;
  sb_obligations: number | null;
  sb_pct: number | null;
  top_recipients: DefenseRecipient[] | null;
  // FA-96b: top 10 recipients on SB set-aside awards only (ICP intelligence).
  // Column added via supabase/migrations/20260520*_add_sb_recipients.sql.
  sb_recipients: DefenseRecipient[] | null;
  agency_breakdown: DefenseRecipient[] | null;
  state_breakdown: DefenseStateBucket[] | null;
  contract_type_breakdown: DefenseRecipient[] | null;
  recompetes_expiring_90d: DefenseRecompete[] | null;
  recompetes_expiring_180d: DefenseRecompete[] | null;
  yoy_delta_pct: number | null;
  refreshed_at: string;
}

export async function fetchDefenseSpending(client: SupabaseClient, naicsCode?: string): Promise<DefenseSpendingRow[]> {
  let q = client.from("defense_spending_intel").select("*").order("fiscal_year", { ascending: false });
  if (naicsCode) q = q.eq("naics_code", naicsCode);
  const { data, error } = await q;
  if (error) {
    console.error(`fetchDefenseSpending: ${error.message}`);
    return [];
  }
  return (data as DefenseSpendingRow[]) || [];
}

export async function fetchRecentAudits(
  client: SupabaseClient,
  userId: string,
  limit = 25
): Promise<AuditRow[]> {
  const { data, error } = await client
    .from("audits")
    // R3: v3_verdict extracts the authoritative pole (compliance_json.v3.verdict)
    // so readers can call poleToRecommendation(row) without fetching the full JSON blob.
    .select("id, notice_id, solicitation_number, title, agency, naics_code, set_aside, recommendation, v3_verdict:compliance_json->v3->>verdict, compliance_score, document_type, audit_source, status, created_at, completed_at, response_deadline, contract_type, outcome, bid_submitted, in_pipeline, prime_sub, verdict_type:compliance_json->verdict->>type, verdict_gates:compliance_json->verdict->gates, office_leaf, exec_what:compliance_json->executive_summary->>what, exec_verdict:compliance_json->executive_summary->>verdict, exec_factors:compliance_json->executive_summary->>factors")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`fetchRecentAudits: ${error.message}`);
  return (data as AuditRow[]) || [];
}

// ─── KO intelligence ──────────────────────────────────────────────────────
export interface KORow {
  id: string;
  ko_email: string;
  ko_name: string | null;
  ko_phone: string | null;
  agency: string | null;
  agency_office: string | null;
  naics_codes: string[] | null;
  solicitations_issued: number;
  questions_asked: number;
  questions_answered: number;
  avg_response_days: number | null;
  last_contact: string | null;
  last_solicitation_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchKOs(client: SupabaseClient): Promise<KORow[]> {
  const { data, error } = await client
    .from("ko_intelligence")
    .select("*")
    .order("last_contact", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) return []; // table may not exist yet — graceful empty list
  return (data as KORow[]) || [];
}

// ─── Agency intelligence ──────────────────────────────────────────────────
export interface AgencyRow {
  agency: string;
  total_audits: number;
  avg_score: number | null;
  top_traps: { clause: string; count: number }[];
  top_naics: { code: string; count: number }[];
  recent: { id: string; notice_id: string | null; solicitation_number: string | null; title: string | null; compliance_score: number | null; created_at: string }[];
  win_rate: number | null;
}

export async function fetchAgencyStats(client: SupabaseClient): Promise<AgencyRow[]> {
  const { data: audits } = await client
    .from("audits")
    .select("id, agency, notice_id, solicitation_number, title, naics_code, compliance_score, outcome, created_at")
    .not("agency", "is", null)
    .order("created_at", { ascending: false })
    .limit(2000);
  const { data: corpus } = await client
    .from("fa_intelligence_corpus")
    .select("agency, trap_type")
    .not("agency", "is", null)
    .limit(5000);

  const map = new Map<string, AgencyRow>();
  for (const a of (audits || []) as Array<Record<string, unknown>>) {
    const agency = String(a.agency);
    if (!map.has(agency)) {
      map.set(agency, { agency, total_audits: 0, avg_score: null, top_traps: [], top_naics: [], recent: [], win_rate: null });
    }
    const row = map.get(agency)!;
    row.total_audits += 1;
    if (row.recent.length < 5) {
      row.recent.push({
        id: String(a.id),
        notice_id: (a.notice_id as string) ?? null,
        solicitation_number: (a.solicitation_number as string) ?? null,
        title: (a.title as string) ?? null,
        compliance_score: typeof a.compliance_score === "number" ? (a.compliance_score as number) : null,
        created_at: String(a.created_at)
      });
    }
  }

  // Compute avg_score, win_rate, top_naics per agency.
  for (const [agency, row] of map.entries()) {
    const ofAgency = (audits || []).filter((a) => (a as Record<string, unknown>).agency === agency) as Array<Record<string, unknown>>;
    const scores = ofAgency.map((a) => a.compliance_score).filter((s): s is number => typeof s === "number");
    row.avg_score = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    const outcomes = ofAgency.map((a) => a.outcome as string | null).filter((o): o is string => typeof o === "string");
    const wins = outcomes.filter((o) => o === "won").length;
    const decided = outcomes.filter((o) => o === "won" || o === "lost").length;
    row.win_rate = decided > 0 ? Math.round((wins / decided) * 100) : null;

    const naicsMap = new Map<string, number>();
    for (const a of ofAgency) {
      const n = a.naics_code as string;
      if (!n) continue;
      naicsMap.set(n, (naicsMap.get(n) || 0) + 1);
    }
    row.top_naics = Array.from(naicsMap.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }

  for (const c of (corpus || []) as Array<Record<string, unknown>>) {
    const agency = String(c.agency);
    const trap = String(c.trap_type || "unknown");
    const row = map.get(agency);
    if (!row) continue;
    const existing = row.top_traps.find((t) => t.clause === trap);
    if (existing) existing.count += 1;
    else row.top_traps.push({ clause: trap, count: 1 });
  }
  for (const row of map.values()) {
    row.top_traps.sort((a, b) => b.count - a.count);
    row.top_traps = row.top_traps.slice(0, 3);
  }

  return Array.from(map.values()).sort((a, b) => b.total_audits - a.total_audits);
}

// ─── Header: live corpus counter ──────────────────────────────────────────
export interface HeaderCounter {
  audits: number;
  traps: number;
}

export async function fetchHeaderCounter(client: SupabaseClient): Promise<HeaderCounter> {
  // FA-164: scope to the current user. audits is RLS-scoped to the owner (017).
  // Traps = sum of each audit's compliance_json.dfars_flags. The
  // fa_intelligence_corpus is a service-role-only, cross-customer, cron-built
  // aggregate — it reads 0 under a user session (verified), so the prior
  // corpus count never reflected the user (the "500" was a service-role view).
  const { data } = await client
    .from("audits")
    .select("dfars_flags:compliance_json->dfars_flags");
  const rows = (data ?? []) as Array<{ dfars_flags: unknown }>;
  const traps = rows.reduce(
    (n, r) => n + (Array.isArray(r.dfars_flags) ? r.dfars_flags.length : 0),
    0
  );
  return { audits: rows.length, traps };
}

// ─── Intelligence Home: 4 stat cards ──────────────────────────────────────
export interface HomeStats {
  critical_p0: number;          // audits with score < 40
  expiring_7d: number;          // pending_audits with deadline within 7 days (proxy: pending count for now)
  live_sam_gov: number;         // pending_audits.status='pending' count
  audit_activity_month: number; // audits created in last 30 days
  total_traps_caught: number;
  value_audited_estimate: string; // placeholder until we extract ceiling values
}

export async function fetchHomeStats(client: SupabaseClient): Promise<HomeStats> {
  const since30d = new Date(Date.now() - 30 * 86400_000).toISOString();
  // FA-164: traps = sum of dfars_flags across the user's audits (RLS-scoped);
  // the corpus reads 0 under a user session (service-role-only aggregate).
  const { data: flagRows } = await client
    .from("audits")
    .select("dfars_flags:compliance_json->dfars_flags");
  const total_traps_caught = ((flagRows ?? []) as Array<{ dfars_flags: unknown }>).reduce(
    (n, r) => n + (Array.isArray(r.dfars_flags) ? r.dfars_flags.length : 0),
    0
  );
  const [p0, live, month] = await Promise.all([
    client
      .from("audits")
      .select("*", { count: "exact", head: true })
      .lt("compliance_score", 40),
    client
      .from("pending_audits")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    client
      .from("audits")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since30d)
  ]);

  return {
    critical_p0: p0.count || 0,
    expiring_7d: live.count || 0, // proxy until deadline column wired in
    live_sam_gov: live.count || 0,
    audit_activity_month: month.count || 0,
    total_traps_caught,
    value_audited_estimate: "$48.2M" // placeholder — sum of ceiling_value_estimate when wired
  };
}
