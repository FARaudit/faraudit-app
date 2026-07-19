/* CERT card #574 — FABRICATION INVARIANT (Option B by-construction) asymmetric acceptance proof.
 * Brain ruling: REAL MATERIAL ONLY in the acceptance chain (no-synthetic hard stop, Rule 64).
 *   SUPPRESSION arm — real ungrounded bar-class findings loaded VERBATIM from banked run-records
 *     (anchor = Goodfellow FA303026Q0020 chapel §M pair). Flag ON: the "lead time exceeds the response
 *     window" mechanic MUST be stripped; the arc-proof shows the legacy path still fabricates it.
 *   PRESERVATION arm — real grounded mechanics quoted VERBATIM from banked solicitation SOURCES
 *     (697DCK long-lead, 70B01C clearance-at-inception + clearance-30-day, W9126G CMMC, FA813726 long-lead
 *     items). Flag ON: the mechanic MUST emit UNCHANGED (byte-identical to legacy) — any stripping = regression.
 *   FLAG-OFF byte-identity — the refactor reproduces the exact pre-#574 legacy strings.
 *   A-ORACLE (dev/test only) — a blocklist-as-TEST-ASSERTION: any emitted reason carrying the mechanic literal
 *     MUST have a grounded basis. This is the Option-A oracle Brain confined to tests; it is NEVER prod enforcement.
 * Run: npx tsx scripts/audit-ai/_cert-card574-invariant.ts
 */
import { deriveVerdict } from "../../src/lib/audit-decide";
import { hasGroundedLeadTimeBasis } from "../../src/lib/mm-evidence-factor";
import type { TypedFinding, VerdictInputs } from "../../src/lib/audit-findings";
import fs from "fs";
import path from "path";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { (c ? pass++ : fail++); console.log(`${c ? "PASS" : "FAIL"}  ${m}`); };

const FAB = /lead time exceeds the response window/i;
const DIR = "scripts/audit-ai/run-records";
const vi = (findings: TypedFinding[]): VerdictInputs => ({ findings, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false });
const run = (on: boolean, mm: boolean, findings: TypedFinding[]) => {
  process.env.AUDIT_FABRICATION_INVARIANT = on ? "true" : "false";
  process.env.AUDIT_MM_EVIDENCE_FACTOR_DEMOTION = mm ? "true" : "false";
  return deriveVerdict(vi(findings));
};
// route into branch 5b: null profile + non-curable + requiredAttribute present (else 5a untyped) + not NMR
const reaches5b = (r: { reason: string }) => /^(Non-curable bar\(s\)|Structural bar\(s\) the firm may be unable)/.test(r.reason);

// ---- SUPPRESSION arm: load real ungrounded non-curable bars from banked records --------------------------------
const findFindingArrays = (o: any, acc: any[][] = []): any[][] => {
  if (Array.isArray(o)) { if (o.length && o[0] && typeof o[0] === "object" && "requirement" in o[0]) acc.push(o); o.forEach((v) => findFindingArrays(v, acc)); }
  else if (o && typeof o === "object") for (const k of Object.keys(o)) findFindingArrays(o[k], acc);
  return acc;
};
const realBars: TypedFinding[] = [];
const seen = new Set<string>();
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".run-record.json"))) {
  const rec = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
  for (const arr of findFindingArrays(rec)) for (const f of arr) {
    if (f?.controllability !== "bidder_cannot_move" || f?.curableInWindow !== false || f?.nmrGuard === true) continue;
    if (!f?.requiredAttribute) continue;                       // must be typed to reach 5b (not 5a)
    if (hasGroundedLeadTimeBasis([{ requirement: f.requirement, excerpt: f.excerpt }])) continue; // ungrounded only
    const key = String(f.requirement); if (seen.has(key)) continue; seen.add(key);
    realBars.push(f as TypedFinding);
  }
}
console.log(`\n===== SUPPRESSION ARM — ${realBars.length} real ungrounded non-curable bars from banked records =====`);
let suppressionTested = 0;
for (const f of realBars) {
  const on = run(true, false, [f]);
  if (!reaches5b(on)) continue;                                 // only assert on specimens that reach branch 5b
  suppressionTested++;
  const off = run(false, false, [f]);                           // legacy path (mmDemote off) — arc reference
  const tag = `[${(f.requirement || "").slice(0, 60)}…]`;
  ok(!FAB.test(on.reason), `FLAG ON strips fabrication ${tag}`);
  ok(FAB.test(off.reason), `arc: legacy path STILL fabricates (proves the fix removes it) ${tag}`);
}
ok(suppressionTested >= 2, `suppression specimens reaching branch 5b: ${suppressionTested} (anchor chapel + others)`);

// ---- PRESERVATION arm: real grounded mechanics quoted verbatim from banked solicitation SOURCES ---------------
// Each `requirement` is a VERBATIM sentence from the named real solicitation source (provenance in the label).
const grounded: Array<{ prov: string; text: string }> = [
  { prov: "697DCK-26-R-00186 source", text: "Note: there are components with long lead-times and delivery schedules of 26-52 weeks after receipt of order." },
  { prov: "70B01C26R00000096 source", text: "For contracts requiring Contractor Employees to possess a security clearance upon contract inception, the clearance must be in place at award." },
  { prov: "70B01C26R00000096 source", text: "requirements for its employees at least fifteen (15) days, or thirty (30) days if a security clearance is to be obtained." },
  { prov: "W9126G26RA087 source", text: "The Cybersecurity Maturity Model Certification (CMMC) level required by this solicitation is: This CMMC level, or higher (see 32 CFR part 170)." },
  { prov: "FA813726R0033 source", text: "Long lead items shall be provided during the pre-Final design phase in accordance with the schedule." },
];
const gFinding = (text: string): TypedFinding => ({
  id: "pres", requirement: text, excerpt: text, citation: "§L held credential", kind: "eligibility_bar",
  controllability: "bidder_cannot_move", curableInWindow: false, requiredAttribute: "held_credential", grounded: true, lens: "former_ko",
} as TypedFinding);
console.log(`\n===== PRESERVATION ARM — ${grounded.length} real grounded mechanics (verbatim from real sources) =====`);
for (const g of grounded) {
  const f = gFinding(g.text);
  ok(hasGroundedLeadTimeBasis([{ requirement: g.text, excerpt: g.text }]), `grounds-match confirms real mechanic [${g.prov}]`);
  const on = run(true, false, [f]);
  const off = run(false, false, [f]);
  ok(FAB.test(on.reason), `FLAG ON keeps grounded mechanic (no strip) [${g.prov}]`);
  ok(on.reason === off.reason, `FLAG ON grounded reason BYTE-IDENTICAL to legacy [${g.prov}]`);
}

// ---- FLAG-OFF byte-identity: refactor reproduces the exact pre-#574 legacy strings ----------------------------
const LEGACY_GROUNDED = (names: string) => `Non-curable bar(s) — lead time exceeds the response window. CONDITIONAL NO-BID: if your firm does not ALREADY hold the following and cannot obtain it before the deadline, this is a NO-BID — it cannot be cured in the window: ${names}`;
const LEGACY_UNGROUNDED = (names: string) => `Structural bar(s) the firm may be unable to satisfy within the response window. CONDITIONAL NO-BID: if your firm does not ALREADY hold the following and cannot obtain it before the deadline, this is a NO-BID: ${names}`;
console.log(`\n===== FLAG-OFF byte-identity (regression guard) =====`);
{ // grounded specimen, flag OFF → exact legacy grounded string
  const f = gFinding(grounded[0].text);
  const off = run(false, false, [f]);
  ok(off.reason === LEGACY_GROUNDED(f.requirement), "flag OFF grounded == pre-#574 legacy grounded string (byte-identical)");
}
{ // ungrounded chapel, flag OFF (mmDemote off) → legacy grounded string (the historical !mmDemote quirk preserved)
  const chapel = realBars.find((f) => /chapel/i.test(String(f.requirement)));
  if (chapel) { const off = run(false, false, [chapel]); ok(off.reason === LEGACY_GROUNDED(chapel.requirement), "flag OFF chapel (mmDemote off) == legacy grounded string — legacy behavior preserved byte-identical"); }
  else ok(false, "chapel anchor present in records");
}

// ---- A-ORACLE (dev/test only — NOT prod enforcement): mechanic literal ⇒ grounded basis ----------------------
// Blocklist-as-TEST-ASSERTION per Brain: strictly a test oracle, never a release gate, never prod code.
console.log(`\n===== A-ORACLE (dev/test only) — any emitted mechanic literal must be grounded =====`);
const oracle = (findings: TypedFinding[]) => {
  const r = run(true, false, findings);
  if (FAB.test(r.reason)) return hasGroundedLeadTimeBasis(findings.map((f) => ({ requirement: f.requirement, excerpt: f.excerpt })));
  return true; // no mechanic asserted → vacuously satisfies the invariant
};
let oracleClean = true;
for (const f of [...realBars, ...grounded.map((g) => gFinding(g.text))]) if (!oracle([f])) oracleClean = false;
ok(oracleClean, "A-oracle: NO emitted reason asserts an ungrounded mechanic (flag ON) across the full real corpus");

console.log(`\n===== RESULT =====  PASS ${pass} · FAIL ${fail}`);
process.exit(fail ? 1 : 0);
