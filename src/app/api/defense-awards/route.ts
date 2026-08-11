import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { resolveFeedScope } from "@/lib/bd-os/live-opportunities";
import { fetchRecentAwardsCached, AWARDS_WINDOW_DAYS } from "@/lib/bd-os/recent-awards";

export const dynamic = "force-dynamic";

// Recent contract actions in the customer's own NAICS codes, from USAspending.
//
// This route exists to fill two surfaces on /defense-news that had never been
// connected to anything: the "RECENT AWARDS · YOUR NAICS" sidebar and the ticker
// strip, both of which rendered the sentence "Award feed unavailable — no live
// award source is connected." Before that they held six invented awards.
//
// The three empty cases stay distinct, because they need different words and a
// different next action from the customer: no codes on file is a profile they
// can fix, an empty window is a real zero result, and an upstream failure is
// ours. None of them is allowed to look like the others.
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const scope = await resolveFeedScope(supabase);
  if (scope.codes.length === 0) {
    return NextResponse.json({
      awards: [],
      meta: { reason: "no-profile-codes", window_days: AWARDS_WINDOW_DAYS, naics: [] }
    });
  }

  let awards;
  try {
    awards = await fetchRecentAwardsCached(scope.codes.join(","));
  } catch (e) {
    // Rule 61 — a failed dependency is a visible failure state, never a
    // plausible one.
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { error: `award feed unavailable: ${msg}`, meta: { reason: "upstream-failed", window_days: AWARDS_WINDOW_DAYS } },
      { status: 503 }
    );
  }

  return NextResponse.json({
    awards,
    meta: {
      source: "usaspending-award-search",
      window_days: AWARDS_WINDOW_DAYS,
      naics: scope.codes,
      count: awards.length,
      reason: awards.length > 0 ? null : "no-actions-in-window"
    }
  });
}
