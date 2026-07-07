// Phase-2 render smoke test for the v5 web report port.
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/verify-tier5-web.ts
//
// Drives the PORTED renderer (renderRichWebV5) on two poles and asserts the doctrine
// that Phase 2 must preserve — especially the F3 consolidation (scorecardTiles): on a
// committal pole "None"/counts; on a noVerdict pole both risk tiles "Not determined".
// Also writes openable HTML samples (body + REPORT_V5_CSS) for the Design QA look.

import { writeFileSync, mkdirSync } from "node:fs";
import { renderRichWebV5, reasoningSteps, REACHED_INTRO } from "@/lib/v5-report/render";
import { REPORT_V5_CSS } from "@/lib/v5-report/styles";
import { FONTS_CSS } from "@/lib/v5-report/fonts";
import type { V4Data } from "@/lib/v4-report/render";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { cond ? pass++ : fails.push(label); };

const BID: V4Data = {
  shell: { auditId: "aud-bid-1" },
  masthead: { docType: "RFP", solicitation: "FA860126Q0026", title: "Base Operations Support Services", facts: [{ k: "Agency", v: "USAF" }, { k: "NAICS", v: "561210", sub: "Facilities Support" }] },
  verdict: { pole: "BID", band: "Bid", tone: "go", eligible: true, rationale: "The record is complete, no blocking defect or verified disqualification is present, and the two gates are routine and clearable within the response window." },
  coverage: { state: "COMPLETE", lead: "All documents read.", read: 4, indexed: 0, total: 4, core: [{ k: "C", ok: true }, { k: "L", ok: true }, { k: "M", ok: true }] },
  findings: { p0: [], p1: [{ req: "Submit a Certificate of Conformance with the offer.", cite: "§L", driver: true }, { req: "Register in SAM before award.", cite: "§K" }], p2: [{ req: "Standard telecom prohibition flows down.", cite: "52.204-25" }] },
  submissionL: { grounded: true, rows: [{ vol: "I", req: "Technical — approach narrative", condition: "≤20 pages", cite: "§L" }] },
  evalM: { grounded: true, basis: "Lowest-Priced Technically Acceptable — LPTA", factors: [{ name: "Factor 1 — Technical", basis: "Pass/fail acceptability", cite: "§M" }] },
  clins: { grounded: false },
  dates: [{ label: "Offers due", value: "30 Sep 2026 · 2:00 PM CT", kind: "gate" }],
  provenance: { auditDate: "06 Jul 2026 · 14:22", engine: "agentic_v3", manifest: [{ name: "Solicitation.pdf", read: "full" }] },
};

const INCOMPLETE: V4Data = {
  ...BID,
  shell: { auditId: "aud-inc-1" },
  verdict: { pole: "INCOMPLETE", band: "Incomplete", tone: "slate", noVerdict: true, noCharge: true, eligible: null, rationale: "Only 2 of 4 documents could be read; a partial read cannot certify what it did not see, so no verdict is issued." },
  coverage: { state: "INCOMPLETE", lead: "Partial read.", read: 2, indexed: 0, total: 4, core: [] },
  findings: { p0: [], p1: [], p2: [] },
};

// ── F3 (scorecardTiles) — the consolidated derivation, rendered in the header ──
const bidHtml = renderRichWebV5(BID).html;
const incHtml = renderRichWebV5(INCOMPLETE).html;

ok("T5 R1: BID (committal) → Show-stoppers tile reads 'None' (not 'Not determined')", /ct-v">None<\/div><div class="ct-k">Show-stoppers/.test(bidHtml));
ok("T5 R2: INCOMPLETE (noVerdict) → Show-stoppers tile reads 'Not determined'", /ct-v">Not determined<\/div><div class="ct-k">Show-stoppers/.test(incHtml));
ok("T5 R3: INCOMPLETE → Gates tile ALSO 'Not determined' (both risk tiles, F3)", /ct-v">Not determined<\/div><div class="ct-k">Gates to clear/.test(incHtml));
ok("T5 R4: BID → Gates tile shows the count '2'", /ct-v">2<\/div><div class="ct-k">Gates to clear/.test(bidHtml));

// ── doctrine invariants ──
ok("T5 R5: rationale renders VERBATIM in the bottom line", bidHtml.includes(BID.verdict.rationale) && incHtml.includes(INCOMPLETE.verdict.rationale));
ok("T5 R6: verdict word = band verbatim", /cmd-word">Bid</.test(bidHtml) && /cmd-word">Incomplete</.test(incHtml));
ok("T5 R7: No-charge chip shows on the noCharge honest-fail", /cmd-nocharge">No charge/.test(incHtml) && !/cmd-nocharge/.test(bidHtml));
ok("T5 R8: eligibility is top-line only (chip present on BID, suppressed value on INCOMPLETE=Not determined)",
  /cmd-elig ok/.test(bidHtml) && /cmd-elig nd/.test(incHtml));
ok("T5 R9: reasoning chain present + intro exported verbatim", bidHtml.includes("How this call was reached") && bidHtml.includes(REACHED_INTRO.slice(0, 40)));
ok("T5 R10: 'no score/no tally' foot survives on §M", /No weights, no total, no score/.test(bidHtml));

// ── reasoning chain shape ──
const bidSteps = reasoningSteps(BID), incSteps = reasoningSteps(INCOMPLETE);
ok("T5 R11: BID chain walks coverage→blocking→drivers→eligibility→verdict (≥5 steps, ends on verdict)",
  bidSteps.length >= 5 && bidSteps[bidSteps.length - 1].verdict === true && bidSteps[bidSteps.length - 1].outcome === "Bid");
ok("T5 R12: INCOMPLETE chain is terminal at coverage (step 01 Incomplete → skip → verdict)",
  incSteps[0].outcome === "Incomplete" && incSteps.some((s) => s.skip) && incSteps[incSteps.length - 1].verdict === true);
ok("T5 R13: step-01 renders the 'complete record' clause when read==total (BID) and the partial clause otherwise",
  /the decision rests on the complete record/.test(bidSteps[0].detail) && /partial read cannot certify/.test(incSteps[0].detail));

// ── write openable samples for Design QA ──
const OUT = "ceo/redesign-final/Review/V5-PORT-render-samples";
mkdirSync(OUT, { recursive: true });
// Mirror the PRODUCTION shell structure so the .app grid (236px sidebar + 1fr main)
// places .main in the correct column — a sample without the sidebar collapses main
// into the 236px track (the earlier broken-narrow render was this wrapper bug, not
// the renderer). rail present so .stage's 1fr+224px also resolves.
const wrap = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>v5 port · ${title}</title><style>${FONTS_CSS}</style><style>${REPORT_V5_CSS}</style></head><body><div class="app"><aside class="sidebar"><div class="sb-brand"><span class="dot">◆</span> FARaudit</div></aside><div class="main"><header class="topbar"><div class="tb-crumb"><span>Past audits</span><span class="sep">/</span><span class="cur">sample</span></div><span class="tb-live">Live web view</span></header><div class="stage"><article class="report anim" id="report">${body}</article><nav class="rail" id="rail" aria-label="On this page"></nav></div></div></div></body></html>`;
writeFileSync(`${OUT}/01-BID.html`, wrap("BID", bidHtml));
writeFileSync(`${OUT}/06-INCOMPLETE.html`, wrap("INCOMPLETE", incHtml));

console.log(`\nTier5 web port (Phase 2): ${pass}/${pass + fails.length} PASS`);
console.log(`→ samples written: ${OUT}/01-BID.html · 06-INCOMPLETE.html (open to eyeball; full chrome ships via renderV5ReportFromRow behind AUDIT_REPORT_V5)`);
if (fails.length) { console.error("FAILS:\n" + fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
