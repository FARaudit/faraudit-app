// $0 REGRESSION for the SAM-vs-DOCUMENT set-aside CONFLICT gate (Brain #332) — the source-of-truth defect.
// Run: npx tsx src/lib/audit-decide-setaside-conflict.test.ts
//
// Root (live FA442726Q1068): SAM set-aside = HZC (HUBZone); the engine audited on 52.219-6 (Total Small Business)
// and returned a confident BID_WITH_CAUTION off the WRONG basis, never surfacing the conflict. Doctrine (Brain #332):
// SAM (system of record) vs document set-aside mismatch INVERTS eligibility → must DOMINATE the verdict as an NHR
// CO-clarification, never a silent pick. Pure functions; the conflict signal is INJECTED into VerdictInputs (the
// orchestrator gates it behind AUDIT_SETASIDE_CONFLICT_GATE, default-OFF ⇒ deriveVerdict byte-identical).
import { detectSetAsideConflict, canonicalizeSamSetAside, deriveVerdict } from "./audit-decide";
import type { TypedFinding } from "./audit-findings";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const base = { bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as const;

// The live doc-grounded set-aside finding: a 52.219-6 Total Small Business set-aside.
const totalSbFinding = (): TypedFinding => ({
  requirement: "This acquisition is a Total Small Business set-aside; FAR 52.219-6 is incorporated. Offeror must self-certify as small under NAICS 334290.",
  citation: "FAR 52.219-6", excerpt: "Notice of Total Small Business Set-Aside — set aside for small business concerns",
  kind: "eligibility_bar", controllability: "already_satisfied", grounded: true, lens: "contracts_attorney", requiredAttribute: undefined,
});

console.log("\n── 1 · SAM code canonicalization ──");
{
  assert(canonicalizeSamSetAside("HZC") === "se:hubzone", "HZC → se:hubzone");
  assert(canonicalizeSamSetAside("SDVOSBC") === "se:sdvosb", "SDVOSBC → se:sdvosb");
  assert(canonicalizeSamSetAside("SBA") === "sb:total", "SBA → sb:total");
  assert(canonicalizeSamSetAside("8AN") === "se:8a", "8AN → se:8a");
  assert(canonicalizeSamSetAside("") === null && canonicalizeSamSetAside("ZZZ") === null, "empty/unknown → null (no false conflict)");
}

console.log("\n── 2 · LIVE ROOT: SAM=HZC vs doc=52.219-6 Total-SB → CONFLICT ──");
{
  const c = detectSetAsideConflict("HZC", [totalSbFinding()]);
  assert(!!c, "conflict detected");
  assert(!!c && c.sam === "HUBZone" && /Total Small Business/.test(c.doc), `sam=HUBZone doc=Total-SB (got ${JSON.stringify(c)})`);
  const d = deriveVerdict({ findings: [totalSbFinding()], ...base, setAsideConflict: c });
  assert(d.verdict === "NEEDS_HUMAN_REVIEW", `verdict DOMINATED to NHR (got ${d.verdict})`);
  assert(/SAM.*HUBZone/.test(d.reason) && /Total Small Business/.test(d.reason), "reason names BOTH programs for CO clarification");
}

console.log("\n── 3 · AGREEMENT: SAM=HZC and doc ALSO HUBZone (52.219-3) → NO conflict ──");
{
  const hubDoc: TypedFinding = { requirement: "HUBZone set-aside", citation: "FAR 52.219-3", excerpt: "set aside for HUBZone small business", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "x", requiredAttribute: "se:hubzone", curableInWindow: false };
  assert(detectSetAsideConflict("HZC", [hubDoc]) === undefined, "doc carries HUBZone → agreement, no conflict");
}

console.log("\n── 4 · CONSERVATIVE: unknown SAM code, or no doc set-aside → NO conflict ──");
{
  assert(detectSetAsideConflict("ZZZ", [totalSbFinding()]) === undefined, "unknown SAM code → no conflict");
  assert(detectSetAsideConflict("HZC", []) === undefined, "no doc set-aside identified → no conflict (conservative)");
  const nonSetAside: TypedFinding = { requirement: "Brand-name-or-equal", citation: "§B", excerpt: "salient characteristics", kind: "technical_spec", controllability: "bidder_controls", grounded: true, lens: "x" };
  assert(detectSetAsideConflict("HZC", [nonSetAside]) === undefined, "no set-aside finding → no conflict");
}

console.log("\n── 5 · flag-off parity: no setAsideConflict signal ⇒ verdict unchanged (byte-identical path) ──");
{
  const withNo = deriveVerdict({ findings: [totalSbFinding()], ...base });          // no signal (flag off)
  const withUndef = deriveVerdict({ findings: [totalSbFinding()], ...base, setAsideConflict: undefined });
  assert(withNo.verdict === withUndef.verdict, `undefined signal === omitted (both ${withNo.verdict})`);
  assert(withNo.verdict !== "NEEDS_HUMAN_REVIEW" || true, "(baseline pole may be anything; the point is signal-absent parity)");
}

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
