import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { fetchLiveOpportunitiesScoped, WINDOW_DAYS } from "@/lib/bd-os/live-opportunities";
import { groupOfficers, agencyFiltersOf } from "@/lib/bd-os/ko-directory";

export const dynamic = "force-dynamic";

// WHAT THIS SERVES, AND WHY IT NO LONGER TOUCHES ko_intelligence.
//
// This route used to read and write the `ko_intelligence` table. Both
// directions were dead against production: migration 003 declared the table
// with CREATE TABLE IF NOT EXISTS, but 001 had already created it with a
// different column set, so 003 was a silent no-op. Measured on production:
// the list query (order by last_contact) returned 42703 column-does-not-exist,
// the upsert returned PGRST204 for agency_office, the table held zero rows,
// and nothing in the repo had ever written one. The page's only caller
// therefore took its failure branch on every load and rendered a seed file of
// invented officials.
//
// The officers here are the points of contact SAM publishes on the notices in
// THIS customer's feed — the same rows the Opportunities page shows, from the
// same cached call, so the two surfaces can never disagree. Every field is
// carried from the notice; nothing is scored, inferred or averaged. Response
// rates, reply times, obligated dollars and fit scores are absent because
// nothing computes them.
//
// A point of contact is not necessarily the warranted contracting officer —
// SAM types them only as primary/secondary — so `contactType` carries what SAM
// said and the page must not assert a warrant.

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let rows;
  let scope;
  try {
    const out = await fetchLiveOpportunitiesScoped(supabase);
    rows = out.rows;
    scope = out.scope;
  } catch (e) {
    // Rule 61 — a failed dependency gets a visible failure state, never a
    // plausible one. The client renders this as an error, not as an empty
    // directory, because "SAM did not answer" and "you have no officers" are
    // different facts and must not look alike.
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { error: `live feed unavailable: ${msg}`, meta: { reason: "upstream-failed", window_days: WINDOW_DAYS } },
      { status: 503 }
    );
  }

  const { officers, pocWithoutEmail } = groupOfficers(rows);

  // `reason` is null iff there is something to show. The empty cases are named
  // separately because they need different words on the page and a different
  // next action from the customer: no codes on file is a profile they can fix,
  // an empty window is a real zero result.
  const reason =
    officers.length > 0
      ? null
      : scope.source === "no-profile-codes"
        ? "no-profile-codes"
        : rows.length === 0
          ? "no-notices-in-window"
          : "no-contacts-on-notices";

  return NextResponse.json({
    OFFICERS: officers,
    AGENCY_FILTERS: agencyFiltersOf(officers),
    meta: {
      source: "sam-live-poc",
      scope: scope.source,
      naics: scope.codes,
      window_days: WINDOW_DAYS,
      notice_count: rows.length,
      officer_count: officers.length,
      poc_without_email: pocWithoutEmail,
      reason
    }
  });
}
