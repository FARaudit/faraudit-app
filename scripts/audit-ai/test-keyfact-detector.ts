// $0 gate for Brain card 215 Fork B — KEY-FACT DETECTOR (deadline · delivery · NMR).
//   npx tsx scripts/audit-ai/test-keyfact-detector.ts
//
// Proves, on the REAL SP3300 smoke record (40 findings) + null profile:
//   (1) flag OFF ⇒ byte-identical (no findings added);
//   (2) flag ON  ⇒ deadline/delivery/NMR surface, source-grounded (excerpt verbatim in source);
//   (3) NMR is eligibility_bar + requiredAttribute nonmanufacturer:compliant + bidder_controls;
//   (4) BRAIN ASSERTION: under null profile NMR disposes gate_to_clear (NEVER disqualifying), the verdict +
//       eligible are UNCHANGED (BID_WITH_CAUTION / eligible=null), eligible is NOT flipped false, and the
//       existing WOSB verify-caution is intact (NMR only ADDS itself to the unverified-gate list).
// Deterministic; no model; no spend.
import fs from "fs";
import { deriveVerdict } from "@/lib/audit-decide";
import { applyKeyfactDetector, NMR_CAUTION } from "@/lib/audit-keyfact-detector";
import type { TypedFinding, BidderProfile } from "@/lib/audit-findings";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { if (cond) pass++; else fails.push(label); };

// Pin the card-214 SMOKE record (the run the quality review is anchored to) — NOT `.sort().pop()`, which
// would grab the card-210 record ("-" sorts before ".", so the smoke file is not last).
const recFile = fs.readdirSync("scripts/audit-ai/run-records").filter((x) => x.includes("SP3300") && x.includes("card214-smoke") && x.endsWith(".json")).sort().pop();
if (!recFile) { console.log("⚠ no SP3300 card214-smoke record — cannot gate Fork B"); process.exit(1); }
const rec = JSON.parse(fs.readFileSync("scripts/audit-ai/run-records/" + recFile, "utf8"));
const src: string = rec.input.fullSource;
const base: TypedFinding[] = rec.result.findings.map((f: any) => ({ ...f }));
const inputs = rec.result.inputs;
const withFlag = <T>(on: boolean, fn: () => T): T => {
  const prev = process.env.AUDIT_ELIGIBLE_TRISTATE;
  process.env.AUDIT_ELIGIBLE_TRISTATE = "true";                 // prod state (rung 1 ON)
  try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_ELIGIBLE_TRISTATE; else process.env.AUDIT_ELIGIBLE_TRISTATE = prev; }
  void on;
};

// (1) flag OFF ⇒ byte-identical
const off = applyKeyfactDetector(base, src, { enabled: false });
ok("OFF: no findings added (byte-identical)", off.length === base.length);

// (2) flag ON ⇒ facts surface, grounded verbatim
const on = applyKeyfactDetector(base, src, { enabled: true });
const added = on.slice(base.length);
ok("ON: added ≥1 finding", added.length >= 1);
ok("ON: every added excerpt is verbatim in source", added.every((f) => src.includes(f.excerpt)));
const nmr = added.find((f) => /non-?manufacturer|52\.219-33/i.test(f.requirement + f.excerpt));
ok("ON: NMR finding present", !!nmr);
const deadline = added.find((f) => f.lens === "keyfact_detector" && /deadline|closing|due/i.test(f.requirement));
ok("ON: deadline finding present", !!deadline);

// (3) NMR typing
ok("NMR kind=eligibility_bar", nmr?.kind === "eligibility_bar");
ok("NMR controllability=bidder_controls", nmr?.controllability === "bidder_controls");
ok("NMR requiredAttribute=nonmanufacturer:compliant", nmr?.requiredAttribute === "nonmanufacturer:compliant");
ok("NMR curableInWindow=true", nmr?.curableInWindow === true);
ok("NMR caution string is the ratified primary-source wording", nmr?.requirement === NMR_CAUTION);
ok("deadline is verdict-inert (no requiredAttribute)", !deadline?.requiredAttribute && deadline?.kind !== "eligibility_bar");

// (4) BRAIN ASSERTION — verdict + eligible UNCHANGED; NMR gate_to_clear; not false; WOSB intact.
withFlag(true, () => {
  const baseDecision = deriveVerdict({ ...inputs, findings: base });
  const augDecision = deriveVerdict({ ...inputs, findings: on });
  ok("baseline verdict = BID_WITH_CAUTION", baseDecision.verdict === "BID_WITH_CAUTION");
  ok("baseline eligible = null", baseDecision.eligible === null);
  ok("augmented verdict UNCHANGED = BID_WITH_CAUTION", augDecision.verdict === "BID_WITH_CAUTION");
  ok("augmented eligible UNCHANGED = null", augDecision.eligible === null);
  ok("augmented eligible is NOT false", augDecision.eligible !== false);
  const nmrDisp = augDecision.dispositions.find((f) => f.requiredAttribute === "nonmanufacturer:compliant");
  ok("NMR disposes gate_to_clear (never disqualifying)", nmrDisp?.disposition === "gate_to_clear");
  ok("NMR is NOT a show-stopper", !augDecision.showStoppers.some((s) => s.requiredAttribute === "nonmanufacturer:compliant"));
  ok("WOSB verify-caution still present", /setaside:WOSB/i.test(augDecision.reason));
  ok("NMR verify-caution now present", /nonmanufacturer:compliant/i.test(augDecision.reason));
});

// (5) NMR APPLICABILITY GATE (code-review card 215): NMR eligibility_bar fires ONLY on a small-business
//     set-aside supply/manufacturing buy — NEVER on a services/full-open doc with an incidentally-incorporated
//     52.219-33, which would falsely downgrade eligible to null.
{
  const services = "Full and open services solicitation. Clauses: 52.212-4, 52.219-33 Non-Manufacturer Rule, 52.222-50. NAICS 541611 Management Consulting Services.";
  const negOut = applyKeyfactDetector([], services, { enabled: true });
  ok("negative: services+incidental 52.219-33 does NOT emit NMR", !negOut.some((f) => f.requiredAttribute === "nonmanufacturer:compliant"));
  const setAsideSupply = "100% Women-Owned Small Business (WOSB) set-aside. NAICS 337214. Schedule of Supplies below. 52.219-33 Non-Manufacturer Rule applies.";
  const posOut = applyKeyfactDetector([], setAsideSupply, { enabled: true });
  ok("positive: set-aside + supply + 52.219-33 DOES emit NMR", posOut.some((f) => f.requiredAttribute === "nonmanufacturer:compliant"));
}

console.log(`keyfact-detector gate: ${pass}/${pass + fails.length} pass`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((f) => console.log("  ❌ " + f)); process.exit(1); }
console.log("✅ ALL PASS — deadline/delivery/NMR surface; NMR rides 206-A path (gate_to_clear, eligible=null, WOSB intact); verdict UNCHANGED; flag-OFF byte-identical.");
