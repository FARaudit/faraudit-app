/**
 * $0 DETERMINISTIC proof for Hole B — the agentic-primary MAP-abort silent-confidence bug.
 *
 * Bug: on the AGENTIC_PRIMARY path, a MAP budget-abort/exception sets agenticMap=null, and the old
 * write `agenticMap?.coverage.complete ?? null` then stored `null`. The verdict safety-gate reads
 * `agentic_coverage_complete === false`, so `null` read as "feature off → render the verdict
 * confidently" — even though the full-coverage premise had been abandoned and V2 silently ran as the
 * plain single-pass path (the original 1M-context overflow path). resolveAgenticCoverageComplete fixes
 * the fall-through: feature-on + MAP-null ⇒ false ⇒ the existing suppression fires.
 *
 * Run: npx tsx scripts/audit-ai/test-coverage-honesty.ts
 */
import { resolveAgenticCoverageComplete } from "../../src/lib/agentic-executor";

let pass = true;
const check = (label: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} — ${label}`); pass = pass && cond; };

const mapComplete = { coverage: { complete: true } };
const mapPartial = { coverage: { complete: false } };

// The safety gate (view-model:3137) suppresses iff the value === false. Model that here.
const suppresses = (v: boolean | null) => v === false;

check("feature OFF → null (renderer behaves exactly as pre-agentic; no suppression)", resolveAgenticCoverageComplete(false, null) === null);
check("feature OFF + a map present → still null (off means off)", resolveAgenticCoverageComplete(false, mapComplete) === null);

check("HOLE-B: feature ON + MAP ABORTED (null) → false (was null) → verdict SUPPRESSED", resolveAgenticCoverageComplete(true, null) === false);
check("HOLE-B: the aborted-MAP case now actually fires the safety gate", suppresses(resolveAgenticCoverageComplete(true, null)));

check("feature ON + MAP ran COMPLETE → true → verdict renders (correct)", resolveAgenticCoverageComplete(true, mapComplete) === true);
check("feature ON + MAP ran PARTIAL → false → verdict suppressed (unchanged honest behavior)", resolveAgenticCoverageComplete(true, mapPartial) === false);

// Regression guard: the OLD expression would have returned null on abort → NOT suppressed (the bug).
const oldExpr = (map: typeof mapComplete | null) => map?.coverage.complete ?? null;
check("regression: OLD expression on abort returned null (did NOT suppress — the bug we closed)", oldExpr(null) === null && !suppresses(oldExpr(null)));
check("regression: NEW resolver on abort suppresses where OLD did not", suppresses(resolveAgenticCoverageComplete(true, null)) && !suppresses(oldExpr(null)));

console.log(`\n${pass ? "✅ ALL GREEN" : "❌ FAILURES"} — Hole B (MAP-abort silent confidence) ${pass ? "closed" : "STILL OPEN"} ($0)`);
process.exit(pass ? 0 : 1);
