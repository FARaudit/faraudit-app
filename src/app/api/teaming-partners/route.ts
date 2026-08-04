import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { searchTeamingPartners } from "@/lib/sam-entity";
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

  const scope = await resolveFeedScope(supabase);
  const codes = naicsParam ? [naicsParam] : scope.codes;

  if (codes.length === 0) {
    return NextResponse.json({
      partners: [],
      scope: { codes: [], source: scope.source },
      meta: { reason: "no-profile-codes", per_code: {} }
    });
  }

  if (!process.env.SAM_API_KEY) {
    // A missing key is an operator fault, not an empty market. It is named so
    // the page can say which one it is.
    return NextResponse.json({
      partners: [],
      scope: { codes, source: scope.source },
      meta: { reason: "sam-key-missing", per_code: {} }
    });
  }

  const perCode: Record<string, number> = {};
  type Partner = Awaited<ReturnType<typeof searchTeamingPartners>>[number];
  const byKey = new Map<string, Partner>();
  for (const code of codes) {
    const rows = await searchTeamingPartners({ naics: code, state: state || null, setAside: setAside || null, limit: 25 });
    perCode[code] = rows.length;
    for (const r of rows) {
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
      reason: partners.length === 0 ? (state || setAside ? "no-match" : "no-partners") : null
    }
  });
}
