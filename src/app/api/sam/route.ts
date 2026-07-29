import { NextResponse } from "next/server";
import { resolveAgency, searchOpportunitiesByNaics } from "@/lib/sam";

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

const DEFAULT_NAICS = ["336413", "332710", "332720", "332999", "334511"];
const MAX_CODES = 6;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const naicsRaw = searchParams.get("naics");
  const naicsCodes = (naicsRaw ? naicsRaw.split(",") : DEFAULT_NAICS)
    .map((c) => c.trim())
    .filter((c) => /^\d{6}$/.test(c))
    .slice(0, MAX_CODES);
  if (naicsCodes.length === 0) {
    return NextResponse.json(
      { source: "error", error: "naics must be one or more 6-digit codes", opportunities: [] },
      { status: 400 }
    );
  }
  const limit = Number.parseInt(searchParams.get("limit") || "10", 10) || 10;

  const outcome = await searchOpportunitiesByNaics({ naicsCodes, limit });

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

  return NextResponse.json({ source: "live", total: outcome.total, opportunities });
}
