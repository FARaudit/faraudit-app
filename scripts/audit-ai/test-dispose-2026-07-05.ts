// $0 gate for the PROPOSE/DISPOSE reconciliation (Brain cards 276/279 — judgment-first prototype, DISPOSE side).
// Proves the rail's GATE authority over the proposer: a committal verdict is emitted ONLY on agreement; every
// disagreement falls to the honest-fail middle (NHR/INCOMPLETE); the rail never fabricates or upgrades toward a
// committal pole. Exhaustive over the 6×6 verdict matrix + the doctrine-critical named cases.
import { disposeVerdict, isCommittal } from "@/lib/audit-dispose";
import type { Verdict } from "@/lib/audit-decide";

const V: Verdict[] = ["BID", "BID_WITH_CAUTION", "NO_BID", "INELIGIBLE", "NEEDS_HUMAN_REVIEW", "INCOMPLETE"];
const d = (verdict: Verdict) => ({ verdict, eligible: verdict === "BID" ? true : null, reason: verdict });
const dispose = (p: Verdict, r: Verdict) => disposeVerdict(d(p), d(r)).verdict;

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => { console.log(`${cond ? "  ✓" : "✗ FAIL"}  ${name}${cond || !detail ? "" : `  — ${detail}`}`); cond ? pass++ : fail++; };

// ── Doctrine-critical named cases ─────────────────────────────────────────────────────────────────────
console.log("PROPOSE/DISPOSE — committal only on agreement; disagreement → honest-fail");
check("agreement BID → BID (confirmed)", dispose("BID", "BID") === "BID");
check("agreement NO_BID → NO_BID (rail already four-walls-gated it)", dispose("NO_BID", "NO_BID") === "NO_BID");
check("agreement INELIGIBLE → INELIGIBLE", dispose("INELIGIBLE", "INELIGIBLE") === "INELIGIBLE");
check("I7: model BID, rail NHR → NHR (never upgrade NHR→BID)", dispose("BID", "NEEDS_HUMAN_REVIEW") === "NEEDS_HUMAN_REVIEW");
check("I7: model BID_WITH_CAUTION, rail BID → BID_WITH_CAUTION (never upgrade CAUTION→clean BID)", dispose("BID_WITH_CAUTION", "BID") === "BID_WITH_CAUTION");
check("model BID, rail BID_WITH_CAUTION → BID_WITH_CAUTION (keep the rail's caution)", dispose("BID", "BID_WITH_CAUTION") === "BID_WITH_CAUTION");
check("I7: model NO_BID, rail BID_WITH_CAUTION → NHR (never CAUTION→NO_BID)", dispose("NO_BID", "BID_WITH_CAUTION") === "NEEDS_HUMAN_REVIEW");
check("model can't force NO_BID past rail: model NO_BID, rail NHR → NHR", dispose("NO_BID", "NEEDS_HUMAN_REVIEW") === "NEEDS_HUMAN_REVIEW");
check("I8: model INELIGIBLE (inferred), rail NHR → NHR (no ineligibility from silence)", dispose("INELIGIBLE", "NEEDS_HUMAN_REVIEW") === "NEEDS_HUMAN_REVIEW");
check("rail-derived NO_BID but model proposed BID → NHR (hard cross-pole conflict, never a committal)", dispose("BID", "NO_BID") === "NEEDS_HUMAN_REVIEW");
check("negative-side mismatch: model NO_BID, rail INELIGIBLE → NHR (different committal, not jointly held)", dispose("NO_BID", "INELIGIBLE") === "NEEDS_HUMAN_REVIEW");
check("INCOMPLETE dominates: model BID, rail INCOMPLETE → INCOMPLETE", dispose("BID", "INCOMPLETE") === "INCOMPLETE");
check("INCOMPLETE dominates: model INCOMPLETE, rail NO_BID → INCOMPLETE", dispose("INCOMPLETE", "NO_BID") === "INCOMPLETE");

// ── Exhaustive matrix invariants ──────────────────────────────────────────────────────────────────────
console.log("\nExhaustive 6×6 matrix invariants");
let committalOnlyOnAgreement = true, neverFabricatedCommittal = true, incompleteDominates = true;
for (const p of V) for (const r of V) {
  const out = dispose(p, r);
  // (1) a NEGATIVE committal (NO_BID/INELIGIBLE) is emitted ONLY when p===r.
  if ((out === "NO_BID" || out === "INELIGIBLE") && p !== r) committalOnlyOnAgreement = false;
  // (2) plain BID is emitted ONLY when p===r===BID (never manufactured from a disagreement).
  if (out === "BID" && !(p === "BID" && r === "BID")) neverFabricatedCommittal = false;
  // (3) if either side is INCOMPLETE and they differ, the outcome is INCOMPLETE.
  if ((p === "INCOMPLETE" || r === "INCOMPLETE") && p !== r && out !== "INCOMPLETE") incompleteDominates = false;
  // (4) the disposed verdict is always a real verdict in the enum.
  if (!V.includes(out)) { fail++; console.log(`✗ FAIL  dispose(${p},${r}) produced non-verdict ${out}`); }
}
check("negative committal (NO_BID/INELIGIBLE) emitted ONLY on exact agreement", committalOnlyOnAgreement);
check("plain BID never fabricated from a disagreement", neverFabricatedCommittal);
check("INCOMPLETE dominates every mixed pair", incompleteDominates);
// a committal disposed verdict on disagreement can ONLY be BID_WITH_CAUTION (the safe positive), never a pole.
let onlySafeCreatedCommittal = true;
for (const p of V) for (const r of V) { if (p !== r) { const o = dispose(p, r); if (isCommittal(o) && o !== "BID_WITH_CAUTION") onlySafeCreatedCommittal = false; } }
check("the ONLY committal a disagreement can yield is BID_WITH_CAUTION (both-biddable case)", onlySafeCreatedCommittal);

console.log(`\n${fail === 0 ? "✅ ALL GREEN" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
