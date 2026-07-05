// $0 regression for the two STAGE-8 (verdict-layer) crash-hardening guards found by the 2026-07-05 stage-8
// re-audit (deriveVerdict + guards — the stage the original 9-stage audit never reached). Both are sibling
// inconsistencies where the verdict layer was strictly LESS defensive than its own neighbors, and both go
// live-reachable on the next producer/schema/replay change (a hallucinated field, a deserialized record).
//   A. applyTemporalConflict called .matchAll on an unguarded excerpt (every sibling uses ?? "").
//   B. firmStatus dereferenced profile.satisfiedAttributes without a guard (nmrFirmStatus already guards it).
// Run: npx tsx scripts/audit-ai/test-stage8-crash-guards-2026-07-05.ts
import { applyTemporalConflict, firmStatus } from "@/lib/audit-decide";
import type { TypedFinding, BidderProfile } from "@/lib/audit-findings";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => { console.log(`${cond ? "  ✓" : "✗ FAIL"}  ${name}${cond || !detail ? "" : `  — ${detail}`}`); cond ? pass++ : fail++; };
const noThrow = (fn: () => unknown): boolean => { try { fn(); return true; } catch (e) { console.log(`     threw: ${(e as Error)?.message}`); return false; } };

// NOTE: excerpt is intentionally left to `...o` so a test can pass `excerpt: undefined` (the crash input under
// test). Cast to TypedFinding — the guards under test must tolerate a missing excerpt at runtime.
const f = (o: Partial<TypedFinding>): TypedFinding => ({ requirement: o.requirement ?? "r", citation: o.citation ?? "§F", grounded: true, lens: "x", kind: o.kind ?? "technical_spec", controllability: o.controllability ?? "bidder_controls", ...o } as TypedFinding);

console.log("Stage-8 crash guard A — applyTemporalConflict tolerates a missing excerpt");
// A malformed pair carrying the sweep archetypes but NO excerpt (a hallucinated/deserialized field) used to hit
// gateDays/deliveryWindowDays/clinSet → .matchAll(undefined) → TypeError mid-verdict → burned paid run.
const fatNoExcerpt = f({ requirement: "FAT gate", sweepArchetype: "fat_precondition", excerpt: undefined });
const delNoExcerpt = f({ requirement: "delivery window", sweepArchetype: "delivery_window", excerpt: undefined });
check("undefined excerpts on both sweep findings → no throw", noThrow(() => applyTemporalConflict([fatNoExcerpt, delNoExcerpt])));
check("one undefined excerpt → no throw", noThrow(() => applyTemporalConflict([fatNoExcerpt, f({ sweepArchetype: "delivery_window", excerpt: "within 90 days ARO" })])));
check("no sweep findings → returns input unchanged (fast path)", (() => { const r = applyTemporalConflict([f({})]); return r.length === 1; })());

console.log("\nStage-8 crash guard B — firmStatus tolerates a profile missing satisfiedAttributes");
// A non-null profile object without the array (a deserialized/replayed or future-built profile) used to throw
// TypeError on .includes → deriveVerdict calls firmStatus repeatedly → burned run.
const bar = f({ requirement: "must hold clearance", controllability: "bidder_cannot_move", requiredAttribute: "clearance:secret", kind: "eligibility_bar" });
const brokenProfile = { closedWorld: false } as unknown as BidderProfile; // satisfiedAttributes missing
check("profile missing satisfiedAttributes → no throw, returns a status", noThrow(() => firmStatus(bar, brokenProfile)));
check("firmStatus(missing-array profile) → 'unknown' (fail-safe, not a crash or false fails)", firmStatus(bar, brokenProfile) === "unknown");
check("null profile → 'unknown' (unchanged)", firmStatus(bar, null) === "unknown");
check("normal profile with the attribute → 'satisfies' (unchanged behavior preserved)",
  firmStatus(bar, { satisfiedAttributes: ["clearance:secret"], closedWorld: true } as BidderProfile) === "satisfies");

console.log(`\n${fail === 0 ? "✅ ALL GREEN" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
