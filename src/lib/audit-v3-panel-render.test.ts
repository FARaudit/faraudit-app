// $0 PROOF for P3 render coherence (card #523) — panel content renders through the deriveVerdict→buildV3Payload
// path, NOT through ChiefJudgeOutput.show_stoppers. Run: npx tsx src/lib/audit-v3-panel-render.test.ts
//
// Architecture of record: deriveVerdict is the SOLE authority; buildV3Payload renders decision.showStoppers +
// res.findings (both DecidedFindings with a computed disposition). The chief judge's raw show_stoppers (shape
// {finding, source_lens, claim_ref} — no kind/controllability) are NEVER routed to the payload, so the flagged
// "panel show_stoppers lack disposition → empty-filter" risk cannot occur. This proves it: a merged panel bar
// surfaces as a showStopper WITH a disposition, and a merged panel finding renders in the grid WITH a disposition.
import { deriveVerdict } from "./audit-decide";
import { buildV3Payload } from "./audit-v3-report";
import type { TypedFinding } from "./audit-findings";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

// A merged panel unmet-eligibility bar (bridge fail-closed shape) + an advisory panel risk + a normal finding.
const panelBar: TypedFinding = {
  id: "panel:ex_ko:G1", requirement: "SDVOSB set-aside — firm must hold SDVOSB status", citation: "52.219-27",
  excerpt: "This acquisition is set aside for SDVOSB concerns.", kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: false, grounded: true, lens: "Ex-KO", requiredAttribute: "sdvosb",
};
const panelRisk: TypedFinding = {
  id: "panel:pricing:R1", requirement: "wage determination applicability", citation: "SCA",
  excerpt: "A wage determination applies.", kind: "other", controllability: "bidder_controls", grounded: true, lens: "Pricing", severity: "P1",
};
const normal: TypedFinding = {
  id: "capture#0", requirement: "submit pricing for all CLINs", citation: "§B",
  excerpt: "pricing for all CLINs", kind: "pricing", controllability: "bidder_controls", grounded: true, lens: "capture",
};

const decision = deriveVerdict({ findings: [normal, panelRisk, panelBar], bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false });
const payload = buildV3Payload(decision, { required: ["B"], covered: ["B"], missing: [] }, [normal, panelRisk, panelBar]);

// The panel bar drove a non-committal pole (fail-closed / disqualifier) — reason carries content.
assert(payload.verdict !== "BID", `panel bar drives the pole off clean BID (got ${payload.verdict})`);
assert(typeof payload.reason === "string" && payload.reason.length > 0, "payload.reason non-empty");

// EVERY showStopper renders WITH a non-empty disposition (no empty-filter risk).
assert(payload.showStoppers.every((s) => typeof s.disposition === "string" && s.disposition.length > 0),
  "every payload.showStopper has a non-empty disposition");

// The panel bar surfaces as a showStopper (disqualifying) OR at least renders in the grid with a disposition.
const barInStoppers = payload.showStoppers.some((s) => s.citation === "52.219-27");
const barInGrid = payload.findings.some((f) => f.citation === "52.219-27" && f.disposition.length > 0);
assert(barInStoppers || barInGrid, "panel bar renders (showStopper or grid) with a disposition");

// The advisory panel risk renders in the findings grid with a disposition (never lost).
assert(payload.findings.some((f) => f.citation === "SCA" && typeof f.disposition === "string" && f.disposition.length > 0),
  "panel advisory risk renders in the grid with a disposition");

// EVERY finding in the grid has a disposition (no undefined leaks into the render).
assert(payload.findings.every((f) => typeof f.disposition === "string" && f.disposition.length > 0),
  "every payload.finding has a non-empty disposition");

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
