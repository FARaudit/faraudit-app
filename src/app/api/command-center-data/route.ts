import { NextResponse }       from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies }            from "next/headers";
import {
  fetchHeaderCounter,
  fetchRecentAudits,
  fetchHomeStats,
} from "@/lib/bd-os/queries";
import { fetchLiveOpportunitiesScoped, WINDOW_DAYS } from "@/lib/bd-os/live-opportunities";
import type { OpportunityRow } from "@/lib/bd-os/queries";
import { poleToRecommendation } from "@/lib/verdict-pole";

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

    const [counters, homeStats, scoped, recentAudits, pipelineRows] = await Promise.all([
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
        .from("pipeline")
        .select("stage, due_date, updated_at, estimated_value")
        .eq("user_id", user.id)
        .then(
          (r) => (r.error ? null : ((r.data as any[]) || [])),
          () => null
        ),
    ]);

    const nowMs = Date.now();
    const dayMs = 86400000;
    const weekMs = 7 * dayMs;
    const day2Ms = 2 * dayMs;

    // Three distinguishable states, never collapsed:
    //   scoped === null              → upstream SAM read FAILED  → opportunities null
    //   scope.source no-profile-codes→ no NAICS on file          → empty + a fixable reason
    //   rows === []                  → codes on file, empty window
    const liveOpps: OpportunityRow[] | null = scoped ? scoped.rows : null;
    const feedScope = scoped ? scoped.scope : null;
    const opportunities: OpportunityRow[] = liveOpps ?? [];

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

    // Live-feed deadline count within 7 days — replaces homeStats.expiring_7d /
    // live_sam_gov, which count pending_audits rows (structurally zero since the
    // queue froze; a hardcoded 0 next to a live feed would be its own lie).
    const deadlineSoon7d = opportunities.filter((o) => {
      if (!o.response_deadline) return false;
      const ms = new Date(o.response_deadline).getTime();
      return !isNaN(ms) && ms > nowMs && ms <= nowMs + weekMs;
    }).length;

    return NextResponse.json({
      // ── existing fields ──
      liveCount:        liveOpps ? liveOpps.length : (homeStats?.live_sam_gov ?? 0),
      trapCount:        homeStats?.total_traps_caught   ?? counters.traps,
      deadlineSoon:     liveOpps ? deadlineSoon7d : (homeStats?.expiring_7d ?? 0),
      auditsThisMonth:  homeStats?.audit_activity_month ?? counters.audits,
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
      lastSync:         new Date().toISOString(),

      // ── Phase 4 additions ──
      user: { firstName, fullName, initials },

      // Brief-head deltas (.since-item × 4)
      newMatches24h,
      newTraps,
      pursuitsAdvanced,
      qaWindowsClosing,

      // Pulse-bar deltas
      deadlineSoonNext48h,

      // Sidebar badges
      agencyCount,
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
    });
  } catch (err) {
    console.error("[command-center-data]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
