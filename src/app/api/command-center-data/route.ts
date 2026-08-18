import { NextResponse }       from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies }            from "next/headers";
import {
  fetchHeaderCounter,
  fetchRecentAudits,
  fetchHomeStats,
} from "@/lib/bd-os/queries";
import { fetchLiveOpportunitiesScoped, WINDOW_DAYS, resolveFeedScope } from "@/lib/bd-os/live-opportunities";
import type { OpportunityRow } from "@/lib/bd-os/queries";
import { poleToRecommendation } from "@/lib/verdict-pole";
import { fetchDefenseSpending, type SpendingResult } from "@/lib/bd-os/defense-spending";
import { federalRegisterUrl, parseFederalRegister, type RegRow } from "@/lib/federal-register";
import { buildDeskDigest } from "@/lib/bd-os/desk-digest";
import { fetchNewsHeadlines } from "@/lib/bd-os/news-headlines";

export const dynamic = "force-dynamic";

// Map the 8 pipeline DB stage codes to the 5 Brief funnel buckets.
// DB codes (per public/pipeline-live.js STAGE_LABELS):
//   01 Pre-Sol Synopsis · 02 Sources Sought · 03 Solicitation ·
//   04 Proposal Dev · 05 Submission · 06 Evaluation · 07 Award · 08 Post-Award
// Design funnel buckets (.fseg.s0–s4):
//   Capture · Drafting · Pricing · Review · Submit
const STAGE_TO_BUCKET: Record<string, "s0" | "s1" | "s2" | "s3" | "s4"> = {
  "01": "s0", "02": "s0",
  "03": "s1", "04": "s1",
  "05": "s2",
  "06": "s3",
  "07": "s4", "08": "s4",
};

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll()                { return cookieStore.getAll(); },
          setAll(cookiesToSet)    {
            try { cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)); } catch {}
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ── User identity for .brief-greeting + .user-chip ──
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    const metaName =
      (typeof meta.full_name === "string" && meta.full_name) ||
      (typeof meta.name === "string" && meta.name) ||
      "";
    const emailLocal = user.email
      ? user.email.split("@")[0]
          .replace(/[._\-]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : "";
    const fullName = (metaName || emailLocal || "User").replace(/\s+/g, " ").trim();
    const firstName = fullName.split(/\s+/)[0] || "User";
    // Initials = first word's initial + last "real" word's initial. Filter out
    // generational suffixes (Jr, Sr, II, III, IV, V) so "Jose Antonio Rodriguez Jr"
    // gives "JR" not "JJ". One-word names degrade to a single letter.
    const SUFFIXES = new Set(["JR", "SR", "II", "III", "IV", "V"]);
    const _tokens = fullName.split(/\s+/).filter(Boolean);
    const _meaningful = _tokens.filter((t) => !SUFFIXES.has(t.toUpperCase()));
    const _useTokens = _meaningful.length > 0 ? _meaningful : _tokens;
    const initials = _useTokens.length === 0
      ? "U"
      : _useTokens.length === 1
        ? _useTokens[0][0].toUpperCase()
        : (_useTokens[0][0] + _useTokens[_useTokens.length - 1][0]).toUpperCase();

    const [
      counters, homeStats, scoped, recentAudits, pipelineRows,
      cmmcAudits, regRules, spending, newsRows,
    ] = await Promise.all([
      fetchHeaderCounter(supabase).catch(() => ({ audits: 0, traps: 0 })),
      fetchHomeStats(supabase).catch(() => null),
      // Live SAM feed (CEO 2026-07-29: go live-source; PR #334 library). null —
      // not [] — on failure: the /opportunities page renders a distinct
      // "unavailable" state, and an empty array here would misreport an
      // upstream outage as an honestly-empty feed.
      // Scoped variant so the client can tell "no NAICS on file" (a profile the
      // customer can fix in place) from "codes on file, empty window" (a real
      // zero-result window). Identical as a row count; they must not render alike.
      fetchLiveOpportunitiesScoped(supabase).catch(() => null),
      // null (not []) on failure, matching the live feed and pipeline above.
      // fetchRecentAudits THROWS on a Postgres error by design; catching it into
      // [] re-introduced one layer up the exact swallow that queries.ts deleted
      // from fetchKOs, where "no rows" and "the read failed" became one answer.
      fetchRecentAudits(supabase, user.id, 200).catch(() => null),
      // Pipeline rows for the user — feeds Active Pursuits funnel, .ps-mid/.ps-right
      // aggregates, sidebar Pipeline danger badge, and since-bar pursuitsAdvanced.
      //
      // `status` is NOT a column on `pipeline` and never was: the table carries
      // stage · due_date · updated_at · estimated_value · agency · naics · notes
      // · solicitation_number · title. Naming it made the whole select return
      // 42703, and the old handler turned that into `[]` — so every pipeline
      // number on Today was a structural zero rather than a measurement, while
      // the customer had pursuits on file. It was also never read.
      //
      // null (not []) on failure, matching what this route already does for the
      // live feed: "no pursuits" and "could not read your pursuits" are
      // different facts and the page must not render them alike.
      // PostgrestBuilder is a thenable but not a real Promise, so we use the
      // two-arg .then(onFulfilled, onRejected) form instead of .catch().
      supabase
        // `title` and `solicitation_number` are selected for the Pipeline DESK,
        // which names the pursuit it ranks. Without them every card reads
        // "Untitled pursuit" — the same shape as the CMMC column nothing asked
        // for. The comment sits ABOVE the chain because _today-fabrication D1
        // reads `.from("pipeline")` and `.select(...)` as adjacent lines, and
        // that gate failing closed on a moved select is the point of it.
        .from("pipeline")
        .select("stage, due_date, updated_at, estimated_value, title, solicitation_number")
        .eq("user_id", user.id)
        .then(
          (r) => (r.error ? null : ((r.data as any[]) || [])),
          () => null
        ),

      // ── The three extra reads the CROSS-DESK DIGEST needs ──
      // Each is null on failure, never [], for the reason stated throughout this
      // route: a failed read and an empty desk are different facts and the
      // panels must be able to say which one happened.

      // CMMC needs `compliance_json` itself, and fetchRecentAudits above does NOT
      // select it — it extracts a handful of sub-fields. Running inferLevel() over
      // those rows would read every audit as "CMMC not required", turning a column
      // this query never asked for into an all-clear on the customer's compliance
      // obligations. So the digest gets its own select, scoped to this user.
      supabase
        .from("audits")
        .select("id, notice_id, solicitation_number, title, agency, created_at, response_deadline, compliance_json")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200)
        .then(
          (r) => (r.error ? null : ((r.data as any[]) || [])),
          () => null
        ),

      // Federal Register — free, no key. The same URL /api/proposed-rules builds,
      // through the shared library rather than a second hand-rolled query, and
      // behind Next's data cache so Today's own calendar fetch of the same feed
      // costs one request between them rather than two.
      fetch(federalRegisterUrl(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 21600 },
      })
        .then(async (r): Promise<RegRow[] | null> =>
          r.ok ? parseFederalRegister(await r.text()) : null)
        .catch(() => null),

      // Defense spending — a read of `defense_spending_intel`, the same library
      // call the desk's own route makes, so the two cannot disagree.
      resolveFeedScope(supabase)
        .then((s): Promise<SpendingResult> => fetchDefenseSpending(supabase, s.codes))
        .catch(() => null),
      // Defence-news headlines for the Signals grid. /api/news-feed is RSS only —
      // NO model spend — and CDN-cached for 15 minutes, so a dashboard that reloads
      // on every tab switch costs nothing to run. The judged, desk-ranked read lives
      // on /defense-news, which is a page you open, not one that opens itself.
      // In the SAME Promise.all as everything else: an extra sequential hop on the
      // slowest panel of the slowest page would be paid on every load.
      fetchNewsHeadlines().catch(() => null),
    ]);

    const nowMs = Date.now();
    const dayMs = 86400000;
    const weekMs = 7 * dayMs;
    const day2Ms = 2 * dayMs;

    // Three distinguishable states, never collapsed:
    //   scoped === null              → upstream SAM read FAILED  → opportunities null
    //   scope.source no-profile-codes→ no NAICS on file          → empty + a fixable reason
    //   rows === []                  → codes on file, empty window
    // DEDUPE HERE, ONCE. The ingest queue can hold several rows for one notice, and
    // /notices was deduping on the client while this route was not — so the same feed
    // produced "166 live notices" on Today and "165 open notices" on Notices, from the
    // same request. A count the customer reads twice must be computed once; a second
    // consumer that forgets to dedupe would otherwise diverge again.
    // Key precedence matches opportunities-live.js's DISPLAY identity: a base notice
    // and its amendment share a solicitation_number but carry different notice_ids.
    // Rows arrive newest-first, so the first occurrence is the one kept.
    const _seen = new Set<string>();
    const liveOpps: OpportunityRow[] | null = scoped
      ? scoped.rows.filter((o) => {
          const key = o.solicitation_number || o.notice_id || String(o.id ?? "");
          if (!key) return true;
          if (_seen.has(key)) return false;
          _seen.add(key);
          return true;
        })
      : null;
    const feedScope = scoped ? scoped.scope : null;
    const opportunities: OpportunityRow[] = liveOpps ?? [];

    // Every count below is derived by filtering `opportunities`, and that array is
    // `[]` both when the window is genuinely empty AND when the upstream read
    // failed. Filtering [] yields 0 either way, so each of those counts has to be
    // nulled explicitly when the feed did not answer — otherwise the page prints a
    // zero nobody measured next to a rail pill that says "Feed down". `feedAvailable`
    // is the one fact that separates them, and it ships so the client can say which
    // it is instead of inferring.
    const feedAvailable = liveOpps !== null;
    const feedNum = (n: number): number | null => (feedAvailable ? n : null);

    // ── Brief-head "since you last looked" deltas ──
    const newMatches24h = opportunities.filter((o) => {
      const ts = o.created_at ? new Date(o.created_at).getTime() : NaN;
      return !isNaN(ts) && (nowMs - ts) < dayMs;
    }).length;

    const qaWindowsClosing = opportunities.filter((o) => {
      if (!o.response_deadline) return false;
      const ms = new Date(o.response_deadline).getTime();
      return !isNaN(ms) && ms > nowMs && ms <= nowMs + dayMs;
    }).length;

    // Same shape as the pipeline aggregates below: null means the read failed,
    // and every count derived from it stays null rather than becoming a zero
    // nobody measured.
    const auditRows: any[] | null = (recentAudits as any[] | null);
    const auditsAvailable = auditRows !== null;
    const audits: any[] = auditRows ?? [];
    const newTraps = !auditsAvailable ? null : audits.filter((a) => {
      const tsRaw = a.completed_at || a.created_at;
      const ts = tsRaw ? new Date(tsRaw).getTime() : NaN;
      if (isNaN(ts) || (nowMs - ts) > dayMs) return false;
      // R3: derive from pole; "DECLINE" maps to NO_BID/INELIGIBLE verdicts.
      const rec = poleToRecommendation(a).toLowerCase();
      return a.bid_no_bid === "no-bid" || rec === "decline";
    }).length;

    // Every pipeline aggregate below is null when the read failed. A zero here
    // would be indistinguishable from an empty pipeline, and the client renders
    // null as an em dash rather than a number nobody measured.
    const pipeRows: any[] | null = (pipelineRows as any[] | null);
    const pipelineAvailable = pipeRows !== null;
    const P: any[] = pipeRows ?? [];

    const pursuitsAdvanced = !pipelineAvailable ? null : P.filter((c) => {
      const ts = c.updated_at ? new Date(c.updated_at).getTime() : NaN;
      return !isNaN(ts) && (nowMs - ts) < dayMs;
    }).length;

    // ── Pulse-bar [2] · "12 in 48h" delta ──
    const deadlineSoonNext48h = opportunities.filter((o) => {
      if (!o.response_deadline) return false;
      const ms = new Date(o.response_deadline).getTime();
      return !isNaN(ms) && ms > nowMs && ms <= nowMs + day2Ms;
    }).length;

    // ── Sidebar badges ──
    const agencies = new Set<string>();
    opportunities.forEach((o) => { if (o.agency) agencies.add(o.agency); });
    const agencyCount = agencies.size;

    const pipelineAtRisk = !pipelineAvailable ? null : P.filter((c) => {
      const ts = c.due_date ? new Date(c.due_date).getTime() : NaN;
      if (isNaN(ts)) return false;
      return ts >= nowMs && (ts - nowMs) <= day2Ms;
    }).length;

    const pipelineTotal = pipelineAvailable ? P.length : null;

    // Funnel bucket counts (s0-s4) — matches design .fseg.s0/s1/s2/s3/s4 selector.
    const funnelCounts: Record<string, number> = { s0: 0, s1: 0, s2: 0, s3: 0, s4: 0 };
    P.forEach((c) => {
      const bucket = STAGE_TO_BUCKET[c.stage as string];
      if (bucket) funnelCounts[bucket]++;
    });
    const pipelineFunnel = pipelineAvailable ? funnelCounts : null;

    // Pipeline weighted value sum (for .ps-right .lead "$M weighted").
    const pipelineWeightedValueRaw = P.reduce((sum, c) => {
      const v = typeof c.estimated_value === "number"
        ? c.estimated_value
        : (typeof c.estimated_value === "string" ? parseFloat(c.estimated_value) || 0 : 0);
      return sum + v;
    }, 0);
    const pipelineWeightedValue = pipelineAvailable ? pipelineWeightedValueRaw : null;

    // .focus callout counts ("N pursuit closes in <24h · M need your action this week")
    const pipelineClosing24h = !pipelineAvailable ? null : P.filter((c) => {
      const ts = c.due_date ? new Date(c.due_date).getTime() : NaN;
      return !isNaN(ts) && ts >= nowMs && (ts - nowMs) <= dayMs;
    }).length;
    const pipelineClosingWeek = !pipelineAvailable ? null : P.filter((c) => {
      const ts = c.due_date ? new Date(c.due_date).getTime() : NaN;
      return !isNaN(ts) && ts >= nowMs && (ts - nowMs) <= weekMs;
    }).length;

    // Top 6 pipeline cards by soonest due_date (drives the 6 .pursuit rows)
    const pipelineTop6 = !pipelineAvailable ? null : P
      .filter((c) => c.due_date)
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      .slice(0, 6);

    // Free Tier strip (approximation — no Stripe subscription read yet).
    // Treats free-tier monthly quota as a fixed 13 audits; "used" = audits
    // counted this month from counters. Stops the lie of static "8 of 13".
    // Quota = base monthly cap of 13, auto-bumped to never trail
    // auditsUsedMonth so the UI never shows "15 of 13". When real Stripe
    // subscription data lands, this becomes the actual plan quota.
    const FREE_TIER_BASE = 13;
    const auditsUsedMonth = typeof counters.audits === "number"
      ? counters.audits
      : 0;
    const FREE_TIER_QUOTA = Math.max(FREE_TIER_BASE, auditsUsedMonth);
    const freeTierPct = FREE_TIER_QUOTA > 0
      ? Math.min(100, Math.round((auditsUsedMonth / FREE_TIER_QUOTA) * 100))
      : 0;

    // .sb-badge.live on the Opportunities sidebar item — computed from the
    // actual live-SAM fetch outcome, never asserted.
    const ingestStatus = liveOpps ? "Live" : "Unavailable";

    // ── Quick Audit panel ──
    const recentAudits4 = !auditsAvailable ? null : audits.slice(0, 4);
    const auditsThisWeek = !auditsAvailable ? null : audits.filter((a) => {
      const ts = a.completed_at ? new Date(a.completed_at).getTime() : NaN;
      return !isNaN(ts) && (nowMs - ts) < weekMs;
    }).length;

    // AUDITS THIS MONTH counts SOLICITATIONS, not runs. homeStats.audit_activity_month
    // and counters.audits both count audit ROWS, and one solicitation is routinely
    // audited several times (W911SG27BA002 shows as 1/3, 2/3, 3/3) — so the tile read
    // 43 for a customer who had worked 8. The label says "completed by you", which a
    // customer reads as distinct solicitations, and that is the number now shown.
    // Runs ship alongside so the tile can state both rather than hide the re-runs.
    const monthMs = 30 * dayMs;
    const _monthRows = !auditsAvailable ? null : audits.filter((a) => {
      const ts = (a.completed_at || a.created_at) ? new Date(a.completed_at || a.created_at).getTime() : NaN;
      return !isNaN(ts) && (nowMs - ts) <= monthMs;
    });
    const auditRunsThisMonth = _monthRows ? _monthRows.length : null;
    const auditSolicitationsThisMonth = _monthRows
      ? new Set(_monthRows.map((a) => a.solicitation_number || a.notice_id || a.id)).size
      : null;

    // Live-feed deadline count within 7 days — replaces homeStats.expiring_7d /
    // live_sam_gov, which count pending_audits rows (structurally zero since the
    // queue froze; a hardcoded 0 next to a live feed would be its own lie).
    const deadlineSoon7d = opportunities.filter((o) => {
      if (!o.response_deadline) return false;
      const ms = new Date(o.response_deadline).getTime();
      return !isNaN(ms) && ms > nowMs && ms <= nowMs + weekMs;
    }).length;

    // ── THE CROSS-DESK DIGEST ──
    // One shaping, two panels. The Priority Action Feed ranks these rows and the
    // Signals grid summarises them, so a desk cannot read as urgent in one panel
    // and quiet in the other. `liveOpps` is passed — the deduped array, null on a
    // failed read — not `opportunities`, which is [] in both cases.
    const deskDigest = buildDeskDigest({
      opportunities: liveOpps,
      cmmcAudits: (cmmcAudits as any[] | null),
      // pipeRows, not P — null when the read failed, so an unreadable pipeline
      // and an empty board stay different facts on the card too.
      pipeline: pipeRows,
      regRules: (regRules as RegRow[] | null),
      spending: (spending as SpendingResult | null),
      news: newsRows,
    }, nowMs);

    return NextResponse.json({
      // ── existing fields ──
      // The homeStats fallbacks are GONE. Both counted pending_audits rows, which
      // have been structurally zero since that queue froze — so a failed SAM read
      // printed "0 live notices matching your NAICS" and an insight bar telling the
      // customer to widen a window that was never read, while the rail beside it
      // said "Feed down". null is the only honest answer to a question nothing asked.
      liveCount:        liveOpps ? liveOpps.length : null,
      trapCount:        homeStats?.total_traps_caught   ?? counters.traps,
      deadlineSoon:     feedNum(deadlineSoon7d),
      // DISTINCT solicitations, not audit rows. See the derivation above.
      auditsThisMonth:  auditSolicitationsThisMonth,
      auditRunsThisMonth,
      auditTotal:       auditsAvailable ? audits.length : null,
      // null = live fetch failed (client renders "unavailable", not "empty")
      opportunities:    liveOpps,
      // "no NAICS on file" is a profile the customer can fix in place; "empty
      // window" is a real zero-result. Identical as a count — must not render alike.
      feedScopeSource:  feedScope?.source ?? null,
      feedScopeCodes:   feedScope?.codes ?? [],
      // The posted-date window the live read actually used. Sent so the empty
      // state can state it instead of hardcoding a number that would rot.
      feedWindowDays:   WINDOW_DAYS,
      // Whether the live SAM read ANSWERED. Distinct from an empty window.
      feedAvailable,
      lastSync:         new Date().toISOString(),

      // ── Phase 4 additions ──
      user: { firstName, fullName, initials },

      // Brief-head deltas (.since-item × 4)
      newMatches24h:    feedNum(newMatches24h),
      newTraps,
      pursuitsAdvanced,
      qaWindowsClosing: feedNum(qaWindowsClosing),

      // Pulse-bar deltas
      deadlineSoonNext48h: feedNum(deadlineSoonNext48h),

      // Sidebar badges
      agencyCount:      feedNum(agencyCount),
      pipelineAtRisk,
      pipelineTotal,

      // Active Pursuits panel. `pipelineAvailable` false ⇒ every field below is
      // null, and the page renders "unavailable" rather than a zero.
      pipelineAvailable,
      pipelineFunnel,
      pipelineWeightedValue,
      pipelineClosing24h,
      pipelineClosingWeek,
      pipelineTop6,

      // Quick Audit panel
      recentAudits4,
      auditsThisWeek,

      // Free Tier strip (approximation pending real Stripe subscription read)
      freeTierQuota: FREE_TIER_QUOTA,
      auditsUsedMonth,
      freeTierPct,

      // Sidebar Opportunities .sb-badge.live indicator
      ingestStatus,

      // Priority Action Feed + Signals grid. One row per desk, each carrying its
      // own status — never a partial list, because a desk missing from the array
      // and a desk with nothing to report would look identical.
      deskDigest,
    });
  } catch (err) {
    console.error("[command-center-data]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
