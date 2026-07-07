// Phase-4 render smoke test for the v5 Gate Deck (PDF) port.
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/verify-tier5-deck.ts
//
// Drives the PORTED deck renderer (renderGateDeckBodyV5 / renderGateDeckDocV5) on
// three poles and asserts the doctrine Phase 4 must preserve:
//   · F3 (scorecardTiles) quad — committal "None"/counts; noVerdict "Not determined"
//     (SHARED core.ts derivation, identical to the web view + Executive Brief).
//   · reasoning flow single-sourced from render.ts (reasoningSteps / REACHED_INTRO).
//   · verbatim rationale; ABSENCE RULE by whole-slide omission (drivers/gates on a
//     noVerdict pole; §M/§L on an ungrounded pole); no-charge chip; eligibility
//     top-line + OUT_OF_SCOPE §5 suppression; @page landscape 1-slide/page print.
// Also writes openable full-deck HTML samples for the Design Gate-2 QA look.

import { writeFileSync, mkdirSync } from "node:fs";
import { renderGateDeckBodyV5, renderGateDeckDocV5 } from "@/lib/v5-report/render-deck";
import { REACHED_INTRO } from "@/lib/v5-report/render";
import type { V4Data } from "@/lib/v4-report/render";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { cond ? pass++ : fails.push(label); };
const count = (s: string, re: RegExp) => (s.match(re) || []).length;

const BID: V4Data = {
  shell: { auditId: "aud-bid-1" },
  masthead: { docType: "RFP", solicitation: "FA860126Q0026", title: "Base Operations Support Services", facts: [{ k: "Agency", v: "USAF" }, { k: "NAICS", v: "561210", sub: "Facilities Support", mono: true }] },
  verdict: { pole: "BID", band: "Bid", tone: "go", eligible: true, rationale: "The record is complete, no blocking defect or verified disqualification is present, and the two gates are routine and clearable within the response window." },
  coverage: { state: "COMPLETE", lead: "All documents read.", read: 4, indexed: 0, total: 4, core: [{ k: "C", ok: true }, { k: "L", ok: true }, { k: "M", ok: true }] },
  findings: { p0: [], p1: [{ req: "Submit a Certificate of Conformance with the offer.", cite: "§L", curability: "the CoC is attached to the offer.", driver: true }, { req: "Register in SAM before award.", cite: "§K" }], p2: [{ req: "Standard telecom prohibition flows down.", cite: "52.204-25" }] },
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

const bid = renderGateDeckBodyV5(BID);
const inc = renderGateDeckBodyV5(INCOMPLETE);
const oos = renderGateDeckBodyV5(OUT_OF_SCOPE);
const bidDoc = renderGateDeckDocV5(BID);

// ── F3 (scorecardTiles) — the consolidated quad, identical to web + brief ──
ok("D4 R1: BID → scorecard Show-stoppers reads 'None' (not 'Not determined')", /qd-v">None<\/div><div class="qd-k">Show-stoppers/.test(bid));
ok("D4 R2: INCOMPLETE → scorecard Show-stoppers 'Not determined' (textv)", /qd-v textv">Not determined<\/div><div class="qd-k">Show-stoppers/.test(inc));
ok("D4 R3: INCOMPLETE → scorecard Gates ALSO 'Not determined'", /qd-v textv">Not determined<\/div><div class="qd-k">Gates to clear/.test(inc));
ok("D4 R4: BID → scorecard Gates shows the count '2'", /qd-v">2<\/div><div class="qd-k">Gates to clear/.test(bid));

// ── doctrine invariants ──
ok("D4 R5: rationale renders VERBATIM in the decision bottom line", bid.includes(BID.verdict.rationale) && inc.includes(INCOMPLETE.verdict.rationale));
ok("D4 R6: verdict word = band on cover console AND decision hero", /cvc-word" data-tone="go">Bid</.test(bid) && /vd-word">Bid</.test(bid) && /vd-word">Incomplete</.test(inc));
ok("D4 R7: No-charge chip on the noCharge honest-fail only", /nocharge">No charge/.test(inc) && !/nocharge">No charge/.test(bid));
ok("D4 R8: eligibility chip top-line on BID (cover console + decision)", /cvc-elig" data-e="ok"/.test(bid) && /vd-chip elig" data-e="ok"/.test(bid));
ok("D4 R9: eyebrow SHARED (Gate decision on BID · no-verdict wording on INCOMPLETE)",
  /eb-dot"><\/span>Gate decision</.test(bid) && /No verdict — coverage incomplete/.test(inc));
ok("D4 R10: reasoning flow present + intro VERBATIM", bid.includes("How this call was reached") && bid.includes(REACHED_INTRO.slice(0, 40)) && /class="flow"/.test(bid));
ok("D4 R11: §M win-note no-score survives ('No weights, points, or numeric score')", /No weights, points, or numeric score/.test(bid));

// ── reasoning flow shape (SHARED render.ts) ──
ok("D4 R12: BID flow has ≥5 nodes and a filled verdict node (✓ · outcome 'Bid')",
  count(bid, /class="fn/g) >= 5 && /fn filled/.test(bid) && /fn-dot">✓</.test(bid) && /fn-out">Bid</.test(bid));
ok("D4 R13: INCOMPLETE flow is terminal at coverage (skip node '·' + verdict 'Incomplete')",
  /fn skip/.test(inc) && /fn-dot">·</.test(inc) && /fn-out">Incomplete</.test(inc));

// ── absence rule by WHOLE-SLIDE omission (§2) ──
ok("D4 R14: drivers + gates slides render on BID, OMITTED on noVerdict INCOMPLETE",
  bid.includes("what drives this call") && bid.includes("What must be true to win")
  && !inc.includes("what drives this call") && !inc.includes("What must be true to win"));
ok("D4 R15: §M + §L slides render on BID, OMITTED on ungrounded OUT_OF_SCOPE",
  bid.includes("How we win") && bid.includes("What it takes to respond")
  && !oos.includes("How we win") && !oos.includes("What it takes to respond"));

// ── OUT_OF_SCOPE — §5 eligibility suppression + advisory tile ──
ok("D4 R16: OUT_OF_SCOPE suppresses the eligibility chip (cover + decision)", !/cvc-elig" data-e/.test(oos) && !/vd-chip elig/.test(oos));
ok("D4 R17: OUT_OF_SCOPE scorecard 4th tile is 'Advisories'", /qd-k">Advisories<\/div>/.test(oos));

// ── slide counts (absence rule, quantified) ──
ok("D4 R18: slide counts — BID 9 · INCOMPLETE 7 · OUT_OF_SCOPE 5",
  count(bid, /<section class="sl"/g) === 9 && count(inc, /<section class="sl"/g) === 7 && count(oos, /<section class="sl"/g) === 5);

// ── watermark is rep-aware (brand mark in prod, REVIEW mark on the mock fixture) ──
const repVariant = renderGateDeckBodyV5({ ...BID, rep: true } as V4Data & { rep: boolean });
ok("D4 R19: watermark — prod shows brand 'FARAUDIT'; rep fixture shows 'REVIEW — NOT FOR DISTRIBUTION'",
  bid.includes(">FARAUDIT<") && repVariant.includes("REVIEW — NOT FOR DISTRIBUTION"));

// ── standalone deck host — @page landscape, 1 slide/page, .scrollmode light-DOM ──
ok("D4 R20: full deck inlines .scrollmode + @page 1280×720 + break-after:page",
  /class="scrollmode"/.test(bidDoc) && /@page\{ size:1280px 720px/.test(bidDoc) && /break-after:page/.test(bidDoc));

// ── write openable full-deck samples for Design Gate-2 QA ──
const OUT = "ceo/redesign-final/Review/V5-PORT-render-samples";
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/deck-01-BID.html`, renderGateDeckDocV5(BID));
writeFileSync(`${OUT}/deck-06-INCOMPLETE.html`, renderGateDeckDocV5(INCOMPLETE));
writeFileSync(`${OUT}/deck-07-OUT-OF-SCOPE.html`, renderGateDeckDocV5(OUT_OF_SCOPE));

console.log(`\nTier5 Gate Deck PDF port (Phase 4): ${pass}/${pass + fails.length} PASS`);
console.log(`→ samples written: ${OUT}/deck-01-BID.html · deck-06-INCOMPLETE.html · deck-07-OUT-OF-SCOPE.html (open to eyeball; browser Print → 1 slide/landscape page)`);
if (fails.length) { console.error("FAILS:\n" + fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
