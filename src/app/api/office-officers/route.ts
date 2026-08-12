/* GET /api/office-officers — buying office → the contracting officers who post from it.
 *
 * This is what makes "Who to call" callable. A recompete row carries the office that signed the
 * contract (`SUP OF SHIPBUILDING CONV AND REPAIR`); the officer directory keys on SAM's own office
 * leaf. Measured 2026-08-12 on the customer's 21 real rows: 21/21 carried an office and 12 matched an
 * officer we already hold — byte-for-byte, with ZERO normalisation.
 *
 * ⛔ EXACT MATCH ONLY, AND THAT IS A DELIBERATE CEILING. The two names come from different systems —
 * USAspending's award detail and a SAM notice's fullParentPathName — and they happen to agree. Nothing
 * here normalises, folds or fuzzy-matches, because the cost of a wrong match is a real contracting
 * officer's phone number printed beside someone else's $1.9B contract. A miss shows nothing and says
 * so; that is strictly better.
 *
 * ⛔ WHAT A MATCH MEANS, EXACTLY. These are the officers who have posted notices FROM that office in
 * the customer's codes. They are not "the officer on this contract" — nothing in either source says
 * who signed it. The client copy has to carry that distinction, and its gate enforces the wording.
 *
 * SEPARATE FROM /api/defense-spending on purpose: this makes a live SAM call, and folding it into the
 * spending payload would put a slow, rate-limited upstream in front of every panel on two pages. Here,
 * a failure costs the officer names and nothing else.
 */
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { fetchLiveOpportunitiesScoped } from "@/lib/bd-os/live-opportunities";
import { groupOfficers } from "@/lib/bd-os/ko-directory";

export const dynamic = "force-dynamic";

export interface OfficeOfficer {
  name: string;
  email: string;
  phone: string | null;
  /** Notices this officer has posted in the customer's codes — the reason to
   *  believe they are reachable, and the only ranking signal we can evidence. */
  notices: number;
}

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let officers;
  try {
    const live = await fetchLiveOpportunitiesScoped(supabase);
    officers = groupOfficers(live.rows).officers;
  } catch (e) {
    // Rule 61 — a failed dependency is a visible failure state, never a plausible
    // one. An empty map would render as "no officer at this office", which is a
    // claim about the directory rather than about our ability to read it.
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { state: "unwired", reason: `The contracting-officer feed could not be read (${msg}).` },
      { status: 503 }
    );
  }

  const byOffice: Record<string, OfficeOfficer[]> = {};
  for (const o of officers) {
    if (!o.office || !o.email) continue;
    (byOffice[o.office] ||= []).push({
      name: o.name, email: o.email, phone: o.phone, notices: o.noticeCount
    });
  }
  // Most-active first: an officer who posts often is the one most likely to
  // answer, and it is the only ordering either source lets us evidence.
  for (const k of Object.keys(byOffice)) {
    byOffice[k].sort((a, b) => b.notices - a.notices || a.name.localeCompare(b.name));
  }

  return NextResponse.json({
    state: "ok",
    match: "exact",          // the client must not invent a looser rule
    offices: byOffice,
    officeCount: Object.keys(byOffice).length,
    officerCount: officers.filter((o) => o.email).length
  });
}
