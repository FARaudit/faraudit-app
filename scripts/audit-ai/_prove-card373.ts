// RE-PROOF for Gauntlet Card #373 Option 1 — ENTAILMENT HARD-DROP, structurally dominant. Tests the VERIFIER
// disposition (makeAgenticVerifier) with a stubbed skeptic returning controlled verdicts on a grounded finding.
// Brain's re-proof set: fabrication-negative on the EXACT RE-TYPE path (upheld=false + corrected → DROPPED),
// genuine-positive (legit re-type WITHOUT entailmentFail keeps its survival/coverage), and an ORDERING-LOCKED
// assertion (entailmentFail dominates a substantive corrected — a reorder that ran `substantive` first would let the
// finding survive re-typed, flipping E1/E4 red). Run both flag states.
import { makeAgenticVerifier, makeTieredSkeptic } from "../../src/lib/audit-verifier";
import type { SkepticVerdict } from "../../src/lib/audit-verifier";
import type { AuditToolContext } from "../../src/lib/audit-tools";
import type { TypedFinding } from "../../src/lib/audit-findings";

let fail = 0; const ok = (l: string, c: boolean) => { c || fail++; console.log(`${c ? "✓" : "✗"} ${l}`); };
const FLAG = process.env.AUDIT_ATTACHMENT_COVERAGE === "true";
(async () => {
console.log(`\n===== Card #373 Option-1 re-proof — AUDIT_ATTACHMENT_COVERAGE=${FLAG ? "ON" : "OFF"} =====`);

const EXC = "the contractor shall provide all materials compatibility test and evaluation services";
const ctx: AuditToolContext = { fullSource: `Attachment 1 SOW. ${EXC}. End of section.` } as AuditToolContext;
// a REAL verbatim excerpt pinned to an INVENTED requirement — the fabrication shape
const fabricated: TypedFinding = { requirement: "Offeror must hold a Top Secret facility clearance (INVENTED — not in the excerpt).", citation: "Attachment 1", excerpt: EXC, kind: "other", controllability: "bidder_controls", grounded: true, lens: "coverage" } as any;
const run = (v: SkepticVerdict) => makeAgenticVerifier(async () => [v])(ctx, [fabricated], { bidderProfile: null });

// E1 — FABRICATION-NEGATIVE on the exact RE-TYPE path: upheld=false + entailmentFail + corrected
const e1 = await run({ index: 0, upheld: false, entailmentFail: true, corrected: { controllability: "bidder_controls" }, reason: "requirement not supported by excerpt" });
if (FLAG) {
  ok("E1 flag-ON: {upheld:false, entailmentFail:true, corrected:{…}} → DROPPED (not survived) — RE-TYPE cannot resurrect", e1.survived.length === 0 && e1.rejected.length === 1);
  ok("E1 flag-ON: drop took the ENTAILMENT branch (dropReason=entailment_fail) — ORDERING LOCKED before substantive", (e1.correctedDrops ?? []).some((d) => d.dropReason === "entailment_fail"));
} else {
  ok("E1 flag-OFF: entailmentFail IGNORED → substantive corrected → SURVIVES re-typed (byte-identical)", e1.survived.length === 1 && e1.rejected.length === 0);
}

// E2 — GENUINE-POSITIVE: a legit classification correction (NO entailmentFail) must SURVIVE re-typed (keeps coverage)
const e2 = await run({ index: 0, upheld: false, corrected: { controllability: "bidder_cannot_move" }, reason: "under-typed genuine bar" });
ok("E2: legit re-type (no entailmentFail) SURVIVES re-typed (coverage credit preserved) — both flag states", e2.survived.length === 1 && e2.survived[0].controllability === "bidder_cannot_move");

// E3 — entailmentFail ALONE (pure overturn, no corrected) drops (flag-ON); flag-OFF plain overturn also drops
const e3 = await run({ index: 0, upheld: false, entailmentFail: true, reason: "invented" });
ok(`E3 ${FLAG ? "flag-ON" : "flag-OFF"}: pure entailmentFail/overturn → DROPPED`, e3.survived.length === 0 && e3.rejected.length === 1);

// E4 — ORDERING-LOCK (explicit): entailmentFail must DOMINATE even a fully-substantive corrected carrying curableInWindow
const e4 = await run({ index: 0, upheld: true, entailmentFail: true, corrected: { controllability: "bidder_cannot_move", curableInWindow: false }, reason: "invented bar" });
if (FLAG) {
  ok("E4 flag-ON: entailmentFail DOMINATES upheld:true + full corrected → DROPPED (branch order locked)", e4.survived.length === 0 && e4.rejected.length === 1);
} else {
  ok("E4 flag-OFF: entailmentFail ignored, upheld:true + corrected → SURVIVES re-typed", e4.survived.length === 1);
}

// ── E5/E6 — END-TO-END through the PRODUCTION wiring makeAgenticVerifier(makeTieredSkeptic(base, escalate)). E1-E4
// stub the skeptic DIRECTLY into makeAgenticVerifier and so cannot see the tiered MERGE (audit-verifier.ts:172), which
// must PRESERVE entailmentFail from the Opus escalation judge — omitting it left the guard INERT in prod (blind-
// ultracode #373-delta P0). base OVERTURNS the fabricated finding → it is CONTESTED → escalate re-judges it → the
// escalation entailmentFail must survive the merge and hard-drop. The escalate stub receives the contested subset, so
// it rules on local index 0.
const tiered = (baseV: SkepticVerdict, escV: SkepticVerdict) =>
  makeAgenticVerifier(makeTieredSkeptic(async () => [baseV], async () => [escV]))(ctx, [fabricated], { bidderProfile: null });
// E5 — escalation sets entailmentFail + corrected on the contested fabrication
const e5 = await tiered({ index: 0, upheld: false, reason: "base overturn → contested" }, { index: 0, upheld: false, entailmentFail: true, corrected: { controllability: "bidder_controls" }, reason: "requirement not in excerpt" });
if (FLAG) {
  ok("E5 flag-ON: entailmentFail PRESERVED through the tiered merge → fabrication DROPPED end-to-end (guard live in prod)", e5.survived.length === 0 && e5.rejected.length === 1);
} else {
  ok("E5 flag-OFF: byte-identical — tiered merge, entailmentFail ignored → survives re-typed", e5.survived.length === 1);
}
// E6 — escalation genuine re-type WITHOUT entailmentFail must SURVIVE through the tiered merge (no over-drop)
const e6 = await tiered({ index: 0, upheld: false, reason: "base overturn → contested" }, { index: 0, upheld: false, corrected: { controllability: "bidder_cannot_move" }, reason: "under-typed genuine bar" });
ok("E6: legit escalation re-type (no entailmentFail) SURVIVES through the tiered merge (coverage preserved) — both flags", e6.survived.length === 1 && e6.survived[0].controllability === "bidder_cannot_move");

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAIL"} (${fail} failed) — Card #373 Option-1, ${FLAG ? "flag-ON" : "flag-OFF"} side\n`);
process.exit(fail === 0 ? 0 : 1);
})();
