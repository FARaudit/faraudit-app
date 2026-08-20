// $0 regression lock for SINGLE-PASS CAPACITY (src/lib/audit-capacity.ts, flag AUDIT_SIZE_REFUSAL).
// Run: npx tsx src/lib/audit-capacity.test.ts
//
// SUBJECT: the production `assessSinglePassCapacity` / `capacityRefusal` / `readTurnsFor`.
//
// THE RISK THIS LOCKS, and it runs in BOTH directions — which is why this file is longer than a
// happy-path gate would be:
//
//   • FALSE REFUSAL is the expensive one. Telling a customer "this package is too big" when it is not
//     costs them the answer they paid for. So the negative controls assert that an ordinary package NEVER
//     refuses, and that the spec bulk — which goes to extraction and consumes no lens turn — cannot push a
//     lane over on its own.
//   • FALSE SILENCE is the one that shipped. A lane owning more documents than it has turns reads a few,
//     submits, and the unopened documents look exactly like documents that held nothing.
//
// And the threshold is DERIVED from the live turn budget, so the gate asserts that raising the budget
// moves the answer. A capacity check with a hardcoded number would be a claim about a config value frozen
// into source, and it would go stale the first time anyone tuned the budget.
import { assessSinglePassCapacity, capacityRefusal, readTurnsFor, SIZE_REFUSAL_ENABLED } from "./audit-capacity";
export {};

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } };

// All owned by pricing_analyst (wage determinations + bid schedules), so one lane carries them.
const PRICING = [
  "Wage Determination TX20260293.pdf", "Wage Determination NM20260035.pdf", "Wage Determination NM20260036.pdf",
  "Wage Determination CA20260011.pdf", "Wage Determination AZ20260044.pdf", "Bid Schedule A.pdf",
  "Bid Schedule B.pdf", "Bid Schedule C.pdf", "Bid Schedule D.pdf",
];
const SPECS = [
  "Attachment N - UFGS 32 12 16 Hot-Mix Asphalt.pdf", "Attachment N - UFGS 33 40 00 Storm Drainage.pdf",
  "Attachment N - UFGS 31 11 00 Clearing and Grubbing.pdf", "Attachment N - UFGS 32 11 20 Base Course.pdf",
  "Attachment N - UFGS 10 14 53 Traffic Signage.pdf", "Attachment N - UFGS 32 01 16 Cold Milling.pdf",
  "Attachment N - UFGS 34 71 13 Vehicle Crash Barriers.pdf", "Attachment N - UFGS 32 12 13 Tack Coats.pdf",
];
const SMALL = ["Wage Determination TX20260293.pdf", "Bid Schedule A.pdf", "W911SG27BA002 Statement of Work.pdf"];

console.log("── the read budget is maxTurns minus the forced submit turn");
{
  ok("8 turns ⇒ 7 reads", readTurnsFor(8) === 7);
  ok("16 turns ⇒ 15 reads", readTurnsFor(16) === 15);
  ok("a 0-turn budget cannot go negative", readTurnsFor(0) === 0);
}

console.log("── ⛔ NEGATIVE CONTROL: an ordinary package NEVER refuses");
{
  const a = assessSinglePassCapacity(SMALL, { maxTurns: 8 });
  ok("withinCapacity", a.withinCapacity);
  ok("nothing is named beyond capacity", a.beyondCapacity.length === 0);
  ok("capacityRefusal returns null — no sentence is produced at all", capacityRefusal(a) === null);
}

console.log("── a lane owning more documents than it has turns is BEYOND capacity, and NAMES the overflow");
{
  const a = assessSinglePassCapacity(PRICING, { maxTurns: 8 });
  ok("9 documents in one lane against a 7-read budget ⇒ beyond capacity", !a.withinCapacity);
  ok("busiest lane is named", a.busiest?.lens === "pricing_analyst" && a.busiest.documents === 9);
  ok("exactly the overflow is named (9 − 7 = 2)", a.beyondCapacity.length === 2);
  const s = capacityRefusal(a) ?? "";
  ok("the sentence names a document", s.includes("Bid Schedule"));
  ok("it tells the reader re-running will not help", /re-running will not change this/i.test(s));
  ok("it does NOT leak a flag name or turn arithmetic", !/AUDIT_|maxTurns|turn budget/i.test(s));
}

console.log("── ⛔ THE THRESHOLD IS DERIVED: raising the budget moves the answer, with no edit here");
{
  ok("9 documents, 8 turns ⇒ beyond", !assessSinglePassCapacity(PRICING, { maxTurns: 8 }).withinCapacity);
  ok("9 documents, 10 turns ⇒ within", assessSinglePassCapacity(PRICING, { maxTurns: 10 }).withinCapacity);
  ok("9 documents, 16 turns ⇒ within", assessSinglePassCapacity(PRICING, { maxTurns: 16 }).withinCapacity);
}

console.log("── ⛔ NEGATIVE CONTROL: the spec bulk consumes no lens turn when it goes to extraction");
{
  const both = [...SMALL, ...SPECS];
  const withExtraction = assessSinglePassCapacity(both, { maxTurns: 8, specBulkToExtraction: true });
  const withoutExtraction = assessSinglePassCapacity(both, { maxTurns: 8, specBulkToExtraction: false });
  ok("8 specs on the lenses pushes the lane over", !withoutExtraction.withinCapacity);
  ok("the same 8 routed to extraction does NOT", withExtraction.withinCapacity);
  ok("and the spec documents are not named as a capacity gap",
     !withExtraction.beyondCapacity.some((n) => n.includes("UFGS")));
}

console.log("── the notice body is UNIVERSAL and never counts against a lane");
{
  const a = assessSinglePassCapacity(["SAM Notice Body", ...SMALL], { maxTurns: 8 });
  const total = a.perLens.reduce((n, l) => n + l.documents.length, 0);
  ok("it is owned by nobody", total === SMALL.length);
}

console.log("── ⛔ NEGATIVE CONTROL: the flag is OFF unless it is exactly \"true\"");
{
  const prev = process.env.AUDIT_SIZE_REFUSAL;
  for (const v of [undefined, "", "false", "TRUE", "1"]) {
    if (v === undefined) delete process.env.AUDIT_SIZE_REFUSAL; else process.env.AUDIT_SIZE_REFUSAL = v;
    ok(`AUDIT_SIZE_REFUSAL=${JSON.stringify(v)} ⇒ OFF`, SIZE_REFUSAL_ENABLED() === false);
  }
  process.env.AUDIT_SIZE_REFUSAL = "true";
  ok('AUDIT_SIZE_REFUSAL="true" ⇒ ON', SIZE_REFUSAL_ENABLED() === true);
  if (prev === undefined) delete process.env.AUDIT_SIZE_REFUSAL; else process.env.AUDIT_SIZE_REFUSAL = prev;
}

console.log("── the assessment is deterministic: same input, same named documents");
{
  const a = assessSinglePassCapacity(PRICING, { maxTurns: 8 });
  const b = assessSinglePassCapacity(PRICING, { maxTurns: 8 });
  ok("identical output across calls", JSON.stringify(a.beyondCapacity) === JSON.stringify(b.beyondCapacity));
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
