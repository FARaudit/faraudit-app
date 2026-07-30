// Live SAM.gov feed for the /home Intelligence Feed (Opportunities tab).
//
// CEO decision 2026-07-29: go live-source. The sam-ingest Railway cron that
// used to populate pending_audits (source='sam_live') was retired 2026-05-30
// (commit 043d229), freezing the queue-backed feed at May 4 rows. Per the
// corpus-retirement doctrine the feed now reads SAM.gov on demand instead of
// a stored queue. pending_audits keeps serving source='user' audit rows only.
//
// Shape contract: returns the same OpportunityRow the queue path produced, so
// HomeClient renders unchanged. Live-row differences, all honest-nulls:
//   - title_plain stays null (Haiku enrichment was a cron-side paid call; the
//     UI falls back to cleanTitle(title)).
//   - risk_level stays null; enrichRow's view-time deadline escalation
//     (≤3d → P0, ≤7d → P1) still fires.
//   - watched / in_pipeline are always false: live rows have no pending_audits
//     backing, so the pin/watch mutations cannot apply (HomeClient hides those
//     controls for source='sam_live').
//
// Failure direction — fail-closed, mirroring searchOpportunitiesByNaics
// (src/lib/sam.ts): any per-NAICS call failing fails the whole fetch; a
// partial result presented as the full feed would be a lie. No fabricated
// rows, no stale fallback. Error messages carry status only — the api_key is
// embedded in upstream URLs and must never surface.

import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyDocType, resolveAgency, sanitizeSolicitationNumber } from "@/lib/sam";
import type { OpportunityRow } from "./queries";

// Matches the /api/sam route's default NAICS set; NAICS_CODES env overrides
// (same variable the retired sam-ingest cron used).
const DEFAULT_NAICS = "336413,332710,332720,332999,334511";

// One page per NAICS. 30-day posted window ≈ low hundreds of notices per
// manufacturing NAICS, so 1000 (SAM's per-call max) never truncates in
// practice; if it ever does we log the shortfall instead of hiding it.
const PAGE_LIMIT = 1000;
const WINDOW_DAYS = 30;
const FEED_CAP = 200; // parity with the old fetchOpportunities({ limit: 200 })

function fmtSamDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

interface RawSamItem {
  noticeId?: string;
  title?: string;
  solicitationNumber?: string | null;
  fullParentPathName?: string | null;
  department?: string | null;
  subTier?: string | null;
  naicsCode?: string | null;
  type?: string | null;
  typeOfSetAside?: string | null;
  typeOfSetAsideDescription?: string | null;
  postedDate?: string | null;
  responseDeadLine?: string | null;
  resourceLinks?: string[] | null;
  uiLink?: string | null;
  awardCeiling?: number | null;
  baseAndAllOptionsValue?: number | null;
}

async function searchNaicsPage(
  apiKey: string,
  naics: string,
  postedFrom: string,
  postedTo: string
): Promise<{ items: RawSamItem[]; total: number }> {
  const params = new URLSearchParams({
    api_key: apiKey,
    // ncode, NOT naicsCode — probed 2026-07-29: naicsCode is silently ignored
    // (returns the full unfiltered feed); ncode actually filters. Mirrors
    // agents/sam-ingest/sam-client.ts + src/lib/sam.ts searchOpportunitiesByNaics.
    ncode: naics,
    postedFrom,
    postedTo,
    limit: String(PAGE_LIMIT),
    // No typeOfSetAside filter: the feed carries all set-asides incl.
    // unrestricted; HomeClient's set-aside chips slice client-side.
    ptype: "o,p,k,r,s" // solicitation / pre-sol / combined / sources sought / special
  });
  const res = await fetch(`https://sam.gov/api/prod/opportunities/v2/search?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) {
    // Status only — the upstream body/URL can embed the api_key.
    throw new Error(`SAM.gov upstream error: HTTP ${res.status} for NAICS ${naics}`);
  }
  const data = await res.json();
  const items = Array.isArray(data.opportunitiesData) ? (data.opportunitiesData as RawSamItem[]) : [];
  return { items, total: typeof data.totalRecords === "number" ? data.totalRecords : items.length };
}

// Exported for tests. Pure mapping + filtering of raw SAM items into
// OpportunityRow skeletons (audit cross-ref fields filled by the caller).
export function mapSamItems(raw: RawSamItem[], now: Date): OpportunityRow[] {
  const seen = new Set<string>();
  const rows: OpportunityRow[] = [];
  let droppedNoPdf = 0;
  let droppedExpired = 0;
  for (const o of raw) {
    if (!o.noticeId || seen.has(o.noticeId)) continue;
    seen.add(o.noticeId);
    // Same filter the retired cron applied (May 4 2026 diagnosis): no
    // resourceLinks → NSN/metadata-only notice with no attachable PDF —
    // nothing the audit engine can read. Fewer-but-auditable rows.
    const pdfUrl = o.resourceLinks?.[0] || null;
    if (!pdfUrl) {
      droppedNoPdf++;
      continue;
    }
    // Live-feed fix for the old queue's demo-killer: expired notices don't
    // enter the feed at all. Null deadlines (sources sought etc.) stay.
    if (o.responseDeadLine) {
      const dl = Date.parse(o.responseDeadLine);
      if (!Number.isNaN(dl) && dl < now.getTime()) {
        droppedExpired++;
        continue;
      }
    }
    rows.push({
      id: o.noticeId,
      notice_id: o.noticeId,
      solicitation_number: sanitizeSolicitationNumber(o.solicitationNumber),
      title: o.title || null,
      agency: resolveAgency(o),
      naics_code: o.naicsCode || null,
      set_aside: o.typeOfSetAsideDescription || o.typeOfSetAside || null,
      document_type: classifyDocType(o.type ?? null),
      notice_type: o.type ?? null,
      incumbent_name: null,
      source: "sam_live",
      status: "live",
      recommendation: null,
      v3_verdict: null,
      compliance_score: null,
      bid_no_bid: null,
      pdf_url: pdfUrl,
      risk_level: null,
      response_deadline: o.responseDeadLine ?? null,
      in_pipeline: false,
      watched: false,
      title_plain: null,
      is_audited: false,
      award_ceiling: o.awardCeiling ?? o.baseAndAllOptionsValue ?? null,
      created_at: o.postedDate ?? now.toISOString(),
      processed_at: null
    });
  }
  if (droppedNoPdf || droppedExpired) {
    console.log(`[live-opportunities] filtered · ${droppedNoPdf} no-PDF · ${droppedExpired} expired`);
  }
  rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  if (rows.length > FEED_CAP) {
    console.log(`[live-opportunities] capping feed at ${FEED_CAP} of ${rows.length} rows (newest first)`);
    rows.length = FEED_CAP;
  }
  return rows;
}

// Exported for tests (uncached). Production goes through the unstable_cache
// wrapper below so SAM.gov sees at most ~one refresh per half hour per NAICS
// set, not one per pageview.
export async function fetchLiveSamRowsUncached(naicsCsv: string): Promise<OpportunityRow[]> {
  const apiKey = process.env.SAM_API_KEY;
  if (!apiKey) throw new Error("SAM_API_KEY is not configured on the server");
  const codes = naicsCsv.split(",").map((s) => s.trim()).filter(Boolean);
  const now = new Date();
  const from = fmtSamDate(new Date(now.getTime() - WINDOW_DAYS * 86400_000));
  const to = fmtSamDate(now);
  const pages = await Promise.all(codes.map((c) => searchNaicsPage(apiKey, c, from, to)));
  for (let i = 0; i < codes.length; i++) {
    if (pages[i].total > pages[i].items.length) {
      console.warn(`[live-opportunities] NAICS ${codes[i]}: ${pages[i].items.length}/${pages[i].total} fetched — window has more than one page`);
    }
  }
  return mapSamItems(pages.flatMap((p) => p.items), now);
}

const fetchLiveSamRowsCached = unstable_cache(
  fetchLiveSamRowsUncached,
  ["home-live-sam-feed"],
  { revalidate: 1800 } // 30 min — ~5 upstream calls per refresh, ~240/day worst case
);

// PIECE A — the feed searches the CUSTOMER's codes, not a global list.
//
// Until 2026-07-29 this read `NAICS_CODES` env else a hardcoded five-code list,
// and never read the signed-in customer at all. Measured consequence on the one
// populated profile: the hardcoded list queries 332720 (returns ZERO rows) while
// the customer's actual 332721 was never queried, and the customer is SDVOSB on
// file while the tab's SDVOSB filter could never match. A NAICS list that was
// assembled rather than chosen.
//
// Failure direction is CLOSED and it is deliberate: a customer with no codes on
// file gets `codes: []` → an honest-empty feed carrying the reason, NOT a
// fallback to the global list. Falling back would show a brand-new account 200
// notices for someone else's business and call it theirs. The env var is kept as
// an operator override for probes/scripts that run without a user session.
// `source` is the discriminator; `codes` is empty iff source is "no-profile-codes".
export type FeedScope = {
  codes: string[];
  source: "profile" | "env-override" | "no-profile-codes";
};

export async function resolveFeedScope(client: SupabaseClient): Promise<FeedScope> {
  const { data, error } = await client
    .from("capability_statements")
    .select("naics_codes")
    .maybeSingle();
  const codes = (!error && Array.isArray(data?.naics_codes) ? data!.naics_codes : [])
    .map((c) => String(c).trim())
    .filter(Boolean);
  if (codes.length > 0) return { codes, source: "profile" };
  // No codes on file. An explicit operator override still works (scripts/probes
  // with no user session); otherwise honest-empty.
  const override = (process.env.NAICS_CODES || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (override.length > 0) return { codes: override, source: "env-override" };
  return { codes: [], source: "no-profile-codes" };
}

// The /home + command-center entry point. SAM rows come from the shared
// 30-minute cache (keyed by the code list, so each distinct profile gets its own
// entry); the audits cross-ref runs per-request with the caller's Supabase
// client so AUDIT badges / scores are always current (FA-89f semantics).
// Callers that must tell "no codes on file" apart from "codes on file, empty
// window" use this. The two are identical as a row count and must NOT render the
// same way: one is a profile the customer can fix in place, the other is a real
// zero-result window.
export async function fetchLiveOpportunitiesScoped(
  client: SupabaseClient
): Promise<{ rows: OpportunityRow[]; scope: FeedScope }> {
  const scope = await resolveFeedScope(client);
  return { rows: await fetchLiveOpportunities(client, scope), scope };
}

export async function fetchLiveOpportunities(
  client: SupabaseClient,
  preresolved?: FeedScope
): Promise<OpportunityRow[]> {
  const scope = preresolved ?? (await resolveFeedScope(client));
  if (scope.codes.length === 0) {
    console.log("[live-opportunities] no NAICS on file for this customer — serving honest-empty, NOT a global fallback");
    return [];
  }
  const rows = await fetchLiveSamRowsCached(scope.codes.join(","));
  if (rows.length === 0) return rows;

  const { data: completedAudits } = await client
    .from("audits")
    .select("notice_id, compliance_score, recommendation, v3_verdict:compliance_json->v3->>verdict, completed_at")
    .eq("status", "complete")
    .order("completed_at", { ascending: false });
  const auditByNotice = new Map<string, { compliance_score: number | null; recommendation: string | null; v3_verdict: string | null }>();
  for (const a of (completedAudits || []) as Array<{ notice_id: string | null; compliance_score: number | null; recommendation: string | null; v3_verdict: string | null }>) {
    if (!a.notice_id || auditByNotice.has(a.notice_id)) continue; // first hit wins = latest by completed_at desc
    auditByNotice.set(a.notice_id, { compliance_score: a.compliance_score, recommendation: a.recommendation, v3_verdict: (a.v3_verdict as string | null) ?? null });
  }
  // Return fresh objects — never mutate the cached array's rows in place, or
  // one request's audit overlay would leak into every later cache hit.
  return rows.map((r) => {
    const matched = auditByNotice.get(r.notice_id);
    if (!matched) return { ...r };
    return {
      ...r,
      is_audited: true,
      compliance_score: matched.compliance_score ?? r.compliance_score,
      v3_verdict: matched.v3_verdict,
      recommendation: matched.recommendation ?? r.recommendation
    };
  });
}
