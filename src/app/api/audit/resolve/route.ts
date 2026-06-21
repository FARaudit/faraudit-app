import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { fetchSolicitationByNoticeId, resolveAgency } from "@/lib/sam";
import { fetchAttachmentManifest, classifySectionRoles, planDocumentOrder } from "@/lib/sam-attachments";

// Synchronous resolve+manifest endpoint backing the Run Audit front door
// (fix/run-audit-frontdoor-static). It answers ONE question — "what does the
// agency's posted package actually contain?" — BEFORE the audit is enqueued, so
// the complete/partial coverage strip is driven by REAL SAM data, never
// fabricated. It downloads NOTHING (manifest + search only) and computes
// section coverage from filenames via the same FA-182 name heuristics the
// upload mode uses, so this and the upload path agree.
//
// HONESTY contract: every failure mode returns { ok:false, reason } with no
// invented docs / counts / agency / coverage. SAM unreachable → sam_unavailable.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mirror the manifest/search timeout budget already used across sam.ts (15s on
// the search) + sam-attachments.ts (30s on the manifest). The handler does at
// most one search + one manifest fetch, so it stays well under any platform
// function ceiling.
const HEX32_RE = /^[a-f0-9]{32}$/i;
// Extract a 32-hex notice id from a sam.gov opportunity URL path
// (https://sam.gov/opp/<32hex>/view, with or without query/fragment).
const SAM_OPP_HEX_RE = /\/opp\/([a-f0-9]{32})/i;

// The UCF section set the design's coverage strip shows: MAIN (the base
// solicitation / SF-1449 / 1442) + §C, §L, §M (core) and §I (optional). §H is
// shown in the strip too but is not gated on, mirroring the upload mode's CORE
// = main/c/l/m. "complete" requires the four core sections.
type Coverage = { main: boolean; C: boolean; L: boolean; M: boolean; I: boolean };

interface ResolveDoc {
  name: string;
  sizeBytes: number | null;
  sectionRoles: string[];
}

function fail(reason: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, reason }, { status });
}

export async function GET(req: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ ok: false, reason: "supabase_not_configured" }, { status: 500 });
  }

  // ━━ Auth — mirror /api/audit ━━
  const supabase = await createServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  if (!process.env.SAM_API_KEY) {
    return fail("sam_not_configured", 503);
  }

  const ref = (req.nextUrl.searchParams.get("ref") || "").trim();
  if (!ref) {
    return fail("missing_ref", 400);
  }

  // ━━ Step 1: ref → a lookup token ━━
  //   • SAM opportunity URL → the 32-hex notice id in its /opp/<id>/ path.
  //   • raw 32-hex notice id → used directly.
  //   • solicitation number (e.g. N4008526R0065, FA301626R0018) → passed to the
  //     SAM search below as-is; fetchSolicitationByNoticeId already tries
  //     noticeid then solnum (and a DLA hyphen-stripped fallback).
  let lookup = ref;
  const urlMatch = ref.match(SAM_OPP_HEX_RE);
  if (urlMatch) {
    lookup = urlMatch[1];
  } else if (/^https?:\/\//i.test(ref)) {
    // A URL was pasted but it carried no /opp/<32hex>/ — we can't honestly
    // resolve it (could be a search/results link), so don't guess.
    return fail("unrecognized_sam_url", 422);
  }

  // ━━ Step 2: resolve to a canonical solicitation (notice id + facts) ━━
  // fetchSolicitationByNoticeId returns the SAM record with its real 32-hex
  // noticeId regardless of whether we fed it a notice id or a sol number, so a
  // sol-number ref still yields the hex id the manifest endpoint needs. SAM
  // returns the single best (limit=1) match for a sol number; multiple matches
  // are not surfaced here (see report — edge case).
  let solicitation;
  try {
    solicitation = await fetchSolicitationByNoticeId(lookup);
  } catch {
    return fail("sam_unavailable", 502);
  }

  if (!solicitation || !solicitation.noticeId) {
    return fail("not_found", 404);
  }

  const noticeId = solicitation.noticeId;
  if (!HEX32_RE.test(noticeId)) {
    // SAM returned a record without a usable 32-hex notice id — the manifest
    // endpoint is keyed on the hex id, so we can't honestly fetch the package.
    return fail("not_found", 404);
  }

  // ━━ Step 3: fetch the posted document manifest (no downloads) ━━
  const manifest = await fetchAttachmentManifest(noticeId);
  if (!manifest || manifest.length === 0) {
    // No attachment list on the opportunity (or SAM unreachable — the manifest
    // helper returns null in both cases). Honest: report the empty package
    // rather than fabricate coverage.
    return fail("no_documents", 404);
  }

  // ━━ Step 4: name-based section coverage (HONEST — no document downloads) ━━
  // planDocumentOrder gives us the deterministic role (form / amendment /
  // attachment) so "MAIN present" means a real primary solicitation form was
  // identified, not merely that attachments exist. §-roles come from the same
  // FA-182 classifier the upload mode uses.
  const plan = planDocumentOrder(manifest, solicitation.solicitationNumber);
  const mainPresent = plan.some((e) => e.role === "form");

  const coverage: Coverage = { main: mainPresent, C: false, L: false, M: false, I: false };
  const docs: ResolveDoc[] = plan.map((e) => {
    const roles = classifySectionRoles(e.name);
    for (const r of roles) {
      if (r === "C") coverage.C = true;
      else if (r === "L") coverage.L = true;
      else if (r === "M") coverage.M = true;
    }
    // §I (contract clauses / provisions) — name-only, conservative. The
    // classifier emits C/H/L/M only, so §I is detected here from the filename
    // directly (clauses / provisions / "Section I").
    if (/\bclauses?\b|provisions?\b|\bsection\s*i\b|incorporated by reference/i.test(e.name)) {
      coverage.I = true;
    }
    return { name: e.name, sizeBytes: e.sizeBytes, sectionRoles: roles };
  });

  const complete = coverage.main && coverage.C && coverage.L && coverage.M;
  const missingCore: string[] = [];
  if (!coverage.main) missingCore.push("MAIN");
  if (!coverage.C) missingCore.push("C");
  if (!coverage.L) missingCore.push("L");
  if (!coverage.M) missingCore.push("M");

  return NextResponse.json({
    ok: true,
    noticeId,
    solNumber: solicitation.solicitationNumber,
    agency: resolveAgency(solicitation),
    naics: solicitation.naicsCode,
    title: solicitation.title,
    filesTotal: docs.length,
    docs,
    coverage,
    missingCore,
    complete
  });
}
