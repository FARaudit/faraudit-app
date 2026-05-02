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

// ─── Tab 2: Opportunities ─────────────────────────────────────────────────
export interface OpportunityRow {
  id: string;
  notice_id: string;
  title: string | null;
  agency: string | null;
  naics_code: string | null;
  set_aside: string | null;
  document_type: string | null;
  source: string;
  status: string;
  recommendation: string | null;
  compliance_score: number | null;
  bid_no_bid: string | null;
  pdf_url: string | null;
  created_at: string;
  processed_at: string | null;
}

export async function fetchOpportunities(
  client: SupabaseClient,
  opts: { limit?: number; status?: string | null; naics?: string | null } = {}
): Promise<OpportunityRow[]> {
  const RICH = "id, notice_id, title, agency, naics_code, set_aside, document_type, source, status, recommendation, compliance_score, bid_no_bid, pdf_url, created_at, processed_at";
  const BASIC = "id, notice_id, title, agency, naics_code, set_aside, source, status, recommendation, compliance_score, bid_no_bid, pdf_url, created_at, processed_at";
  for (const cols of [RICH, BASIC]) {
    let q = client
      .from("pending_audits")
      .select(cols)
      .order("created_at", { ascending: false })
      .limit(opts.limit || 100);
    if (opts.status) q = q.eq("status", opts.status);
    if (opts.naics) q = q.eq("naics_code", opts.naics);
    const { data, error } = await q;
    if (error) {
      if (cols === RICH) continue; // migration not applied yet → fall through to BASIC
      throw new Error(`fetchOpportunities: ${error.message}`);
    }
    return ((data || []) as unknown[]).map((r) => ({ document_type: null, ...(r as object) })) as OpportunityRow[];
  }
  return [];
}

// ─── Tab 3: Audit (history) ───────────────────────────────────────────────
export interface AuditRow {
  id: string;
  notice_id: string | null;
  title: string | null;
  agency: string | null;
  recommendation: string | null;
  compliance_score: number | null;
  document_type: string | null;
  audit_source: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export async function fetchRecentAudits(
  client: SupabaseClient,
  limit = 25
): Promise<AuditRow[]> {
  const { data, error } = await client
    .from("audits")
    .select("id, notice_id, title, agency, recommendation, compliance_score, document_type, audit_source, status, created_at, completed_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`fetchRecentAudits: ${error.message}`);
  return (data as AuditRow[]) || [];
}

// ─── Header: live corpus counter ──────────────────────────────────────────
export interface HeaderCounter {
  audits: number;
  traps: number;
}

export async function fetchHeaderCounter(client: SupabaseClient): Promise<HeaderCounter> {
  const [a, c] = await Promise.all([
    client.from("audits").select("*", { count: "exact", head: true }),
    client.from("fa_intelligence_corpus").select("*", { count: "exact", head: true })
  ]);
  return { audits: a.count || 0, traps: c.count || 0 };
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
  const [p0, live, month, traps] = await Promise.all([
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
      .gte("created_at", since30d),
    client.from("fa_intelligence_corpus").select("*", { count: "exact", head: true })
  ]);

  return {
    critical_p0: p0.count || 0,
    expiring_7d: live.count || 0, // proxy until deadline column wired in
    live_sam_gov: live.count || 0,
    audit_activity_month: month.count || 0,
    total_traps_caught: traps.count || 0,
    value_audited_estimate: "$48.2M" // placeholder — sum of ceiling_value_estimate when wired
  };
}
