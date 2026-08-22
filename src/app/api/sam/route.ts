import { NextResponse } from "next/server";
import { resolveAgency, searchOpportunitiesByNaics } from "@/lib/sam";
import { resolveFeedScope } from "@/lib/bd-os/live-opportunities";
import { createServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/sam — live SAM.gov opportunity search, fail-closed.
//
// This route NEVER returns sample rows. Its three outcomes:
//   200 { source: "live", total, opportunities }   — real upstream data
//   503 { source: "unconfigured", error }          — SAM_API_KEY missing
//   502 { source: "error", error }                 — upstream failed
// The UI must render the non-200 shapes as an explicit unavailable state.
// The API key lives server-side only and error strings are sanitized in
// src/lib/sam.ts (status only), so the key can never reach a response body.
// Proof: src/app/api/sam/route.failclosed.test.ts (run RED pre-fix).

// NO DEFAULT SCOPE (2026-08-22). This was
//   const DEFAULT_NAICS = ["336413","332710","332720","332999","334511"];
// so a caller that supplied no ?naics= got five aerospace codes nobody in this account had declared. The
// scope of a feed is a fact about the CUSTOMER; a route may not supply one on their behalf. Absent a
// parameter we resolve the profile, and an account with no codes gets the explicit 400 below — the same
// honest-empty this route already applies to a malformed parameter.
const MAX_CODES = 6;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const naicsRaw = searchParams.get("naics");
  // Keep the SCOPE, not just its codes: "no codes on file" and "the profile could not be read" are
  // different answers to the customer and only one of them is fixable in Settings.
  const profileScope = naicsRaw ? null : await resolveFeedScope(await createServerClient());
  const naicsCodes = (naicsRaw ? naicsRaw.split(",") : (profileScope?.codes ?? []))
    .map((c) => c.trim())
    .filter((c) => /^\d{6}$/.test(c))
    .slice(0, MAX_CODES);
  if (naicsCodes.length === 0) {
    return NextResponse.json(
      { source: "error", error: naicsRaw
          ? "naics must be one or more 6-digit codes"
          : profileScope?.source === "unreadable"
            ? "your profile could not be read, so this feed was not scoped — nothing is returned rather than someone else's market"
            : "no NAICS codes on your profile — add one in Settings to scope this feed", opportunities: [] },
      { status: 400 }
    );
  }
  const limit = Number.parseInt(searchParams.get("limit") || "10", 10) || 10;
  // Filters are OPT-IN and echoed back in the response so a caller can only
  // caption what was actually applied (?active=1&setAside=SBA).
  const activeOnly = searchParams.get("active") === "1";
  const setAside = searchParams.get("setAside") || undefined;

  const outcome = await searchOpportunitiesByNaics({ naicsCodes, limit, activeOnly, setAside });

  if (!outcome.ok) {
    return NextResponse.json(
      { source: outcome.kind === "unconfigured" ? "unconfigured" : "error", error: outcome.error, opportunities: [] },
      { status: outcome.kind === "unconfigured" ? 503 : 502 }
    );
  }

  const opportunities = outcome.solicitations.map((s) => ({
    id: s.noticeId,
    title: s.title,
    agency: resolveAgency(s),
    naics: s.naicsCode,
    type: s.type,
    postedDate: s.postedDate,
    responseDeadline: s.responseDeadLine,
    setAside: s.typeOfSetAside,
    solicitationNumber: s.solicitationNumber,
    description: s.description.slice(0, 300),
    uiLink: s.noticeId ? `https://sam.gov/opp/${s.noticeId}/view` : null,
  }));

  return NextResponse.json({
    source: "live",
    total: outcome.total,
    filters: { activeOnly, setAside: setAside ?? null },
    opportunities,
  });
}
