// $0 REGRESSION for the SUBSET-AWARE set-aside conflict gate (card #534 Brain ruling).
// Run: npx tsx src/lib/audit-decide-setaside-subset-conflict.test.ts
//
// Root (live FA303026Q0020, audit c671d424): the armed panel surfaced FAR 52.219-6 "Notice of Total Small Business
// Set-Aside" INCORPORATED BY REFERENCE in the §L clause table; the conflict gate read it against the WOSB masthead as
// TWO mutually-exclusive set-asides → false NEEDS_HUMAN_REVIEW. Brain ruling: (A) subset-aware — WOSB/EDWOSB/SDVOSB/
// 8(a)/HUBZone ⊂ small business; nested programs NEVER compete; a genuine conflict is two NON-NESTED governing
// markings; (B) a by-reference clause-table entry is NEVER a set-aside MARKING (markings = block 10 / masthead / §L
// operative text / SAM field). Both behind AUDIT_SETASIDE_SUBSET_AWARE, default-OFF ⇒ byte-identical.
import { detectSetAsideConflict } from "./audit-decide";
import type { TypedFinding } from "./audit-findings";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const withSubset = <T>(on: boolean, fn: () => T): T => {
  const prev = process.env.AUDIT_SETASIDE_SUBSET_AWARE;
  if (on) process.env.AUDIT_SETASIDE_SUBSET_AWARE = "true"; else delete process.env.AUDIT_SETASIDE_SUBSET_AWARE;
  try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_SETASIDE_SUBSET_AWARE; else process.env.AUDIT_SETASIDE_SUBSET_AWARE = prev; }
};
// operative marking (has "set aside for …") → a genuine governing marking
const op = (cite: string, text: string): TypedFinding => ({ requirement: text, citation: cite, excerpt: text, kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "x", curableInWindow: false });
const wosbOp = () => op("FAR 52.219-30", "100% Women-Owned Small Business set-aside; this acquisition is set aside for WOSB concerns");
const totalOp = () => op("FAR 52.219-6", "Total Small Business set-aside; set aside for small business concerns");
const hubOp = () => op("FAR 52.219-3", "HUBZone set-aside; set aside for HUBZone concerns");
const edwosbOp = () => op("FAR 52.219-29", "EDWOSB set-aside; set aside for EDWOSB concerns");
// by-reference clause-table entry (NO operative "set aside for" framing) → NOT a marking
const totalByRef = (): TypedFinding => ({ requirement: "FAR 52.219-6 Notice of Total Small Business Set-Aside is incorporated by reference in the Section L clause table", citation: "FAR 52.219-6", excerpt: "clauses incorporated by reference", kind: "eligibility_bar", controllability: "already_satisfied", grounded: true, lens: "contracts_attorney" });
const hubByRef = (): TypedFinding => ({ requirement: "FAR 52.219-3 is incorporated by reference in the Section L clause matrix", citation: "FAR 52.219-3", excerpt: "incorporated by reference", kind: "eligibility_bar", controllability: "already_satisfied", grounded: true, lens: "contracts_attorney" });

console.log("\n── A · ROOT A: nested doc-internal programs never compete ──");
{
  // {WOSB, Total-SB} — WOSB ⊂ Total-SB → nested
  assert(!!withSubset(false, () => detectSetAsideConflict(null, [wosbOp(), totalOp()])), "OFF: {WOSB, Total-SB} → conflict (byte-identical legacy)");
  assert(withSubset(true, () => detectSetAsideConflict(null, [wosbOp(), totalOp()])) === undefined, "ON: {WOSB, Total-SB} nested → NO conflict (WOSB governs)");
  // {EDWOSB, WOSB} — EDWOSB ⊂ WOSB → nested
  assert(withSubset(true, () => detectSetAsideConflict(null, [edwosbOp(), wosbOp()])) === undefined, "ON: {EDWOSB, WOSB} nested → NO conflict");
  // {WOSB, HUBZone} — non-nested → genuine conflict
  assert(!!withSubset(true, () => detectSetAsideConflict(null, [wosbOp(), hubOp()])), "ON: {WOSB, HUBZone} non-nested → CONFLICT");
  // {WOSB, HUBZone, Total-SB} — Total-SB collapses; WOSB vs HUBZone remain non-nested → conflict
  assert(!!withSubset(true, () => detectSetAsideConflict(null, [wosbOp(), hubOp(), totalOp()])), "ON: {WOSB, HUBZone, Total-SB} → CONFLICT (2 non-nested survive)");
}

console.log("\n── B · ROOT A branch (b): SAM vs single doc program, DIRECTION-aware ──");
{
  // SAM=Total-SB (broad) vs doc=WOSB (narrow) → doc refines SAM → NO conflict
  assert(withSubset(true, () => detectSetAsideConflict("SBA", [wosbOp()])) === undefined, "ON: SAM=Total-SB vs doc=WOSB (doc refines) → NO conflict");
  // SAM=HUBZone (narrow) vs doc=Total-SB (broad) → doc UNDER-restricts vs system of record → CONFLICT (Brain #332 preserved)
  assert(!!withSubset(true, () => detectSetAsideConflict("HZC", [totalOp()])), "ON: SAM=HUBZone vs doc=Total-SB → CONFLICT (Brain #332 preserved)");
  assert(!!withSubset(false, () => detectSetAsideConflict("HZC", [totalOp()])), "OFF: SAM=HUBZone vs doc=Total-SB → CONFLICT (legacy)");
  // SAM=WOSB vs doc=WOSB → agreement, both flags
  assert(withSubset(true, () => detectSetAsideConflict("WOSB", [wosbOp()])) === undefined, "ON: SAM=WOSB vs doc=WOSB → agreement, no conflict");
  assert(withSubset(false, () => detectSetAsideConflict("WOSB", [wosbOp()])) === undefined, "OFF: SAM=WOSB vs doc=WOSB → agreement, no conflict");
}

console.log("\n── C · ROOT B: by-reference clause-table entry is NOT a marking ──");
{
  // THE card #534 specimen: WOSB operative masthead + 52.219-6 Total-SB BY REFERENCE, SAM=WOSB → NO conflict
  assert(withSubset(true, () => detectSetAsideConflict("WOSB", [wosbOp(), totalByRef()])) === undefined, "ON: WOSB masthead + Total-SB BY-REF (SAM=WOSB) → NO conflict (card #534 fix)");
  // isolate root B from root A: a by-reference HUBZone (non-nested vs WOSB) must NOT manufacture a conflict…
  assert(withSubset(true, () => detectSetAsideConflict(null, [wosbOp(), hubByRef()])) === undefined, "ON: WOSB operative + HUBZone BY-REF → NO conflict (by-ref is not a marking)");
  // …but an OPERATIVE HUBZone alongside WOSB IS a genuine conflict (proves the by-ref exclusion, not a blanket mute)
  assert(!!withSubset(true, () => detectSetAsideConflict(null, [wosbOp(), hubOp()])), "ON: WOSB operative + HUBZone OPERATIVE → CONFLICT (operative markings compete)");
}

console.log("\n── D · byte-identity: flag OFF reproduces the legacy (pre-fix) behavior ──");
{
  // OFF: by-ref HUBZone still counts (legacy) → non-nested vs WOSB → conflict
  assert(!!withSubset(false, () => detectSetAsideConflict(null, [wosbOp(), hubByRef()])), "OFF: WOSB + HUBZone BY-REF → conflict (legacy counted by-ref)");
  // OFF: the card #534 specimen still FALSE-conflicts (this is exactly the bug the flag fixes)
  assert(!!withSubset(false, () => detectSetAsideConflict("WOSB", [wosbOp(), totalByRef()])), "OFF: card #534 specimen → FALSE conflict reproduced (the bug the flag fixes)");
}

console.log("\n── E · GAUNTLET: a by-reference clause-table entry is NOT a marking (typed OR untyped); only OPERATIVE text is ──");
{
  // untyped by-ref HUBZone (bare citation, noun-form FAR title, "incorporated by reference") → clause-table residue → drops
  const hubByRefUntyped = (): TypedFinding => ({ requirement: "FAR 52.219-3, Notice of HUBZone Set-Aside, incorporated by reference", citation: "FAR 52.219-3", excerpt: "incorporated by reference", kind: "eligibility_bar", controllability: "already_satisfied", grounded: true, lens: "x" });
  // SAME row but the panel bridge TYPED it (requiredAttribute) — typed-ness must NOT rescue boilerplate (round-2: else card #534 re-opens)
  const hubByRefTyped = (): TypedFinding => ({ requirement: "FAR 52.219-3, Notice of HUBZone Set-Aside, incorporated by reference", citation: "FAR 52.219-3", excerpt: "incorporated by reference", requiredAttribute: "se:hubzone", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "small_business_eligibility", curableInWindow: false });
  // OPERATIVE HUBZone (a real governing second pool, "set aside for") → a marking → competes
  assert(withSubset(true, () => detectSetAsideConflict(null, [wosbOp(), hubByRefUntyped()])) === undefined, "ON: WOSB + UNTYPED by-ref HUBZone → NO conflict (clause-table residue)");
  assert(withSubset(true, () => detectSetAsideConflict(null, [wosbOp(), hubByRefTyped()])) === undefined, "ON: WOSB + TYPED by-ref HUBZone → NO conflict (typed boilerplate is NOT a marking — round-2 fix, card #534 stays closed)");
  assert(!!withSubset(true, () => detectSetAsideConflict(null, [wosbOp(), hubOp()])), "ON: WOSB + OPERATIVE HUBZone → CONFLICT (operative evidence IS a marking — no real conflict masked)");
  // the card #534 leak simulated as a BRIDGE-TYPED Total-SB by-ref (requiredAttribute='sb:total') still drops
  const totalByRefTyped = (): TypedFinding => ({ requirement: "FAR 52.219-6 Notice of Total Small Business Set-Aside is incorporated by reference in the Section L clause table", citation: "FAR 52.219-6", excerpt: "clauses incorporated by reference", requiredAttribute: "sb:total", kind: "eligibility_bar", controllability: "already_satisfied", grounded: true, lens: "small_business_eligibility" });
  assert(withSubset(true, () => detectSetAsideConflict("WOSB", [wosbOp(), totalByRefTyped()])) === undefined, "ON: card #534 as BRIDGE-TYPED Total-SB by-ref → NO conflict (round-2 regression: typing never re-opens it)");
}

console.log("\n── F · GAUNTLET finding 2: VOSB ⊂ small business (and SDVOSB ⊂ VOSB) ──");
{
  const vosb = (): TypedFinding => ({ requirement: "VOSB set-aside; set aside for veteran-owned small business concerns", citation: "§L", excerpt: "set aside for VOSB", requiredAttribute: "VOSB", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "x", curableInWindow: false });
  const sdvosb = (): TypedFinding => ({ requirement: "SDVOSB set-aside; set aside for service-disabled veteran-owned concerns", citation: "FAR 52.219-27", excerpt: "set aside for SDVOSB", requiredAttribute: "se:sdvosb", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "x", curableInWindow: false });
  assert(withSubset(true, () => detectSetAsideConflict(null, [vosb(), totalOp()])) === undefined, "ON: {VOSB, Total-SB} nested → NO conflict");
  assert(withSubset(true, () => detectSetAsideConflict("SBA", [vosb()])) === undefined, "ON: SAM=Total-SB vs doc=VOSB (refine) → NO conflict");
  assert(withSubset(true, () => detectSetAsideConflict(null, [sdvosb(), vosb()])) === undefined, "ON: {SDVOSB, VOSB} nested (SDVOSB ⊂ VOSB) → NO conflict");
  assert(!!withSubset(true, () => detectSetAsideConflict(null, [vosb(), hubOp()])) , "ON: {VOSB, HUBZone} non-nested → CONFLICT");
}

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
