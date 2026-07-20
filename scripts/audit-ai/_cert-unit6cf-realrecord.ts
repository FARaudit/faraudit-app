/* CERT Unit-6 cross-fleet — real seq-2 record (93 findings): verdict+eligible invariance ON vs OFF (through the FULL
 * production chain clause-gate → cross-fleet-gate), protected-passthrough audit, idempotency, order-stability,
 * flag-off byte-identity, ReDoS. Same bar Brain #555 set for the clause gate; cross-fleet is verdict-safe by the
 * identical protected-passthrough construction (plain-only; survivor plain). */
import { applyFindingDedup, applyCrossFleetDedup, deriveVerdict, type TypedFinding } from "../../src/lib/audit-decide";
import type { BidderProfile, VerdictInputs } from "../../src/lib/audit-findings";
import fs from "fs";

const rec = JSON.parse(fs.readFileSync("/tmp/seq2-runrecord.json", "utf8"));
const findings: TypedFinding[] = (rec.result?.findings ?? rec.findings ?? []) as TypedFinding[];
const src: string = rec.result?.fullSource ?? rec.fullSource ?? rec.input?.fullSource ?? "";

const isBar = (f: TypedFinding) => f.controllability === "bidder_cannot_move" || f.controllability === "no_one_can_move";
const ABS = new Set(["id","requirement","citation","excerpt","kind","controllability","grounded","lens","severity","curableInWindow","cautionFloor","unverified","documentProvenance","locatedAt","contextNote"]);
const isPlain = (f: TypedFinding) => !isBar(f) && Object.keys(f).every((k) => ABS.has(k));

const vi = (f: TypedFinding[], p: BidderProfile | null): VerdictInputs =>
  ({ findings: f, bidderProfile: p, coverageComplete: true, verifierSound: true, conflict: false, source: src });
const V = (d: ReturnType<typeof deriveVerdict>) => `${d.verdict} | eligible=${d.eligible} | ss=${d.showStoppers.length}`;

const nullP: BidderProfile | null = null;
const openP: BidderProfile = { satisfiedAttributes: ["se:wosb", "naics:appl-small"] };
const closedP: BidderProfile = { satisfiedAttributes: ["se:wosb"], closedWorld: true } as BidderProfile;

// PRODUCTION CHAIN: clause gate then cross-fleet gate (both ON) — exactly the orchestrator order.
const chain = (f: TypedFinding[]) => applyCrossFleetDedup(applyFindingDedup(f, { enabled: true }), { enabled: true });

const clauseOnly = applyFindingDedup(findings, { enabled: true });
const after = applyCrossFleetDedup(clauseOnly, { enabled: true });
console.log(`rows: ${findings.length} -> (clause) ${clauseOnly.length} -> (cross-fleet) ${after.length}`);
console.log(`cross-fleet survivors: ${after.filter((f)=>(f as any).crossFleetMerged).length}   plains among clause-out: ${clauseOnly.filter(isPlain).length}   protected: ${clauseOnly.filter((f)=>!isPlain(f)).length}`);

let fails = 0;
// AUDIT: no protected finding (bar / marker / attr-bearer) may be absorbed by the cross-fleet gate.
const outSet = new Set(after);
for (const f of clauseOnly) if (!isPlain(f) && !outSet.has(f)) { console.log(`  FAIL protected finding absorbed by cross-fleet: ${f.citation} "${(f.requirement||'').slice(0,50)}"`); fails++; }
// survivors are plain/non-bar:
for (const f of after) if ((f as any).crossFleetMerged) {
  if (isBar(f)) { console.log(`  FAIL cross-fleet survivor is a bar: ${f.citation}`); fails++; }
  if ((f as any).requiredAttribute) { console.log(`  FAIL cross-fleet survivor carries requiredAttribute`); fails++; }
  console.log(`    merged date=${(f as any).mergedDateSig} lenses=${(f as any).mergedLensCount} :: ${(f.requirement||'').slice(0,120)}`);
}

// VERDICT INVARIANCE — raw findings vs full chain, across null/open/closed.
for (const [label, p] of [["null", nullP], ["open", openP], ["closed", closedP]] as const) {
  const b = V(deriveVerdict(vi(findings, p)));
  const a = V(deriveVerdict(vi(after, p)));
  const flag = b === a ? "ok " : "FAIL";
  if (b !== a) fails++;
  console.log(`  ${flag} [${label}]  raw : ${b}\n         chain: ${a}`);
}

// idempotency (re-running cross-fleet on its own output is a no-op)
const twice = applyCrossFleetDedup(after, { enabled: true });
console.log(`  ${JSON.stringify(twice) === JSON.stringify(after) ? "ok " : "FAIL"} idempotent`);
if (JSON.stringify(twice) !== JSON.stringify(after)) fails++;

// order-stability: shuffle input, chained verdict must be invariant
function shuffle<T>(a: T[]): T[] { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [b[i],b[j]]=[b[j],b[i]]; } return b; }
let orderOk = true;
const baseNull = V(deriveVerdict(vi(after, nullP)));
for (let t = 0; t < 20; t++) {
  const sh = chain(shuffle(findings));
  if (V(deriveVerdict(vi(sh, nullP))) !== baseNull) orderOk = false;
}
console.log(`  ${orderOk ? "ok " : "FAIL"} order-stable chained verdict (20 shuffles)`);
if (!orderOk) fails++;

// flag-off byte-identity (same ref)
console.log(`  ${applyCrossFleetDedup(clauseOnly, { enabled: false }) === clauseOnly ? "ok " : "FAIL"} flag-off same-ref`);
if (applyCrossFleetDedup(clauseOnly, { enabled: false }) !== clauseOnly) fails++;

// ReDoS — pathological date-like blobs against CFD_DATE_RE via the gate
const evil = [
  "July " + "9".repeat(50000) + ", 2026",
  ("July 22, 2026 ".repeat(5000)),
  "12/34/5678" + "/".repeat(50000),
];
const t0 = Date.now();
for (const e of evil) applyCrossFleetDedup([{ id:"x", requirement: e, citation: e, excerpt:"", kind:"other", controllability:"bidder_controls", grounded:true } as TypedFinding, { id:"y", requirement: e, citation: e, excerpt:"", kind:"other", controllability:"bidder_controls", grounded:true } as TypedFinding], { enabled: true });
const dt = Date.now()-t0;
console.log(`  ${dt < 500 ? "ok " : "FAIL"} ReDoS ${dt}ms`);
if (dt >= 500) fails++;

console.log(fails === 0 ? "\nREAL-RECORD cross-fleet: ALL PASS" : `\nREAL-RECORD cross-fleet: ${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
