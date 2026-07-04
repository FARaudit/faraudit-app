// $0 gate for Brain card 243 — persist `temporalEvidence` through the lite() mapper into compliance_json.v3.
//   npx tsx scripts/audit-ai/test-card243-temporal-persist.ts
//
// Additive-only contract: the parsed temporal arithmetic {gateDays, windowDays, gateExceedsWindow} carries into
// v3.findings[] WHEN PRESENT, and is OMITTED (not null-filled) when absent — no other payload field changes.

import { buildV3Payload } from "@/lib/audit-v3-report";
import type { Decision } from "@/lib/audit-decide";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { if (cond) pass++; else fails.push(label); };

const decision: Decision = { verdict: "BID_WITH_CAUTION", eligible: true, reason: "temporal caution", dispositions: [], showStoppers: [] };
const coverage = { required: ["B"], covered: ["B"], missing: [], coreMissing: [] };

// A temporal-CAUTION finding carrying the parsed evidence + a plain finding with none.
const temporal = { requirement: "FAT gate vs delivery window", citation: "§E+§F", excerpt: "90-day FAT before delivery in 30 days", kind: "technical_spec", controllability: "bidder_controls", temporalEvidence: { gateDays: 90, windowDays: 30, gateExceedsWindow: true } };
const plain = { requirement: "submit pricing", citation: "§B", excerpt: "pricing", kind: "pricing", controllability: "bidder_controls" };

const payload = buildV3Payload(decision, coverage, [temporal, plain]);
const [pTemporal, pPlain] = payload.findings;

ok("temporalEvidence CARRIES when present (round-trips through lite())", JSON.stringify(pTemporal.temporalEvidence) === JSON.stringify({ gateDays: 90, windowDays: 30, gateExceedsWindow: true }));
ok("absent-case OMITS the key entirely (not null-filled)", !("temporalEvidence" in pPlain));
ok("no other shape drift — plain finding still carries its base fields", pPlain.requirement === "submit pricing" && pPlain.disposition === "gate_to_clear");
ok("gateExceedsWindow:false round-trips (a falsey value is not dropped)",
  (() => { const p = buildV3Payload(decision, coverage, [{ ...temporal, temporalEvidence: { gateDays: 10, windowDays: 90, gateExceedsWindow: false } }]); return JSON.stringify(p.findings[0].temporalEvidence) === JSON.stringify({ gateDays: 10, windowDays: 90, gateExceedsWindow: false }); })());
ok("null gate/window round-trips (unparsed arithmetic surfaces honestly, not omitted)",
  (() => { const p = buildV3Payload(decision, coverage, [{ ...temporal, temporalEvidence: { gateDays: null, windowDays: null, gateExceedsWindow: false } }]); return JSON.stringify(p.findings[0].temporalEvidence) === JSON.stringify({ gateDays: null, windowDays: null, gateExceedsWindow: false }); })());

console.log("── card-243 payload snapshot (findings[]) ──");
console.log(JSON.stringify(payload.findings, null, 2));
console.log(`\ncard-243 temporal-persist gate: ${pass}/${pass + fails.length} pass`);
if (fails.length) { console.log("✗ FAILURES:\n" + fails.map((x) => "  - " + x).join("\n")); process.exit(1); }
console.log("✅ ALL PASS — temporalEvidence persists through lite()/buildV3Payload when present, omitted when absent (no backfill); no other shape drift.");
process.exit(0);
