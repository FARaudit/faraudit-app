// $0 regression lock for UNIQUE-EXCERPT COVERAGE (flag AUDIT_COVERAGE_UNIQUE_EXCERPT).
// Run: npx tsx src/lib/audit-coverage-unique-excerpt.test.ts
//
// SUBJECT: the production `documentsCovered`, not a re-implementation.
//
// THE DEFECT THIS CLOSES. `documentsCovered` tests each region INDEPENDENTLY, so one excerpt verbatim in
// two documents credits BOTH as analyzed. The cross-attachment rule that forbids this was already written
// and has never run in production: it is gated on `crossAttGate`, which needs opts that arrive only under
// AUDIT_ATTACHMENT_COVERAGE, and that flag reads FALSE on the live worker. Measured at production flag
// parity on banked run 3b5bba30: five documents were credited by a shared excerpt, and the customer-facing
// "analyzed" count read 8 of 52 when 3 documents had a finding of their own.
//
// FAILURE DIRECTION. This rule may only ever ADD to the gap list. A test that only proved the ON path
// would pass while the rule silently un-covered something it should not — so the add-only direction is
// asserted directly, and the OFF path is asserted byte-identical rather than assumed.
import { documentsCovered } from "./audit-orchestrator";
import type { TypedFinding } from "./audit-findings";
export {};

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } };

const doc = (name: string, body: string) => `==== DOCUMENT: ${name} ====\n${body}\n`;

// Verbatim in BOTH bid schedules — the real shape: near-duplicate siblings sharing boilerplate.
const SHARED = "The offeror shall price every line item in this schedule before submission.";
// Verbatim in one document only.
const UNIQUE_TX = "The contractor shall mill and overlay the El Paso apron to a depth of three inches.";
const UNIQUE_NM = "The contractor shall seal all cracks on the Dona Ana taxiway before acceptance.";

const PKG =
  doc("Solicitation.pdf", "Primary body. Offerors must register in SAM before award is made.") +
  doc("Attachment A - Bid Schedule TX.pdf", `${SHARED} ${UNIQUE_TX} Quantities follow for Texas.`) +
  doc("Attachment B - Bid Schedule NM.pdf", `${SHARED} Quantities follow for New Mexico and shall be priced.`);

const F = (id: string, excerpt: string): TypedFinding =>
  ({ id, excerpt, grounded: true, kind: "requirement", controllability: "bidder_controls" } as unknown as TypedFinding);

const withFlag = <T,>(on: boolean, fn: () => T): T => {
  const prev = process.env.AUDIT_COVERAGE_UNIQUE_EXCERPT;
  if (on) process.env.AUDIT_COVERAGE_UNIQUE_EXCERPT = "true"; else delete process.env.AUDIT_COVERAGE_UNIQUE_EXCERPT;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.AUDIT_COVERAGE_UNIQUE_EXCERPT; else process.env.AUDIT_COVERAGE_UNIQUE_EXCERPT = prev;
  }
};

console.log("── flag OFF: today's behaviour, unchanged — a SHARED excerpt credits BOTH documents");
{
  const r = withFlag(false, () => documentsCovered(PKG, [F("f1", SHARED)]));
  ok("Bid Schedule TX is NOT in the gap list", !r.uncovered.includes("Attachment A - Bid Schedule TX.pdf"));
  ok("Bid Schedule NM is NOT in the gap list", !r.uncovered.includes("Attachment B - Bid Schedule NM.pdf"));
}

console.log("── flag ON: a SHARED excerpt credits NEITHER, and both are NAMED with the reason");
{
  const r = withFlag(true, () => documentsCovered(PKG, [F("f1", SHARED)]));
  ok("Bid Schedule TX is named uncovered", r.uncovered.includes("Attachment A - Bid Schedule TX.pdf"));
  ok("Bid Schedule NM is named uncovered", r.uncovered.includes("Attachment B - Bid Schedule NM.pdf"));
  const reasons = (r.uncoveredDetail ?? []).filter((d) => d.reason === "shared_excerpt_only").map((d) => d.doc);
  ok("both carry reason shared_excerpt_only", reasons.length === 2);
}

console.log("── flag ON does NOT over-refuse: a UNIQUE excerpt still credits its own document");
{
  const r = withFlag(true, () => documentsCovered(PKG, [F("f1", UNIQUE_TX), F("f2", UNIQUE_NM)]));
  ok("TX credited by its own line", !r.uncovered.includes("Attachment A - Bid Schedule TX.pdf"));
  ok("NM is still uncovered — its unique line is not in that document",
     r.uncovered.includes("Attachment B - Bid Schedule NM.pdf"));
}

console.log("── ⛔ DIRECTION: the rule may only ADD to the gap list, never remove");
{
  const findings = [F("f1", SHARED), F("f2", UNIQUE_TX)];
  const off = withFlag(false, () => documentsCovered(PKG, findings));
  const on = withFlag(true, () => documentsCovered(PKG, findings));
  const removed = off.uncovered.filter((n) => !on.uncovered.includes(n));
  ok(`nothing left the gap list (removed ${removed.length}${removed.length ? ": " + removed[0] : ""})`, removed.length === 0);
  ok("and at least one document was added", on.uncovered.length > off.uncovered.length);
}

console.log("── ⛔ NEGATIVE CONTROL: the flag is OFF unless it is exactly \"true\"");
for (const v of ["", "false", "TRUE", "1", "yes"]) {
  const prev = process.env.AUDIT_COVERAGE_UNIQUE_EXCERPT;
  process.env.AUDIT_COVERAGE_UNIQUE_EXCERPT = v;
  const r = documentsCovered(PKG, [F("f1", SHARED)]);
  ok(`AUDIT_COVERAGE_UNIQUE_EXCERPT=${JSON.stringify(v)} ⇒ OFF (shared excerpt still credits)`,
     !r.uncovered.includes("Attachment A - Bid Schedule TX.pdf"));
  if (prev === undefined) delete process.env.AUDIT_COVERAGE_UNIQUE_EXCERPT; else process.env.AUDIT_COVERAGE_UNIQUE_EXCERPT = prev;
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
