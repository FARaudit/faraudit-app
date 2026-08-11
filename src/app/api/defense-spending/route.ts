import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { resolveFeedScope } from "@/lib/bd-os/live-opportunities";
import { fetchDefenseSpending } from "@/lib/bd-os/defense-spending";

export const dynamic = "force-dynamic";

// Federal obligations for the customer's NAICS, read from
// `defense_spending_intel` — USAspending award-search totals written by the
// agents/defense-spending worker.
//
// WHAT THIS REPLACES. The route used to answer a flat `state:"unwired"`, and
// before that `_source:"unwired-mock-preserved"`, whose stated purpose was to
// make the client script a no-op so a client-side mock KEPT RENDERING —
// invented agency totals and named third parties beside dollar figures nobody
// measured, under a green LIVE pill citing FPDS-NG. That is gone. The table it
// now reads holds 27 rows of real obligations.
//
// It is still not a full dashboard's worth of data, and the response says so
// rather than filling the gap: `unsupported` names each panel the table cannot
// answer and the measurement it would need, and `coverage.untracked` names the
// customer's codes the worker has never pulled. A page that knows what it does
// not know can say it; one that only receives numbers cannot.
export async function GET(_req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = await resolveFeedScope(supabase);

  let result;
  try {
    result = await fetchDefenseSpending(supabase, scope.codes);
  } catch (e) {
    // Rule 61 — a failed dependency is a visible failure state, never a
    // plausible one. 503 so the client shows the notice rather than a page of
    // zeroes that read as measured values.
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { state: "unwired", reason: `Spending data could not be read (${msg}).` },
      { status: 503 }
    );
  }

  if (result.state === "no-profile-codes") {
    return NextResponse.json({
      state: "unwired",
      reason:
        "No NAICS codes are on file for this account, so there is nothing to scope federal spending to. " +
        "Add them to your capability statement and this view fills in."
    });
  }

  if (result.state === "no-rows") {
    return NextResponse.json({
      state: "unwired",
      reason:
        `Federal spending has not been pulled for ${result.requested.join(", ")} yet. ` +
        "Nothing is shown rather than showing another code's figures under yours."
    });
  }

  return NextResponse.json(result);
}
