// $0 test for Step 10 (AUDIT_GATE_FRAMING) — the v3 gate-framing port (Design card 126-R).
// Run: npx tsx src/lib/audit-gate-framing.test.ts
//
// PART A (pure, injected flag): verdictPres flag-OFF byte-identical · flag-ON preserves the color moat
//   (word/cls/kind) and only reframes eyebrow/sub.
// PART B (full render, Design's widened negative test): set AUDIT_GATE_FRAMING=true and renderV3Report every
//   verdict state, asserting the FULL output (eyebrow+sub+word+reason+notes) carries no advice verb; the
//   satisfied group is neutral under an unverified profile and green only when profileVerified===true; and
//   INELIGIBLE renders only with profileVerified===true (else it degrades to the honest NHR band).
import { verdictPres, gateFramingPres, renderV3Report, type V3ReportPayload, type V3ReportMeta, type FindingLite } from "./audit-v3-report";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

// ─────────────────────────── PART A · verdictPres (pure) ───────────────────────────
const A_STATES = ["BID", "BID_WITH_CAUTION", "NO_BID", "INELIGIBLE", "NEEDS_HUMAN_REVIEW", "INCOMPLETE", "SOMETHING_ELSE"];
const BASELINE: Record<string, { word: string; cls: string; kind: string; eyebrow: string; sub: string }> = {
  BID:                { word: "BID",                cls: "v-bid",     kind: "decision",   eyebrow: "Recommendation",                  sub: "Clean fit — submit." },
  BID_WITH_CAUTION:   { word: "BID — WITH CAUTION", cls: "v-caution", kind: "decision",   eyebrow: "Recommendation",                  sub: "Biddable once the gates below are cleared." },
  NO_BID:             { word: "NO-BID",             cls: "v-stop",    kind: "decision",   eyebrow: "Recommendation",                  sub: "Do not bid — an unwinnable requirement is present." },
  INELIGIBLE:         { word: "INELIGIBLE",         cls: "v-stop",    kind: "decision",   eyebrow: "Recommendation",                  sub: "A structural eligibility bar blocks an award." },
  NEEDS_HUMAN_REVIEW: { word: "NEEDS HUMAN REVIEW", cls: "v-slate",   kind: "unresolved", eyebrow: "No verdict reached",              sub: "No verdict reached — the basis is below; a person must make the call." },
  INCOMPLETE:         { word: "INCOMPLETE",         cls: "v-slate",   kind: "unresolved", eyebrow: "Assessment incomplete · no charge", sub: "We could not read all of the binding content — so we did not issue a verdict, and did not charge for this audit." },
  SOMETHING_ELSE:     { word: "SOMETHING_ELSE",     cls: "v-slate",   kind: "unresolved", eyebrow: "No verdict reached",              sub: "" },
};
console.log("── A1 · FLAG OFF: verdictPres byte-identical (moat untouched) ──");
for (const v of A_STATES) {
  const p = verdictPres(v, false), b = BASELINE[v];
  assert(p.word === b.word && p.cls === b.cls && p.kind === b.kind && p.eyebrow === b.eyebrow && p.sub === b.sub, `${v} OFF → byte-identical`);
}
console.log("── A2 · FLAG ON: word/cls/kind preserved, eyebrow/sub reframe to gate language ──");
for (const v of A_STATES) {
  const on = verdictPres(v, true), b = BASELINE[v];
  assert(on.word === b.word && on.cls === b.cls && on.kind === b.kind, `${v} ON → word/cls/kind unchanged`);
  assert(on.eyebrow === gateFramingPres(v).eyebrow, `${v} ON routes to gateFramingPres`);
}

// ─────────────────────────── PART B · full render (Design negative test) ───────────────────────────
const ADVICE = /\b(submit|recommend|proceed|decline|avoid|pursue|pursuing)\b|do not bid/i;
const met: FindingLite = { requirement: "Small-business size standard for NAICS 541330", citation: "§B", disposition: "met", note: "NAICS 541330 size standard set for this solicitation." };
const meta: V3ReportMeta = { solicitationNumber: "TESTSOL-001", title: "Test", agency: "GSA", naicsCode: "541330", setAside: "SDVOSB Set-Aside", responseDeadline: "2026-07-15", auditId: "aud-1" };
const payload = (verdict: string, profileVerified?: boolean): V3ReportPayload => ({
  verdict, eligible: null, reason: "Basis paragraph for the <b>gate</b> assessment.",
  showStoppers: verdict === "NO_BID" || verdict === "INELIGIBLE" ? [{ requirement: "A closing condition", citation: "§M", disposition: "disqualifying" }] : [],
  findings: [met, { requirement: "Register in SAM before award", citation: "§L", disposition: "gate_to_clear", note: "Clearable by the bidder before the deadline." }],
  coverage: { required: ["B", "C", "L", "M"], covered: ["B", "C", "L", "M"], missing: [] },
  ...(profileVerified !== undefined ? { profileVerified } : {}),
});

const ALL7 = ["BID", "BID_WITH_CAUTION", "NO_BID", "INELIGIBLE", "NEEDS_HUMAN_REVIEW", "INCOMPLETE", "OUT_OF_SCOPE"];
// Scope assertions to the rendered BODY (after </head>) so the <style> block — which legitimately contains
// the .fg-neutral class def and `break-inside:avoid` — never trips the advice/class checks.
const bodyOf = (html: string) => (html.split("</head>")[1] ?? html).replace(/← Back to audits|Print \/ PDF/g, "");
const prev = process.env.AUDIT_GATE_FRAMING;
process.env.AUDIT_GATE_FRAMING = "true";   // flag ON for the full-render assertions
try {
  console.log("── B1 · flag ON: no advice verb anywhere in the full rendered body (all 7 states) ──");
  for (const v of ALL7) {
    const body = bodyOf(renderV3Report(payload(v, v === "INELIGIBLE" ? true : undefined), meta));
    assert(!ADVICE.test(body), `${v} ON → full render has no advice verb`);
    assert(body.includes("Gate Assessment"), `${v} ON → header reads "Gate Assessment"`);
  }

  console.log("── B2 · satisfied group: neutral under unverified profile, green only when profileVerified===true ──");
  const unver = bodyOf(renderV3Report(payload("BID", undefined), meta));
  assert(unver.includes('class="fgroup fg-neutral"') && unver.includes("Checked — solicitation facts only") && !unver.includes('class="fgroup fg-ok"'), "unverified profile → neutral satisfied group (fg-neutral)");
  const ver = bodyOf(renderV3Report(payload("BID", true), meta));
  assert(ver.includes('class="fgroup fg-ok"') && ver.includes("Already satisfied") && !ver.includes('class="fgroup fg-neutral"'), "verified profile → green satisfied group (fg-ok)");

  console.log("── B3 · INELIGIBLE renders only with profileVerified===true (else degrades to NHR band) ──");
  const ineUnver = bodyOf(renderV3Report(payload("INELIGIBLE", undefined), meta));
  assert(ineUnver.includes("NEEDS HUMAN REVIEW") && !ineUnver.includes("INELIGIBLE"), "INELIGIBLE + unverified → degrades to NEEDS HUMAN REVIEW band");
  const ineVer = bodyOf(renderV3Report(payload("INELIGIBLE", true), meta));
  assert(ineVer.includes("INELIGIBLE") && ineVer.includes("Eligibility gate"), "INELIGIBLE + verified → renders the INELIGIBLE gate band");

  console.log("── B4 · flag OFF: full render is the current memo (header 'Go / No-Go', 'Already satisfied') ──");
  process.env.AUDIT_GATE_FRAMING = "false";
  const off = bodyOf(renderV3Report(payload("BID", undefined), meta));
  assert(off.includes("Go / No-Go Assessment") && off.includes("Already satisfied") && !off.includes('class="fgroup fg-neutral"') && !off.includes("Gate Assessment"), "flag OFF → current memo, byte-class identical");

  console.log("── B5 · flag-gated CSS: OFF stylesheet carries NO gate-framing CSS (byte-identical base); ON appends it ──");
  process.env.AUDIT_GATE_FRAMING = "false";
  const offFull = renderV3Report(payload("BID", undefined), meta);
  process.env.AUDIT_GATE_FRAMING = "true";
  const onFull = renderV3Report(payload("BID", undefined), meta);
  assert(!offFull.includes(".fg-neutral") && onFull.includes(".fg-neutral"), "GATE_FRAMING_CSS appended ONLY when flag ON (OFF stylesheet unchanged from base port)");
} finally {
  if (prev === undefined) delete process.env.AUDIT_GATE_FRAMING; else process.env.AUDIT_GATE_FRAMING = prev;
}

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`} — Step 10 v3 gate-framing port.`);
process.exit(failures === 0 ? 0 : 1);
