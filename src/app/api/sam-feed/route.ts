import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { fetchSamFeed } from "@/lib/sam-feed";

// /api/sam-feed — the signed-in dashboard feed, fail-closed. Outcomes:
//   200 { source: "live", solicitations }        — real upstream data (an empty list here is a real answer)
//   401 { error: "Unauthorized" }                — not signed in
//   503 { source: "unconfigured", error }        — SAM_API_KEY missing
//   502 { source: "error", error }               — upstream failed or threw
//
// All three failure exits previously returned HTTP 200 with `{ solicitations: [] }`, and the dashboard
// renders an empty list as "No new solicitations in target NAICS codes today." So an unreachable SAM.gov
// was reported to a customer as a positive fact about the federal market. Rule 61: a failed dependency
// gets a visible failure state, never a success code. The fetch logic lives in src/lib/sam-feed.ts so the
// contract is testable without faking auth — proof: src/lib/sam-feed.honestfail.test.ts (run RED pre-fix).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Auth gate — only authenticated users hit SAM.gov from this endpoint.
  const sb = await createServerClient();
  const {
    data: { user }
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const outcome = await fetchSamFeed();
  if (!outcome.ok) {
    return NextResponse.json(
      { source: outcome.kind === "unconfigured" ? "unconfigured" : "error", error: outcome.error, solicitations: [] },
      { status: outcome.kind === "unconfigured" ? 503 : 502 }
    );
  }

  return NextResponse.json({ source: "live", solicitations: outcome.solicitations });
}
