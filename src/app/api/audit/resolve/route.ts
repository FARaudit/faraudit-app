import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { fetchSolicitationByNoticeId, resolveAgency } from "@/lib/sam";
import { fetchAttachmentManifest, classifySectionRoles, planDocumentOrder, type DocumentPlanEntry } from "@/lib/sam-attachments";
import { extractText } from "@/lib/pdf-text-extractor";
import { detectSections } from "@/lib/section-boundary-detector";
import { anthropic } from "@/lib/anthropic";
import { samFetchWithKey } from "@/lib/sam-url-guard";

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
// The synchronous door does at most: SAM search + manifest + ONE primary-doc
// download+parse. A cold function + SAM latency on a combined RFP can approach
// the inner 20s download budget below; give the function room above it so a slow
// combined-body read completes (and shows §C/§L/§M present) instead of being cut
// off and falling back to the conservative "unverified" state.
export const maxDuration = 30;

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

// ━━ Content-based coverage guards (keep resolve fast + safe) ━━
// Download ONLY the primary doc, size-cap it, and time-box the fetch so the
// whole resolve stays within a few seconds. On ANY failure (cap / timeout /
// not-a-PDF / image-only / parse failure) we return null and the caller falls
// back to the prior, honest name-based coverage — never hang, never error.
// Raised 8s → 13s → 20s. On combined RFPs the §C/§L/§M sections live INLINE in
// the solicitation body; if the download+extract exceeds the timeout, content
// detection returns null and the door falls back to the conservative "unverified"
// state — which previously surfaced to the customer as a false "package partially
// retrieved." A 13s budget proved too tight on a cold serverless function + SAM
// latency (1240LP26Q0067, a 570KB/14-page combined RFQ that reads fine offline),
// so it now gets 20s (under the 30s maxDuration ceiling above). Even on a timeout
// the door no longer alarms — the UI proceeds confidently and the full audit reads
// the sections — but a successful in-budget read lets it show "present" up front.
const PRIMARY_DOWNLOAD_TIMEOUT_MS = 20000;
const PRIMARY_MAX_BYTES = 15 * 1024 * 1024; // ~15MB — skip text-extraction above this.

// Sections we can credit from the primary doc TEXT (real, not name-based).
type ContentSections = { C: boolean; L: boolean; M: boolean; I: boolean };

// Pick the doc to READ for embedded §C/§L/§M — the SUBSTANTIVE solicitation
// BODY, not a thin SF-30 amendment cover. planDocumentOrder optimizes the audit
// ingestion plan (form first, size-ascending tie-break), which surfaces the
// small SF-30 cover ahead of the large combined-RFP body — but the SF-30 cover
// has no §L/§M to read, so reading it would mask the embedded sections we're
// trying to detect (the N4008526R0065 defect). For CONTENT detection only, the
// real combined RFP body is the highest-value form, identified by a true
// "Solicitation"/RFP/SF-cover name that is NOT merely an SF-30/amendment cover;
// among those the LARGEST is the combined body (covers are thin). This does NOT
// touch the shared planDocumentOrder used by the audit pipeline.
const SF30_COVER_RE = /sf[\s-]?30|amendment of solicitation|amendment\/modification of contract|\bamd\b|\bamendment\b/i;
const REAL_SOL_BODY_RE = /\bsolicitation\b|\brf[qp]\b|sf[\s-]?1449|sf[\s-]?1442|sf[\s-]?33\b|sf[\s-]?0?18\b/i;
function pickContentPrimary(plan: DocumentPlanEntry[]): DocumentPlanEntry | null {
  const forms = plan.filter((e) => e.role === "form");
  const pool = forms.length > 0 ? forms : plan;
  if (pool.length === 0) return null;
  const score = (e: DocumentPlanEntry): number => {
    const isCover = SF30_COVER_RE.test(e.name);
    const isBody = REAL_SOL_BODY_RE.test(e.name);
    // A real solicitation body that is NOT an amendment cover is the best read.
    if (isBody && !isCover) return 2;
    if (isBody) return 1; // names itself a solicitation but also amendment-marked
    return 0;             // SF-30 cover / generic
  };
  // Highest score wins; among equals prefer the LARGEST (the combined body is
  // far bigger than a cover sheet); unknown size sorts last; name as final tie.
  return [...pool].sort((a, b) =>
    score(b) - score(a) ||
    (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1) ||
    a.name.localeCompare(b.name)
  )[0];
}

// Download the single primary doc and run the EXISTING section detection
// (extractText → detectSections) on its text. Returns which of §C/§L/§M/§I are
// actually present in the body, or null to signal "fall back to name-based".
// No new dependency: reuses the audit pipeline's own extractor + boundary
// detector. HEAD-checks the size when known, hard-caps the downloaded bytes,
// and treats an image-only / unparsable PDF as null (honest — we couldn't read
// it, so we don't claim sections from it).
async function detectPrimarySectionsFromText(
  primary: DocumentPlanEntry,
  requestDeadline: number
): Promise<ContentSections | null> {
  const apiKey = process.env.SAM_API_KEY;
  if (!apiKey) return null;

  // Size cap from the manifest (when SAM reported it) — skip the download
  // entirely for an oversized primary.
  if (primary.sizeBytes != null && primary.sizeBytes > PRIMARY_MAX_BYTES) return null;

  // ONE shared wall-clock budget for the WHOLE door read (download + any vision
  // pass), CLAMPED to the overall request deadline (limit d) so search + manifest +
  // read can't run three back-to-back fresh timeouts and blow past maxDuration=30.
  // If the earlier phases already ate the budget, skip the read entirely → the door
  // falls back to the honest name-based "unverified" state (never blocks/half-kills).
  const deadline = Math.min(Date.now() + PRIMARY_DOWNLOAD_TIMEOUT_MS, requestDeadline);
  if (deadline - Date.now() < 2000) return null; // <2s left — don't start a read we can't finish
  const remainingMs = () => Math.max(1000, deadline - Date.now());

  let buf: Buffer;
  try {
    // SSRF + key-leak guard (shared with the audit pipeline): host-allowlist the
    // untrusted manifest URL before the key is appended; manual redirect with
    // per-hop revalidation. Same fix applied to fetchPdfFromSamUrl / downloadPdf.
    const res = await samFetchWithKey(primary.url, apiKey, remainingMs());
    if (!res.ok) return null;
    // Guard against an oversized body even when the manifest size was unknown:
    // honor a Content-Length header before reading the bytes.
    const len = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(len) && len > PRIMARY_MAX_BYTES) return null;
    const ab = await res.arrayBuffer();
    if (ab.byteLength > PRIMARY_MAX_BYTES) return null;
    buf = Buffer.from(ab);
  } catch {
    return null; // timeout / network — fall back to name-based.
  }

  // magic-byte check — the manifest said .pdf; verify before parsing.
  if (buf.subarray(0, 4).toString("latin1") !== "%PDF") return null;

  let doc;
  try {
    doc = await extractText(buf);
  } catch {
    return null;
  }
  // Fix #3 — VISION FAST-PATH (Brain card 39). The text layer is empty/thin (a scanned/image-only
  // PDF). Instead of giving up (which would falsely read as "missing"), READ THE PAGES with a cheap
  // vision model — but ONLY for a SMALL doc (<5 pages), synchronously, so the door stays fast. A larger
  // scanned doc → null → the section state is UNVERIFIED (Fix #4) and the MAP (the full audit) owns the
  // authoritative read. Never block the door on a big vision call.
  const imageOnly = doc.extractionMethod === "fallback" || doc.warnings.some((w) => w.startsWith("LOW_TEXT_YIELD"));
  if (imageOnly) {
    if (doc.pageCount >= 1 && doc.pageCount < 5) return await detectPrimarySectionsViaVision(buf, remainingMs());
    return null; // too large to read synchronously at the door — unverified; the MAP confirms
  }

  // Reuse the audit pipeline's real section detection (the same section bag the
  // extractors consume: s["C"], s["L"], s["M"], s["I"]).
  const bag = detectSections(doc);
  const s = bag.sections;
  return { C: !!s["C"], L: !!s["L"], M: !!s["M"], I: !!s["I"] };
}

// Fix #3 helper — the synchronous, Haiku-tier vision read for a SMALL scanned primary. Reads the PDF
// pages as images and reports which UCF sections are present — the "drag-into-a-frontier-model" read,
// bounded so the door never hangs. Returns null on any failure (→ unverified, the MAP confirms). Brain
// guard: best-effort only; this is a fast-path hint, NOT the authoritative coverage (that is the MAP).
const VISION_COVERAGE_MODEL = "claude-haiku-4-5";
async function detectPrimarySectionsViaVision(buf: Buffer, budgetMs: number): Promise<ContentSections | null> {
  if (!anthropic) return null;
  try {
    const resp = await anthropic.messages.create(
      {
        model: VISION_COVERAGE_MODEL,
        max_tokens: 120,
        system:
          "You classify the structure of a U.S. federal solicitation document (which may be scanned page images). Report ONLY which Uniform Contract Format sections are PRESENT in THIS document. Reply with a single compact JSON object, no prose.",
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } },
              {
                type: "text",
                text:
                  'Which of these are present in this document? ' +
                  'C = Description / Specifications / Statement of Work / salient characteristics. ' +
                  'L = Instructions to Offerors (incl. FAR 52.212-1). ' +
                  'M = Evaluation factors / Basis for Award (incl. FAR 52.212-2). ' +
                  'I = Contract Clauses. ' +
                  'Respond with EXACTLY: {"C":true|false,"L":true|false,"M":true|false,"I":true|false}'
              }
            ]
          }
        ]
      },
      { signal: AbortSignal.timeout(budgetMs) }
    );
    const text = resp.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    const m = text.match(/\{[^}]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    return { C: !!j.C, L: !!j.L, M: !!j.M, I: !!j.I };
  } catch {
    return null; // vision unavailable / timeout / parse failure → unverified; the MAP confirms
  }
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

  // ONE overall request deadline (limit d) — bounds the whole door (search +
  // manifest + primary read) against maxDuration=30. The content-read phase clamps
  // its budget to what remains here, so a slow search/manifest can't push the read
  // past the function ceiling and get hard-killed mid-write; instead the read is
  // shortened or skipped and coverage degrades to the honest name-based state.
  const requestDeadline = Date.now() + 28000;

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

  // ━━ Step 5: content-based coverage of the PRIMARY doc (combined-RFP fix) ━━
  // Filename-only coverage UNDER-REPORTS when the package is a single combined
  // RFP/SF-1449: §C/§L/§M live INSIDE the main doc, not as separate files, so
  // they wrongly show "not detected" (e.g. N4008526R0065). Download ONLY the
  // primary (form) and run the SAME section detection the audit pipeline uses
  // on its text, then UNION the result with the name-based roles: a section
  // counts as present if found EITHER in the primary text OR as a tagged
  // attachment. On any download/parse/image-only failure this returns null and
  // coverage degrades to the prior honest name-based behavior.
  const primaryDoc = pickContentPrimary(plan);
  let coverageBasis: "content" | "name_only" = "name_only";
  if (primaryDoc) {
    const textSections = await detectPrimarySectionsFromText(primaryDoc, requestDeadline);
    if (textSections) {
      coverageBasis = "content";
      // UNION — text-detected presence is REAL; never un-set a name-based hit.
      coverage.C = coverage.C || textSections.C;
      coverage.L = coverage.L || textSections.L;
      coverage.M = coverage.M || textSections.M;
      coverage.I = coverage.I || textSections.I;
    }
  }

  const complete = coverage.main && coverage.C && coverage.L && coverage.M;
  const missingCore: string[] = [];
  if (!coverage.main) missingCore.push("MAIN");
  if (!coverage.C) missingCore.push("C");
  if (!coverage.L) missingCore.push("L");
  if (!coverage.M) missingCore.push("M");

  // ━━ Fix #4 — THREE HONEST STATES (Brain card 39): present · absent · unverified ━━
  // The front door is BEST-EFFORT (the MAP owns the authoritative coverage). The cardinal sin is
  // calling a section "missing" when we never actually read the body. `coverageBasis` records whether
  // content detection ran: "content" = we READ the primary, so a not-found section is genuinely ABSENT;
  // "name_only" = we could NOT read it (image-only / timeout / oversized) → we CANNOT claim absence, it
  // is UNVERIFIED ("the full audit reads the complete package"). Never present unverified as missing.
  const sectionState = (present: boolean): "present" | "absent" | "unverified" =>
    present ? "present" : coverageBasis === "content" ? "absent" : "unverified";
  const coverageStates: Record<string, "present" | "absent" | "unverified"> = {
    MAIN: coverage.main ? "present" : "unverified", // a form-role signal; its absence is never "confirmed"
    C: sectionState(coverage.C),
    L: sectionState(coverage.L),
    M: sectionState(coverage.M),
    I: sectionState(coverage.I)
  };
  const absentCore = ["C", "L", "M"].filter((k) => coverageStates[k] === "absent");
  const unverifiedCore = ["MAIN", "C", "L", "M"].filter((k) => coverageStates[k] === "unverified");

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
    coverageBasis,
    missingCore, // retained (back-compat) = absent ∪ unverified
    coverageStates, // Fix #4 — per-section present|absent|unverified
    absentCore, // CONFIRMED not in the package (we read the body)
    unverifiedCore, // could NOT verify at the door — the full audit confirms (never "missing")
    complete
  });
}
