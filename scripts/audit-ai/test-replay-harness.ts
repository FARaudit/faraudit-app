// $0 gate for FIX #1 Part 2 — the persisted run record + deterministic replay harness.
//   npx tsx scripts/audit-ai/test-replay-harness.ts
//
// Uses a SYNTHETIC record (a harness fixture — NOT a gate anchor; the gold-set hard stop is untouched). Proves:
//  • replayRunRecord reproduces per-section obligation grounding PASS/MISS (B/C/L covered, M ungrounded → MISS);
//  • deriveVerdict(persisted inputs) reproduces the recorded verdict (record-fidelity integrity check);
//  • a FAITHFUL record shows drift=none; a deliberately-STALE record is caught (drift non-empty).

import { buildManifest, completenessOf, coreMissingFor, type AuditResult } from "@/lib/audit-orchestrator";
import { deriveVerdict } from "@/lib/audit-decide";
import { buildRunRecord, replayRunRecord, type RunRecord } from "@/lib/audit-run-record";
import type { AuditToolContext } from "@/lib/audit-tools";
import type { TypedFinding, VerdictInputs } from "@/lib/audit-findings";

const SRC = [
  "SECTION B - SUPPLIES AND PRICES",
  "Offerors shall submit pricing for CLIN 0001 no later than the due date.",
  "SECTION C - STATEMENT OF WORK",
  "The contractor shall furnish one mini-excavator meeting the salient characteristics.",
  "SECTION L - INSTRUCTIONS TO OFFERORS",
  "Offerors must submit a Certificate of Conformance with the offer.",
  "SECTION M - EVALUATION FACTORS FOR AWARD",
  "Award on a Lowest-Priced Technically Acceptable basis. The offeror must provide three past performance references.",
].join("\n");

const F = (id: string, requirement: string, citation: string, excerpt: string, lens: string): TypedFinding => ({
  id, requirement, citation, excerpt, kind: "submission", controllability: "bidder_controls", grounded: true, lens,
});
const findings: TypedFinding[] = [
  F("pricing#1", "Submit pricing for CLIN 0001", "Section B", "Offerors shall submit pricing for CLIN 0001", "pricing"),
  F("capture#1", "Furnish one mini-excavator", "Section C", "The contractor shall furnish one mini-excavator", "capture"),
  F("proposal#1", "Submit a Certificate of Conformance", "Section L", "Offerors must submit a Certificate of Conformance", "proposal"),
  // NOTE: no finding grounds §M's "must provide three past performance references" → §M MISSES.
];

const ctx: AuditToolContext = { fullSource: SRC };
const required = buildManifest(ctx);
const sectionsRead = new Set(["B", "C", "L", "M"]);
const cov = completenessOf(ctx, required, findings, sectionsRead);
const coreMissing = coreMissingFor(ctx);
const coverageComplete = cov.missing.length === 0 && required.length > 0; // false — §M missed
const inputs: VerdictInputs = { findings, bidderProfile: null, coverageComplete, verifierSound: true, conflict: false, manifestComplete: true };
const decision = deriveVerdict(inputs);

const result: AuditResult = {
  decision, inputs, findings,
  coverage: { required, covered: cov.covered, missing: cov.missing, attestations: cov.attestations, coreMissing },
  perLens: {}, conflict: false, sectionsRead: [...sectionsRead], trace: {},
};
const rec: RunRecord = buildRunRecord({
  meta: { runId: "synthetic-fixture", startedAt: "2026-07-01T00:00:00.000Z", flags: {}, sol: "FIXTURE-UCF-1" },
  input: { fullSource: SRC, bidderProfile: null, naics: null, setAside: null, manifestComplete: true },
  result,
  billing: { honestFail: true, billable: false },
});

let pass = 0; const fails: string[] = [];
const eq = (label: string, got: unknown, exp: unknown) => { if (JSON.stringify(got) === JSON.stringify(exp)) pass++; else fails.push(`${label}: got ${JSON.stringify(got)} exp ${JSON.stringify(exp)}`); };

const r = replayRunRecord(rec);
const sec = (k: string) => r.sections.find((s) => s.section === k)!;

// (1) manifest + format
eq("1 required = [B,C,L,M]", [...r.required].sort(), ["B", "C", "L", "M"]);
eq("1 formatDetected = UCF", r.formatDetected, "UCF");
eq("1 procurementPart = part15-ucf", r.procurementPart, "part15-ucf");

// (2) per-section obligation grounding PASS/MISS
eq("2 §B PASS", sec("B").pass, true);
eq("2 §C PASS", sec("C").pass, true);
eq("2 §L PASS", sec("L").pass, true);
eq("2 §M MISS", sec("M").pass, false);
eq("2 §M has an ungrounded obligation", sec("M").ungroundedCount >= 1, true);
eq("2 missing = [M]", r.missing, ["M"]);
eq("2 deterministicCoverageComplete = false", r.deterministicCoverageComplete, false);

// (3) verdict reproduced from persisted inputs (record fidelity)
eq("3 replay reproduces recorded verdict", r.verdictReproduced, true);
eq("3 recorded verdict is the honest-fail INCOMPLETE", rec.result.verdict, "INCOMPLETE");

// (4) faithful record → no drift
eq("4 faithful record drift = none", r.drift, []);

// (5) STALE record is caught — corrupt the recorded coverage.missing, replay must flag drift
const stale: RunRecord = JSON.parse(JSON.stringify(rec));
stale.result.coverage.missing = []; // lie: claim nothing missed
const rs = replayRunRecord(stale);
eq("5 stale record → drift detected", rs.drift.length > 0, true);
eq("5 stale drift names coverage.missing", rs.drift.some((d) => d.includes("coverage.missing")), true);

console.log(`replay-harness gate: ${pass}/${pass + fails.length} pass`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((x) => console.log("  ❌ " + x)); process.exit(1); }
console.log("✅ ALL PASS — replay reproduces per-section PASS/MISS + verdict; faithful record clean; stale record caught.");
process.exit(0);
