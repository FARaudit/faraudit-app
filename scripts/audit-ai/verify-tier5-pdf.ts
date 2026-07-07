// Phase-3 render smoke test for the v5 Executive Brief (PDF) port.
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/verify-tier5-pdf.ts
//
// Drives the PORTED PDF renderer (renderExecBriefBodyV5 / renderExecBriefDocV5) on
// three poles and asserts the doctrine Phase 3 must preserve:
//   · F3 (scorecardTiles) — committal pole "None"/counts; noVerdict pole both risk
//     tiles "Not determined" (SHARED core.ts derivation, identical to the web view).
//   · reasoning chain single-sourced from render.ts (reasoningSteps / REACHED_INTRO).
//   · verbatim rationale; absence rule (incomplete-empty → findings omitted);
//     no-charge chip on the noCharge flag; eligibility top-line only + OUT_OF_SCOPE
//     suppression (doctrine §5); REVIEW watermark is rep-only (clean in production);
//     the <doc-page> host + shell inline for headless-Chromium capture.
// Also writes openable full-document HTML samples for the Design Gate-2 QA look.

import { writeFileSync, mkdirSync } from "node:fs";
import { renderExecBriefBodyV5, renderExecBriefDocV5 } from "@/lib/v5-report/render-pdf";
import { REACHED_INTRO } from "@/lib/v5-report/render";
import type { V4Data } from "@/lib/v4-report/render";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { cond ? pass++ : fails.push(label); };

const BID: V4Data = {
  shell: { auditId: "aud-bid-1" },
  masthead: { docType: "RFP", solicitation: "FA860126Q0026", title: "Base Operations Support Services", facts: [{ k: "Agency", v: "USAF" }, { k: "NAICS", v: "561210", sub: "Facilities Support", mono: true }] },
  verdict: { pole: "BID", band: "Bid", tone: "go", eligible: true, rationale: "The record is complete, no blocking defect or verified disqualification is present, and the two gates are routine and clearable within the response window." },
  coverage: { state: "COMPLETE", lead: "All documents read.", read: 4, indexed: 0, total: 4, core: [{ k: "C", ok: true }, { k: "L", ok: true }, { k: "M", ok: true }] },
  findings: { p0: [], p1: [{ req: "Submit a Certificate of Conformance with the offer.", cite: "§L", excerpt: "The Offeror shall submit a Certificate of Conformance.", curability: "the CoC is attached to the offer.", driver: true }, { req: "Register in SAM before award.", cite: "§K" }], p2: [{ req: "Standard telecom prohibition flows down.", cite: "52.204-25" }] },
  submissionL: { grounded: true, lead: "One technical volume, page-limited.", rows: [{ vol: "I", req: "Technical — approach narrative", condition: "≤20 pages", cite: "§L" }] },
  evalM: { grounded: true, basis: "Lowest-Priced Technically Acceptable — LPTA", factors: [{ name: "Factor 1 — Technical", basis: "Pass/fail acceptability", cite: "§M" }] },
  clins: { grounded: false },
  dates: [{ label: "Offers due", value: "30 Sep 2026 · 2:00 PM CT", kind: "gate" }, { label: "Questions due", value: "12 Sep 2026" }],
  provenance: { auditDate: "07 Jul 2026 · 09:14", engine: "agentic_v3", manifest: [{ name: "Solicitation.pdf", read: "full" }, { name: "Attachment-1-PWS.pdf", read: "full" }, { name: "Wage-Determination.pdf", read: "indexed" }] },
};

const INCOMPLETE: V4Data = {
  ...BID,
  shell: { auditId: "aud-inc-1" },
  verdict: { pole: "INCOMPLETE", band: "Incomplete", tone: "slate", noVerdict: true, noCharge: true, eligible: null, rationale: "Only 2 of 4 documents could be read; a partial read cannot certify what it did not see, so no verdict is issued." },
  coverage: { state: "INCOMPLETE", lead: "Partial read.", read: 2, indexed: 0, total: 4, core: [] },
  findings: { p0: [], p1: [], p2: [] },
};

const OUT_OF_SCOPE: V4Data = {
  ...BID,
  shell: { auditId: "aud-oos-1" },
  masthead: { ...BID.masthead, docType: "SOURCES SOUGHT", title: "Sources Sought — Market Research (RFI)" },
  verdict: { pole: "OUT_OF_SCOPE", band: "No verdict", tone: "slate", noVerdict: true, noCharge: true, rationale: "The notice solicits no offer and confers no basis for award, so a bid decision does not apply." },
  coverage: { state: "COMPLETE", lead: "Notice read in full.", read: 1, indexed: 0, total: 1, core: [] },
  findings: { p0: [], p1: [], p2: [] },
  submissionL: { grounded: false },
  evalM: { grounded: false },
  clins: { grounded: false },
  dates: [],
};

const bid = renderExecBriefBodyV5(BID);
const inc = renderExecBriefBodyV5(INCOMPLETE);
const oos = renderExecBriefBodyV5(OUT_OF_SCOPE);
const bidDoc = renderExecBriefDocV5(BID);

// ── F3 (scorecardTiles) — the consolidated derivation, rendered in the exec quad ──
ok("P3 R1: BID (committal) → Show-stoppers tile reads 'None' (not 'Not determined')", /ex-v">None<\/div><div class="ex-k">Show-stoppers/.test(bid));
ok("P3 R2: INCOMPLETE (noVerdict) → Show-stoppers tile reads 'Not determined' (textv)", /ex-v textv">Not determined<\/div><div class="ex-k">Show-stoppers/.test(inc));
ok("P3 R3: INCOMPLETE → Gates tile ALSO 'Not determined' (both risk tiles, F3)", /ex-v textv">Not determined<\/div><div class="ex-k">Gates to clear/.test(inc));
ok("P3 R4: BID → Gates tile shows the count '2'", /ex-v">2<\/div><div class="ex-k">Gates to clear/.test(bid));

// ── doctrine invariants ──
ok("P3 R5: rationale renders VERBATIM in the bottom line", bid.includes(BID.verdict.rationale) && inc.includes(INCOMPLETE.verdict.rationale));
ok("P3 R6: verdict word = band verbatim", /gv-word">Bid</.test(bid) && /gv-word">Incomplete</.test(inc));
ok("P3 R7: No-charge chip shows on the noCharge honest-fail only", /gv-chip nocharge">No charge/.test(inc) && !/gv-chip nocharge/.test(bid));
ok("P3 R8: eligibility chip top-line (ok on BID, nd on INCOMPLETE)", /gv-chip elig" data-e="ok"/.test(bid) && /gv-chip elig" data-e="nd"/.test(inc));
ok("P3 R9: eyebrow is SHARED (Gate decision on BID · no-verdict wording on INCOMPLETE)",
  /gv-eb"><span class="gv-dot"><\/span>Gate decision</.test(bid) && /No verdict — coverage incomplete/.test(inc));
ok("P3 R10: reasoning chain present + intro exported VERBATIM", bid.includes("How this call was reached") && bid.includes(REACHED_INTRO.slice(0, 40)));
ok("P3 R11: §M no-score foot survives ('No weights, points, or numeric score')", /No weights, points, or numeric score/.test(bid));

// ── reasoning chain shape (SHARED render.ts, numbered identically to the web view) ──
const bidSteps = (bid.match(/gb-rc-step/g) || []).length;
ok("P3 R12: BID chain has ≥5 steps and ends on the verdict node", bidSteps >= 5 && /gb-rc-step verdict"/.test(bid) && /gb-rc-out">Bid</.test(bid));
ok("P3 R13: INCOMPLETE chain is terminal at coverage (skip node '·' + verdict 'Incomplete')",
  /gb-rc-n">·</.test(inc) && /gb-rc-step verdict"[^]*gb-rc-out">Incomplete</.test(inc));

// ── absence rule (§2) — incomplete-empty omits the findings section ──
ok("P3 R14: findings group renders on BID (complete) and is OMITTED on INCOMPLETE-empty",
  /gb-fg-h" data-sev="p0"/.test(bid) && !/gb-fg-h/.test(inc));

// ── OUT_OF_SCOPE — §5 eligibility suppression + advisory tile ──
ok("P3 R15: OUT_OF_SCOPE suppresses the eligibility chip entirely (doctrine §5)", !/gv-chip elig/.test(oos));
ok("P3 R16: OUT_OF_SCOPE 4th tile is 'Advisories' (no eligibility), not an elig tile", /<div class="ex-k">Advisories<\/div>/.test(oos));

// ── watermark is rep-only — production briefs are clean ──
const repVariant = renderExecBriefBodyV5({ ...BID, rep: true } as V4Data & { rep: boolean });
ok("P3 R17: REVIEW watermark is rep-only — prod cover has NO is-rep; rep fixture DOES", !/gb-cover is-rep/.test(bid) && /gb-cover is-rep/.test(repVariant));

// ── standalone document host — self-contained for headless capture ──
ok("P3 R18: full doc inlines the <doc-page> host + shell + stylesheet",
  /<doc-page size="letter" margin="0.75in">/.test(bidDoc) && bidDoc.includes("customElements.define('doc-page'") && bidDoc.includes(".gb-cover"));

// ── write openable full-document samples for Design Gate-2 QA ──
const OUT = "ceo/redesign-final/Review/V5-PORT-render-samples";
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/pdf-01-BID.html`, renderExecBriefDocV5(BID));
writeFileSync(`${OUT}/pdf-06-INCOMPLETE.html`, renderExecBriefDocV5(INCOMPLETE));
writeFileSync(`${OUT}/pdf-07-OUT-OF-SCOPE.html`, renderExecBriefDocV5(OUT_OF_SCOPE));

console.log(`\nTier5 Executive Brief PDF port (Phase 3): ${pass}/${pass + fails.length} PASS`);
console.log(`→ samples written: ${OUT}/pdf-01-BID.html · pdf-06-INCOMPLETE.html · pdf-07-OUT-OF-SCOPE.html (open to eyeball; print to PDF for the real artifact)`);
if (fails.length) { console.error("FAILS:\n" + fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
