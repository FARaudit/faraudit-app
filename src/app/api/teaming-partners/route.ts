import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { searchTeamingPartners, SBA_SET_ASIDES, isKnownSetAside, type SamEntity } from "@/lib/sam-entity";
import { resolveFeedScope } from "@/lib/bd-os/live-opportunities";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// Partners are SAM-registered entities whose PRIMARY NAICS matches one of the
// customer's own codes. Everything returned is a registration fact: legal name,
// UEI, CAGE, state, SBA business types, the registration's expiry, and the
// government business point of contact. Nothing is scored.
//
// The page used to ask for a single hardcoded NAICS. It now asks for none and
// gets the customer's own codes, so a second customer sees their own market
// rather than this one's.

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const naicsParam = url.searchParams.get("naics");
  const state = url.searchParams.get("state");
  const setAside = url.searchParams.get("setAside");

  // An unrecognised set-aside is rejected rather than forwarded. SAM answers an unknown
  // sbaBusinessTypeCode with 200 and zero records, which the page would render as "nothing
  // matched" — a statement about the market caused by a bad parameter.
  if (setAside && !isKnownSetAside(setAside)) {
    return NextResponse.json(
      { error: "unknown set-aside", meta: { reason: "unknown-set-aside", allowed: SBA_SET_ASIDES } },
      { status: 400 }
    );
  }

  const scope = await resolveFeedScope(supabase);
  const codes = naicsParam ? [naicsParam] : scope.codes;

  if (codes.length === 0) {
    return NextResponse.json({
      partners: [],
      scope: { codes: [], source: scope.source },
      meta: { reason: "no-profile-codes", per_code: {}, set_aside_options: SBA_SET_ASIDES }
    });
  }

  if (!process.env.SAM_API_KEY) {
    // A missing key is an operator fault, not an empty market. It is named so
    // the page can say which one it is.
    return NextResponse.json({
      partners: [],
      scope: { codes, source: scope.source },
      meta: { reason: "sam-key-missing", per_code: {}, set_aside_options: SBA_SET_ASIDES }
    });
  }

  const perCode: Record<string, number> = {};
  let totalAvailable = 0;
  type Partner = SamEntity;
  const byKey = new Map<string, Partner>();
  for (const code of codes) {
    const result = await searchTeamingPartners({ naics: code, state: state || null, setAside: setAside || null, limit: 25 });

    // FAIL CLOSED, AND WHOLESALE. If any one of the customer's codes could not be searched,
    // the list on the page is not "the active registrations under your codes" — it is an
    // unlabelled subset. Returning the codes that did answer, with no way to say which one
    // did not, states a smaller market as if it were the whole one. 502 sends the client to
    // its error state, which says outright that this is not an empty market.
    //
    // The cost is real: one bad code discards the others' good rows. The alternative is a
    // partial list plus a per-code caveat in the renderer, which is the better product and a
    // larger change than this one. Named here so it is a choice on record, not an oversight.
    if (result.outcome !== "ok") {
      return NextResponse.json(
        {
          partners: [],
          scope: { codes, source: scope.source },
          meta: { reason: result.outcome === "unconfigured" ? "sam-key-missing" : "sam-unavailable", per_code: {}, failed_code: code, set_aside_options: SBA_SET_ASIDES }
        },
        { status: 502 }
      );
    }

    perCode[code] = result.partners.length;
    // Each entity has exactly ONE primaryNaics, so per-code totals do not overlap and the
    // sum is exact rather than an upper bound.
    totalAvailable += result.total;
    for (const r of result.partners) {
      const key = r.uei || r.cage_code || r.legal_business_name;
      if (!key || byKey.has(key)) continue;
      byKey.set(key, r);
    }
  }

  const partners = Array.from(byKey.values()).sort((a, b) =>
    String(a.legal_business_name || "").localeCompare(String(b.legal_business_name || ""))
  );

  return NextResponse.json({
    partners,
    scope: { codes, source: scope.source },
    meta: {
      source: "sam-entity-v3",
      per_code: perCode,
      state: state || null,
      set_aside: setAside || null,
      // What SAM holds vs what this page received. total_available > shown means the list is
      // a page-one sample, and the surface has to say so rather than imply completeness.
      total_available: totalAvailable,
      shown: partners.length,
      set_aside_options: SBA_SET_ASIDES,
      reason: partners.length === 0 ? (state || setAside ? "no-match" : "no-partners") : null
    }
  });
}
