// $0 proof for the logical-show-stopper dedup (Brain card-53). Positive: REPLAY over #3's captured findings
// → 3 Dillon rows collapse to 1 logical bar (3 citations), INELIGIBLE unchanged. Negative (load-bearing):
// two genuinely DISTINCT bars do NOT collapse. No paid re-run — pure post-processing over saved output.
import { readFileSync, existsSync } from "node:fs";
import { logicalShowStoppers, logicalShowStopperCount, type DecidedFinding } from "@/lib/audit-decide";

let pass = 0; const fails: string[] = [];
const ok = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`${l}: ${JSON.stringify(g)} != ${JSON.stringify(e)}`); };
const F = (o: Partial<DecidedFinding>): DecidedFinding => ({ requirement: "r", citation: "x", excerpt: "", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "x", disposition: "disqualifying", ...o } as DecidedFinding);

// ── POSITIVE: replay over #3's real dump (if present) ──
const dump = "ceo/proofs/v3-SPRDL125Q0030-result.json";
if (existsSync(dump)) {
  const d = JSON.parse(readFileSync(dump, "utf8"));
  const ss = (d.decision.showStoppers as DecidedFinding[]);
  const logical = logicalShowStoppers(ss);
  ok("#3 replay: 3 Dillon rows → 1 logical bar", logical.length, 1);
  ok("#3 replay: the 1 bar retains all 3 citations", logical[0]?.citations.length, ss.length);
  ok("#3 replay: shares the DGMT1002 object id", logical[0]?.objectIds.includes("dgmt1002"), true);
} else {
  console.log("(note: #3 dump not present — skipping live replay; synthetic positive below)");
  const dillon = [
    F({ requirement: "C.14 source-controlled", requiredAttribute: "interchangeable-with-DGMT1002" }),
    F({ requirement: "CLIN-0001AA Dillon", requiredAttribute: "OEM:Dillon CAGE 1PN61 PN DGMT1002" }),
    F({ requirement: "L.6c restriction", requiredAttribute: "oem_or_approved_source:Dillon_DGMT1002" }),
  ];
  ok("synthetic: 3 Dillon rows → 1 logical bar", logicalShowStopperCount(dillon), 1);
}

// ── NEGATIVE (load-bearing): two genuinely distinct bars must NOT collapse ──
const distinct = [
  F({ requirement: "sole-source Dillon", requiredAttribute: "oem:Dillon PN DGMT1002" }),
  F({ requirement: "sole-source Acme widget", requiredAttribute: "oem:Acme PN XYZ9999" }),
];
ok("negative: two distinct named-part bars stay 2 (no false collapse)", logicalShowStopperCount(distinct), 2);

// shared section cite + the bare word 'OEM' must NOT merge distinct bars (the OR we dropped)
const coincidental = [
  F({ requirement: "bar A", citation: "§L", requiredAttribute: "oem-approved-source" }),
  F({ requirement: "bar B", citation: "§L", requiredAttribute: "oem-approved-source" }),
];
ok("negative: same section + 'oem' token, no distinctive object id → stay separate (when in doubt, don't merge)", logicalShowStopperCount(coincidental), 2);

// same object id but DIFFERENT controllability (decision type) → do NOT merge
const diffCtrl = [
  F({ requirement: "Dillon profile bar", controllability: "bidder_cannot_move", requiredAttribute: "PN DGMT1002" }),
  F({ requirement: "Dillon universal", controllability: "no_one_can_move", requiredAttribute: "PN DGMT1002" }),
];
ok("negative: same object, different controllability → stay 2", logicalShowStopperCount(diffCtrl), 2);

// same object id + same controllability → merge to 1
ok("positive: same object + same controllability → 1", logicalShowStopperCount([
  F({ requirement: "a", requiredAttribute: "PN DGMT1002" }), F({ requirement: "b", requiredAttribute: "part DGMT1002 listing" }),
]), 1);

console.log(`showstopper-dedup gate: ${pass}/${pass + fails.length} pass`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((x) => console.log("  ❌ " + x)); process.exit(1); }
console.log("✅ ALL PASS — same-restriction merge collapses #3's 3 Dillon rows → 1 logical bar (3 citations); distinct bars never collapse (over-fire signal preserved).");
