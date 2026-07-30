/* CERT Unit-6 — real seq-2 record (93 findings): verdict+eligible invariance across null/open/closed,
 * idempotency, order-stability, flag-off byte-identity, and a protected-absorb audit + ReDoS timing. */
import { applyFindingDedup, deriveVerdict, type TypedFinding } from "../../src/lib/audit-decide";
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

process.env.AUDIT_FINDING_DEDUP = "true";
const after = applyFindingDedup(findings, { enabled: true });
console.log(`rows: ${findings.length} -> ${after.length}   plains among input: ${findings.filter(isPlain).length}   protected: ${findings.filter((f)=>!isPlain(f)).length}`);

// AUDIT: no protected finding may be absorbed (dropped). Every non-plain input must appear by-reference in output.
let fails = 0;
const outSet = new Set(after);
for (const f of findings) if (!isPlain(f) && !outSet.has(f)) { console.log(`  FAIL protected finding absorbed: ${f.citation} "${(f.requirement||'').slice(0,50)}"`); fails++; }
// survivors are plain/non-bar:
for (const f of after) if ((f as any).findingDedupMerged) {
  if (isBar(f)) { console.log(`  FAIL survivor is a bar: ${f.citation}`); fails++; }
  if ((f as any).requiredAttribute) { console.log(`  FAIL survivor carries requiredAttribute: ${f.citation}`); fails++; }
}

for (const [label, p] of [["null", nullP], ["open", openP], ["closed", closedP]] as const) {
  const b = V(deriveVerdict(vi(findings, p)));
  const a = V(deriveVerdict(vi(after, p)));
  const flag = b === a ? "ok " : "FAIL";
  if (b !== a) fails++;
  console.log(`  ${flag} [${label}]  before: ${b}\n         after : ${a}`);
}

// idempotency
const twice = applyFindingDedup(after, { enabled: true });
console.log(`  ${JSON.stringify(twice) === JSON.stringify(after) ? "ok " : "FAIL"} idempotent`);
if (JSON.stringify(twice) !== JSON.stringify(after)) fails++;

// order-stability: shuffle input, verdict must be invariant
function shuffle<T>(a: T[]): T[] { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [b[i],b[j]]=[b[j],b[i]]; } return b; }
let orderOk = true;
const baseNull = V(deriveVerdict(vi(after, nullP)));
for (let t = 0; t < 20; t++) {
  const sh = applyFindingDedup(shuffle(findings), { enabled: true });
  if (V(deriveVerdict(vi(sh, nullP))) !== baseNull) orderOk = false;
}
console.log(`  ${orderOk ? "ok " : "FAIL"} order-stable verdict (20 shuffles)`);
if (!orderOk) fails++;

// flag-off byte-identity (same ref)
process.env.AUDIT_FINDING_DEDUP = "false";
console.log(`  ${applyFindingDedup(findings, { enabled: false }) === findings ? "ok " : "FAIL"} flag-off same-ref`);
process.env.AUDIT_FINDING_DEDUP = "true";

// ReDoS — pathological citation/requirement blobs against FD_CLAUSE_RE via the gate
const evil = [
  "52." + "2".repeat(50000) + "-1",
  "252." + "7".repeat(50000),
  ("52.219-14 ".repeat(5000)),
];
const t0 = Date.now();
for (const e of evil) applyFindingDedup([{ id:"x", requirement: e, citation: e, excerpt:"", kind:"other", controllability:"bidder_controls", grounded:true } as TypedFinding, { id:"y", requirement: e, citation: e, excerpt:"", kind:"other", controllability:"bidder_controls", grounded:true } as TypedFinding], { enabled: true });
console.log(`  ${Date.now()-t0 < 500 ? "ok " : "FAIL"} ReDoS ${Date.now()-t0}ms`);
if (Date.now()-t0 >= 500) fails++;

console.log(fails === 0 ? "\nREAL-RECORD: ALL PASS" : `\nREAL-RECORD: ${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
