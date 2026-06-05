import { NextResponse }       from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies }            from "next/headers";
import {
  fetchHeaderCounter,
  fetchOpportunities,
  fetchRecentAudits,
  fetchHomeStats,
} from "@/lib/bd-os/queries";

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

    const [counters, homeStats, rawOpps, recentAudits, pipelineRows] = await Promise.all([
      fetchHeaderCounter(supabase).catch(() => ({ audits: 0, traps: 0 })),
      fetchHomeStats(supabase).catch(() => null),
      fetchOpportunities(supabase, { limit: 250 }).catch(() => []),
      fetchRecentAudits(supabase, user.id, 200).catch(() => []),
      // Pipeline rows for the user — feeds Active Pursuits funnel, .ps-mid/.ps-right
      // aggregates, sidebar Pipeline danger badge, and since-bar pursuitsAdvanced.
      // PostgrestBuilder is a thenable but not a real Promise, so we use the
      // two-arg .then(onFulfilled, onRejected) form instead of .catch().
      supabase
        .from("pipeline")
        .select("stage, due_date, updated_at, estimated_value, status")
        .eq("user_id", user.id)
        .then(
          (r) => (r.data as any[]) || [],
          () => [] as any[]
        ),
    ]);

    const nowMs = Date.now();
    const dayMs = 86400000;
    const weekMs = 7 * dayMs;
    const day2Ms = 2 * dayMs;

    // Drop already-expired opps so the feed only carries actionable rows.
    const opportunities = (rawOpps as any[]).filter((o) => {
      if (!o?.response_deadline) return true;
      const ms = new Date(o.response_deadline).getTime();
      if (Number.isNaN(ms)) return true;
      return ms >= nowMs;
    });

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

    const audits = (recentAudits as any[]) || [];
    const newTraps = audits.filter((a) => {
      const tsRaw = a.completed_at || a.created_at;
      const ts = tsRaw ? new Date(tsRaw).getTime() : NaN;
      if (isNaN(ts) || (nowMs - ts) > dayMs) return false;
      const rec = (a.recommendation || "").toLowerCase();
      return a.bid_no_bid === "no-bid" || rec.indexOf("disqualif") !== -1 || rec.indexOf("no bid") !== -1;
    }).length;

    const pursuitsAdvanced = (pipelineRows as any[]).filter((c) => {
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

    const pipelineAtRisk = (pipelineRows as any[]).filter((c) => {
      const ts = c.due_date ? new Date(c.due_date).getTime() : NaN;
      if (isNaN(ts)) return false;
      return ts >= nowMs && (ts - nowMs) <= day2Ms;
    }).length;

    const pipelineTotal = (pipelineRows as any[]).length;

    // Funnel bucket counts (s0-s4) — matches design .fseg.s0/s1/s2/s3/s4 selector.
    const pipelineFunnel: Record<string, number> = { s0: 0, s1: 0, s2: 0, s3: 0, s4: 0 };
    (pipelineRows as any[]).forEach((c) => {
      const bucket = STAGE_TO_BUCKET[c.stage as string];
      if (bucket) pipelineFunnel[bucket]++;
    });

    // Pipeline weighted value sum (for .ps-right .lead "$M weighted").
    const pipelineWeightedValue = (pipelineRows as any[]).reduce((sum, c) => {
      const v = typeof c.estimated_value === "number"
        ? c.estimated_value
        : (typeof c.estimated_value === "string" ? parseFloat(c.estimated_value) || 0 : 0);
      return sum + v;
    }, 0);

    // .focus callout counts ("N pursuit closes in <24h · M need your action this week")
    const pipelineClosing24h = (pipelineRows as any[]).filter((c) => {
      const ts = c.due_date ? new Date(c.due_date).getTime() : NaN;
      return !isNaN(ts) && ts >= nowMs && (ts - nowMs) <= dayMs;
    }).length;
    const pipelineClosingWeek = (pipelineRows as any[]).filter((c) => {
      const ts = c.due_date ? new Date(c.due_date).getTime() : NaN;
      return !isNaN(ts) && ts >= nowMs && (ts - nowMs) <= weekMs;
    }).length;

    // Top 6 pipeline cards by soonest due_date (drives the 6 .pursuit rows)
    const pipelineTop6 = (pipelineRows as any[])
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

    // .sb-badge.live on the Opportunities sidebar item — "Live" if SAM.gov
    // synced within the last 5 minutes, else "Stale". Computed from lastSync
    // string written below (which is always "now" at request time, so always
    // "Live" — the client compares against actual fetch time).
    const ingestStatus = "Live"; // always live at API-response time

    // ── Quick Audit panel ──
    const recentAudits4 = audits.slice(0, 4);
    const auditsThisWeek = audits.filter((a) => {
      const ts = a.completed_at ? new Date(a.completed_at).getTime() : NaN;
      return !isNaN(ts) && (nowMs - ts) < weekMs;
    }).length;

    return NextResponse.json({
      // ── existing fields (unchanged) ──
      liveCount:        homeStats?.live_sam_gov         ?? opportunities.length,
      trapCount:        homeStats?.total_traps_caught   ?? counters.traps,
      deadlineSoon:     homeStats?.expiring_7d          ?? 0,
      auditsThisMonth:  homeStats?.audit_activity_month ?? counters.audits,
      auditTotal:       audits.length,
      opportunities:    opportunities,
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

      // Active Pursuits panel
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
