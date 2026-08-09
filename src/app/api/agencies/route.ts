import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { fetchLiveOpportunitiesScoped, WINDOW_DAYS } from "@/lib/bd-os/live-opportunities";
import { fetchRecentAudits } from "@/lib/bd-os/queries";

export const dynamic = "force-dynamic";

// GET /api/agencies — the buying offices issuing work against THIS customer's NAICS.
//
// WHAT THIS IS NOT. The previous shape of this route reported state:"unwired" against a
// planned agency org map with obligated dollars, small-business shares, set-aside posture
// and a quarterly forecast. None of that is measured anywhere in the product, and the seed
// that used to render it was invented. That TODO is left below rather than deleted — it is
// a real intended capability, not a fabrication — but it is not what this route serves.
//
// WHY DERIVED AND NOT DECLARED. A settings form asking a customer to name target agencies
// presumes the knowledge they are buying: a small sub with no capture team does not know
// which offices to name, and finding out is the product. So nothing here is typed. The
// offices come from the customer's own NAICS codes, ranked by what those codes actually
// attract, and a customer who has declared nothing still sees the full ranking.
//
// ONE UNIT, SHARED WITH THE FEED. `resolveAgency()` keeps the top two segments of SAM's
// dotted path and joins them " · " — department, then the buying office. That second
// segment is what Opportunities already counts in "N departments · N buying offices", so
// this route splits on the same separator and counts the same way. A deeper office leaf
// exists (`resolveOfficeLeaf`, used on the audit masthead) but is NOT carried on feed rows;
// keying on it here would make this page disagree with Opportunities about the same firm.
//
// THE WINDOW IS THE WINDOW. Nothing persists notice history — the SAM feed is live and
// drops expired notices — so this ranks what is open now, over WINDOW_DAYS. It is not a
// 90-day count and the response says so, because a rank that silently reshuffles is worse
// than one that admits its span.
//
// TODO (unbuilt, and deliberately not implied anywhere on the page): agency org hierarchy
// with obligated dollars, small-business share and quarterly forecast, from
// defense_spending_intel.agency_breakdown plus a parent→child taxonomy. Needs a source
// that is not connected. Until then this route serves what is measured and nothing else.

type Office = {
  department: string;
  office: string;
  notices: number;
  naics: string[];
  audited: number;
  decided: number;
  in_pipeline: number;
  next_deadline: string | null;
  set_asides: string[];
};

/** Split resolveAgency()'s "Department · Office". Only the FIRST separator splits, so an
 *  office whose own name contains " · " stays intact. Mirrors opportunities-live.js. */
/* THE JOIN BETWEEN A NOTICE AND AN AUDIT IS A STRING, SO IT IS NORMALISED ON BOTH SIDES.
   Measured against production today the two agree character-for-character — normalising
   changes not one of the 53 matches — so this is insurance against a latent class, not a
   live fix. The class is worth closing because of how it fails: a case or spacing change
   on SAM's side would drop an office to 0 audits, and a zero in that column reads as "you
   have never worked this office" rather than "we could not match the name."

   NOT office_leaf, which is the obvious-looking alternative and is wrong: it is sub-office
   grain — "NAVSUP FLT LOG CTR YOKOSUKA", "W6QM MICC-FT BLISS" — where this page groups at
   "DEPT OF DEFENSE · DEPT OF THE NAVY". Joining on it would match almost nothing. */
function officeKey(s: string | null | undefined): string {
  return String(s ?? "").toUpperCase().replace(/\s+/g, " ").trim();
}

function splitAgency(s: string | null): [string, string] {
  const v = String(s ?? "").trim();
  if (!v) return ["", ""];
  const i = v.indexOf(" · ");
  if (i < 0) return [v, ""];
  return [v.slice(0, i).trim(), v.slice(i + 3).trim()];
}

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
    // Rule 61 — a failed dependency is a visible failure state, never a plausible one.
    // "SAM did not answer" and "no office is buying your codes" are different facts and
    // the page must not render them the same way.
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { state: "error", reason: `live feed unavailable: ${msg}`, window_days: WINDOW_DAYS },
      { status: 503 }
    );
  }

  // The customer's own audits, keyed by the same department · office string, so "you have
  // worked this office before" is a fact about their record rather than a guess.
  let audits: Awaited<ReturnType<typeof fetchRecentAudits>> = [];
  try {
    audits = await fetchRecentAudits(supabase, user.id, 500);
  } catch {
    // A missing audit history degrades the ranking's annotations, not the ranking. Counts
    // stay zero and the page says nothing about audits rather than claiming none exist.
    audits = [];
  }
  /* THIS COLUMN COUNTS SOLICITATIONS, NOT RUNS. "Your audits: 37" beside a buying office
     is read as "I have looked at 37 of their opportunities". It was counting engine runs,
     and this customer's ledger holds 77 runs across 19 solicitations — measured per office,
     21 runs against the Air Force covered 2 solicitations, and 3 against DLA covered 1.
     Re-auditing the same solicitation is our retry, not their pursuit, so it is collapsed.

     ONLY A RUN THAT FINISHED COUNTS. fetchRecentAudits applies no status filter, so a
     failed run used to claim we had audited an office when nothing was produced. A run
     that died is our problem. `complete` is the marker live-opportunities.ts joins on. */
  const auditedByOffice = new Map<string, { sols: Set<string>; decided: Set<string> }>();
  for (const a of audits) {
    if (a.status !== "complete") continue;
    const key = officeKey(a.agency);
    if (!key) continue;
    // Identity of the pursuit, not of the run. Falls back through notice id to the row id
    // so a solicitation with no number still counts once rather than vanishing.
    const sol = String(a.solicitation_number || a.notice_id || a.id || "").trim();
    if (!sol) continue;
    const cur = auditedByOffice.get(key) ?? { sols: new Set<string>(), decided: new Set<string>() };
    cur.sols.add(sol);
    // A decision is a recorded outcome or a committal verdict — not merely a completed run.
    if (a.outcome || a.recommendation) cur.decided.add(sol);
    auditedByOffice.set(key, cur);
  }

  const byKey = new Map<string, Office>();
  for (const r of rows) {
    const raw = String(r.agency ?? "").trim();
    if (!raw) continue;
    const [department, office] = splitAgency(raw);
    const cur = byKey.get(raw) ?? {
      department,
      office,
      notices: 0,
      naics: [],
      audited: 0,
      decided: 0,
      in_pipeline: 0,
      next_deadline: null,
      set_asides: [],
    };
    cur.notices += 1;
    if (r.naics_code && !cur.naics.includes(r.naics_code)) cur.naics.push(r.naics_code);
    if (r.set_aside && !cur.set_asides.includes(r.set_aside)) cur.set_asides.push(r.set_aside);
    if (r.in_pipeline) cur.in_pipeline += 1;
    // Soonest response deadline still ahead of us — the reason to look at this office today.
    if (r.response_deadline) {
      if (!cur.next_deadline || r.response_deadline < cur.next_deadline) cur.next_deadline = r.response_deadline;
    }
    byKey.set(raw, cur);
  }
  for (const [raw, o] of byKey) {
    const hit = auditedByOffice.get(officeKey(raw));
    if (hit) { o.audited = hit.sols.size; o.decided = hit.decided.size; }
  }

  const OFFICES = [...byKey.values()].sort(
    (a, b) => b.notices - a.notices || a.office.localeCompare(b.office)
  );
  const departments = new Set(OFFICES.map((o) => o.department).filter(Boolean)).size;

  // `reason` is null iff there is something to show. The empty cases are named separately
  // because they need different words and a different next action: no codes on file is a
  // profile the customer can fix; an empty window is a real zero result.
  const reason =
    OFFICES.length > 0
      ? null
      : scope.source === "no-profile-codes"
        ? "no-profile-codes"
        : "no-notices-in-window";

  return NextResponse.json({
    state: OFFICES.length > 0 ? "ok" : "empty",
    reason,
    OFFICES,
    meta: {
      window_days: WINDOW_DAYS,
      notices: rows.length,
      departments,
      offices: OFFICES.length,
      naics_scope: scope.codes,
      scope_source: scope.source,
    },
  });
}
