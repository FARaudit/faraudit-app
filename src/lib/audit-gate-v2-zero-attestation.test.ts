// ZERO-ATTESTATION HONEST-FAIL — CI gate for AUDIT_ZERO_ATTESTATION_INCOMPLETE (CEO ruling 2026-08-05:
// "cap it — an unattested package returns INCOMPLETE").
//
// WHY THIS FILE AND NOT ONLY THE CORPUS SCRIPT. The corpus script
// (scripts/audit-ai/test-zero-attestation-reach.ts) proves the class is REACHABLE by real packages, but it
// needs run-records/, which is gitignored and therefore ABSENT IN CI — a gate that silently skips on every
// push is not a gate. This file asserts the FIX with no corpus at all, so CI actually runs it.
//
// IT DOES NOT HAND-BUILD A CoverageV2. Building the struct by literal is how a gate ends up testing a path
// production cannot reach; the empty attestation set is fed through the REAL gradeCoverageV2, which is
// exactly what the orchestrator calls (audit-orchestrator.ts:3105). The corpus script covers the other
// half — that production genuinely produces an empty set.
//
// Run: npx tsx src/lib/audit-gate-v2-zero-attestation.test.ts

import assert from "node:assert";
import { gradeCoverageV2, gateV2Outcome, type CoverageV2 } from "./audit-gate-v2";
import type { SectionAttestation } from "./audit-orchestrator";

// The module reads the flag at CALL time, so one static import serves both arms — no re-import needed and
// no module-scope cache to defeat.
const FLAG = "AUDIT_ZERO_ATTESTATION_INCOMPLETE";
let passed = 0;
const ok = (label: string, cond: boolean) => {
  assert.ok(cond, `FAIL — ${label}`);
  console.log(`  ✓ ${label}`);
  passed++;
};

const withFlag = <T>(on: boolean, fn: () => T): T => {
  const prev = process.env[FLAG];
  if (on) process.env[FLAG] = "true"; else delete process.env[FLAG];
  try { return fn(); } finally {
    if (prev === undefined) delete process.env[FLAG]; else process.env[FLAG] = prev;
  }
};

// A NON-empty, fully-covered attestation set — the control that must NOT be capped by this rule. Without it
// the gate could pass by capping everything, which would be a false-INCOMPLETE machine rather than a fix.
const covered: SectionAttestation[] = [
  { section: "L", status: "covered_direct", obligations: [], citedFindingIds: ["f1"], ungrounded: [] },
  { section: "M", status: "covered_direct", obligations: [], citedFindingIds: ["f2"], ungrounded: [] },
];

console.log("── ZERO-ATTESTATION HONEST-FAIL ──");

// ── 1. THE DEFECT, still present flag-OFF. This is the NEGATIVE CONTROL: if this assertion ever goes green
//       the other direction, the gate below is inert and proves nothing.
withFlag(false, () => {
  const cov = gradeCoverageV2([]);
  ok("flag OFF — an empty attestation set still scores coverageGrade 1", cov.coverageGrade === 1);
  ok("flag OFF — attestedCount is ABSENT (serialized coverageV2 byte-identical)", !("attestedCount" in cov));
  const out = gateV2Outcome(cov);
  ok("flag OFF — gate emits NO cap and claims completeness (the unfixed behaviour)",
    out.cap === null && /Coverage complete/.test(out.reason));
});

// ── 2. THE FIX, flag-ON.
withFlag(true, () => {
  const cov = gradeCoverageV2([]);
  ok("flag ON — attestedCount is emitted and is 0", cov.attestedCount === 0);
  ok("flag ON — coverageGrade is UNCHANGED at 1 (the grade is not the carrier; the count is)",
    cov.coverageGrade === 1);
  const out = gateV2Outcome(cov);
  ok("flag ON — gate CAPS to INCOMPLETE", out.cap === "INCOMPLETE");
  ok("flag ON — the reason names the actual failure, not a coverage percentage",
    /0 sections attested/.test(out.reason) && !/Coverage complete/.test(out.reason));
});

// ── 3. THE COMPLEMENT — a real, covered package must be untouched in BOTH arms. This is the false-INCOMPLETE
//       guard: the cap must fire on "nothing examined", never on "examined and clean".
for (const on of [false, true]) {
  withFlag(on, () => {
    const cov = gradeCoverageV2(covered);
    const out = gateV2Outcome(cov);
    ok(`flag ${on ? "ON " : "OFF"} — a COVERED package is not capped (grade ${cov.coverageGrade})`,
      out.cap === null);
  });
}

// ── 4. LEGACY REPLAY — a record banked before attestedCount existed has the field ABSENT, which means
//       "unknown", not "empty". Capping it would rewrite history on every replay. `=== 0`, never falsy.
//       Built from the EMPTY set, not the covered one: a covered set is uncapped either way, so asserting on
//       it would pass no matter how the branch reads the field and would prove nothing.
withFlag(true, () => {
  // No cast: `attestedCount` is optional on CoverageV2, so this stays type-checked end to end — the point is
  // the ABSENCE of one key, and a cast to Record<string, unknown> would have hidden a real shape mistake.
  const legacy: CoverageV2 = { ...gradeCoverageV2([]) };
  assert.strictEqual(legacy.attestedCount, 0, "precondition — the empty set must carry attestedCount 0 flag-ON");
  delete legacy.attestedCount;
  const out = gateV2Outcome(legacy);
  ok("flag ON — an EMPTY proof set with attestedCount absent (legacy record) is NOT capped: missing means unknown, not 0",
    out.cap === null);
});

// ── 5. ORDER — the cap is first, so no later branch can shadow it. Proven by giving the gate BOTH an empty
//       proof set and an unreadable section: the zero-attestation reason must win.
withFlag(true, () => {
  const cov = { ...gradeCoverageV2([]), unreadable: ["C"] };
  const out = gateV2Outcome(cov);
  ok("flag ON — zero-attestation outranks the unreadable-section cap (same pole, clearer reason)",
    out.cap === "INCOMPLETE" && /0 sections attested/.test(out.reason));
});

console.log(`\n✓ ${passed}/${passed} passed — zero-attestation honest-fail`);
