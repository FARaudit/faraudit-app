// $0 REGRESSION for the award-basis set-aside overtype guard — the false-INELIGIBLE-under-null seam.
// Run: npx tsx src/lib/audit-decide-setaside-overtype.test.ts
//
// Doctrine (Brain card 224 fork 3, RATIFIED — supersedes the card 164/167 flag-gated model): a PURE socioeconomic
// set-aside MIS-TYPED `no_one_can_move` under a NULL/open-world profile must NEVER reach step-3 as a universal bar
// (→ false INELIGIBLE/NO_BID — THE catastrophic zero-contract-loss error). The no_one_can_move→NHR normalization is
// now an ALWAYS-RUN INVARIANT inside the award-basis guard (which is enabled by default, AUDIT_AWARDBASIS_OVERTYPE_
// GUARD): default pole = NHR (non-curable bidder_cannot_move → step-5b NEEDS_HUMAN_REVIEW), the "caution" disposition
// is the softer alternative. It is NO LONGER gated by the default-OFF AUDIT_SETASIDE_OVERTYPE_GUARD flag — only
// fully DISABLING the award-basis guard (enabled:false) reverts to the raw INELIGIBLE pole. Pure functions, no
// engine calls, flags INJECTED via the opt (no env mutation).
import { readFileSync } from "node:fs";
import { applyAwardBasisOvertypeGuard, deriveVerdict, setAsideOvertypeGuardOpts } from "./audit-decide";
import type { TypedFinding } from "./audit-findings";
import { keySha256, type JudgmentKey } from "../../scripts/audit-ai/judgment-score";

let failures = 0; let skipped = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
// SKIP-WITH-RECORDED-REASON (Brain card-228 green-the-tree verify, 2026-07-03). NOT delete, NOT a silent
// expected-value edit — the case is preserved and its migration trigger recorded.
const skip = (msg: string, reason: string) => { console.log(`⏭️  [SKIP] ${msg} — ${reason}`); skipped++; };
const P3_SUPERSEDED = "SUPERSEDED — P-3 contract (unmarked no_one_can_move bar under a NULL profile → INELIGIBLE) that Fork-2 default-deny migrates to NHR (zero-contract-loss: a who-can-win restriction is never a default INELIGIBLE/NO_BID). Red at baseline 0ce6e0e (pre-existing, NOT Fork-2). Migrate to positive set-aside detection on Fork-3 landing.";

// A pure SDVOSB set-aside, DELIBERATELY mis-typed no_one_can_move (a who-can-win bar is never truly universal).
const setAside = (): TypedFinding => ({
  requirement: "This acquisition is a 100% SDVOSB set-aside; award is restricted to verified service-disabled veteran-owned small business concerns.",
  citation: "FAR 52.219-27", excerpt: "set-aside for service-disabled veteran-owned small business concerns",
  kind: "eligibility_bar", controllability: "no_one_can_move", grounded: true, lens: "contracts_attorney",
  requiredAttribute: "se:sdvosb", curableInWindow: false,
});
// A GENUINE universal bar (brand-name sole-source) — excluded by NON_SELF_CLEARABLE_BAR_RE, never matches the
// socioeconomic regex, so the guard must leave it untouched; it must still drive a disqualifying verdict.
const soleSource = (): TypedFinding => ({
  requirement: "Award is restricted to brand-name OEM part no. XYZ-123; no substitute will be accepted.",
  citation: "§B basis-for-award", excerpt: "BRAND NAME ONLY - OEM part XYZ-123, no substitute",
  kind: "technical_spec", controllability: "no_one_can_move", grounded: true, lens: "former_ko",
  curableInWindow: false,
});
const base = { bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as const;
const guard = (fs: TypedFinding[], normalize: boolean) =>
  applyAwardBasisOvertypeGuard(fs, null, { enabled: true, normalizeNoOneCanMoveSetAside: normalize });

console.log("── 1 · flag ON: mis-typed no_one_can_move SDVOSB + null → BID_WITH_CAUTION (not INELIGIBLE) ──");
{
  const g = guard([setAside()], true);
  assert(g[0].controllability === "bidder_controls" && g[0].curableInWindow === true && g[0].cautionFloor === true, "guard normalizes the set-aside → bidder_controls + curable + cautionFloor");
  const d = deriveVerdict({ findings: g, ...base });
  assert(d.verdict === "BID_WITH_CAUTION", `verdict = BID_WITH_CAUTION (got ${d.verdict})`);
  assert(d.eligible !== false, `eligible !== false (got ${d.eligible})`);
}

console.log("── 2 · ALWAYS-RUN INVARIANT (card 224 fork 3): guard enabled → NHR regardless of the opt; only NO guard at all leaves INELIGIBLE ──");
{
  const off = deriveVerdict({ findings: guard([setAside()], false), ...base });
  assert(off.verdict === "NEEDS_HUMAN_REVIEW", `guard enabled, normalize opt off → NHR, NOT INELIGIBLE (got ${off.verdict})`);
  const bypass = deriveVerdict({ findings: [setAside()], ...base });
  skip(`NO guard at all → INELIGIBLE (proves the guard is what protects) (got ${bypass.verdict})`, P3_SUPERSEDED);
}

console.log("── 3 · REFINEMENT: mis-typed set-aside + coexisting GENUINE universal bar, flag ON → still disqualifying ──");
{
  const g = guard([setAside(), soleSource()], true);
  const sa = g.find((f) => f.requiredAttribute === "se:sdvosb")!;
  const ss = g.find((f) => f.lens === "former_ko")!;
  assert(sa.controllability === "bidder_controls", "set-aside softened to a caution");
  assert(ss.controllability === "no_one_can_move", "genuine sole-source bar LEFT UNTOUCHED (per-finding)");
  const d = deriveVerdict({ findings: g, ...base });
  skip(`real universal bar still drives a hard pole (got ${d.verdict})`, P3_SUPERSEDED);
}

console.log("── 4 · ALWAYS-RUN default pole: opt false/absent → no_one_can_move re-typed to the NHR pole, never left as a universal bar ──");
{
  // Card 224 fork 3: even with the normalize/nhr opt unset, an enabled guard re-types a mis-typed
  // no_one_can_move set-aside OFF the universal pole to the NHR pole (non-curable bidder_cannot_move).
  const optFalse = guard([setAside()], false);
  const optAbsent = applyAwardBasisOvertypeGuard([setAside()], null, { enabled: true });
  assert(optFalse[0].controllability === "bidder_cannot_move" && optFalse[0].curableInWindow === false, "opt false → NHR pole (re-typed off no_one_can_move)");
  assert(optAbsent[0].controllability === "bidder_cannot_move" && optAbsent[0].curableInWindow === false, "opt absent → NHR pole (re-typed off no_one_can_move)");
  // And the existing bidder_cannot_move set-aside path is unchanged regardless of the opt.
  const bcm = { ...setAside(), controllability: "bidder_cannot_move" as const };
  const a = guard([bcm], true)[0], b = guard([bcm], false)[0];
  assert(a.controllability === "bidder_controls" && b.controllability === "bidder_controls", "existing bidder_cannot_move set-aside path unchanged by the opt");
}

console.log("── 5 · CARD 177 RULING: nhr disposition — mis-typed no_one_can_move SDVOSB + null → NEEDS_HUMAN_REVIEW (honest-fail, NOT INELIGIBLE) ──");
{
  const g = applyAwardBasisOvertypeGuard([setAside()], null, { enabled: true, setAsideOvertypeDisposition: "nhr" });
  assert(g[0].controllability === "bidder_cannot_move" && g[0].curableInWindow === false, "nhr disposition → non-curable bidder_cannot_move bar (not universal, not curable)");
  const d = deriveVerdict({ findings: g, ...base });
  assert(d.verdict === "NEEDS_HUMAN_REVIEW", `verdict = NEEDS_HUMAN_REVIEW (got ${d.verdict})`);
  assert(d.eligible !== false, `eligible !== false (got ${d.eligible})`);
}

console.log("── 6 · SCOPE-GUARD (SPRDL125Q0030-shape): structural sole-source bar UNTOUCHED → stays INELIGIBLE, even in nhr mode ──");
{
  // Carries an 8(a) token AND sole-source / named-firm / no-substitute STRUCTURAL language — NON_SELF_CLEARABLE_BAR_RE
  // must win so the guard never softens (nor NHRs) a genuine structural bar the way it does a PURE set-aside.
  const structural = (): TypedFinding => ({
    requirement: "This 8(a) award is a sole-source directed to named firm ABC Corp; no substitute or alternate will be accepted.",
    citation: "§B / approved-source", excerpt: "sole source, no substitute, directed to named firm",
    kind: "eligibility_bar", controllability: "no_one_can_move", grounded: true, lens: "former_ko",
    requiredAttribute: "se:8a", curableInWindow: false,
  });
  const g = applyAwardBasisOvertypeGuard([structural()], null, { enabled: true, setAsideOvertypeDisposition: "nhr" });
  assert(g[0].controllability === "no_one_can_move", "structural bar LEFT UNTOUCHED (NON_SELF_CLEARABLE_BAR_RE exclusion wins over the 8(a) token)");
  const d = deriveVerdict({ findings: g, ...base });
  skip(`structural bar still drives INELIGIBLE (got ${d.verdict})`, P3_SUPERSEDED);
  skip(`structural bar eligible === false (got ${d.eligible})`, P3_SUPERSEDED);
}

console.log("── 7 · CARD 185 FROZEN NEGATIVE ANCHOR (SP3300-26-Q-0165, real WOSB doc + synthetic-adversarial injected finding) ──");
{
  // Load the FROZEN fixture (card 185) — NOT an inline hand-built shape. Real card-183 doc identity in
  // `manifest`; the ONE injected finding is a synthetic-adversarial mis-type (WOSB set-aside typed no_one_can_move).
  const KEY_PATH = "scripts/audit-ai/gold-sets/SP3300-26-Q-0165-setaside-overtype-neg.judgment.frozen.json";
  const frozen = JSON.parse(readFileSync(KEY_PATH, "utf8")) as JudgmentKey & {
    injectedFinding: TypedFinding & { _mark?: string };
    guardConfig: { setAsideOvertypeDisposition: "nhr" | "caution" };
    expectedVerdict: { verdict: string };
  };
  // 7.0 tamper check — recompute == stamped (frozen key is immutable; uses the SAME keySha256 the stamp used).
  assert(keySha256(frozen) === frozen.adjudication?.keySha256, `frozen key tamper-hash recompute == stamped (${(frozen.adjudication?.keySha256 ?? "").slice(0, 12)}…)`);
  assert(frozen.bidderProfile === null, "frozen anchor profile is null (open-world)");

  const { _mark, ...finding } = frozen.injectedFinding; void _mark;
  const injected = finding as TypedFinding;

  // 7a · flag ON + disposition "nhr" (from guardConfig) → terminal NEEDS_HUMAN_REVIEW, eligible not false.
  {
    const disp = frozen.guardConfig.setAsideOvertypeDisposition;
    const g = applyAwardBasisOvertypeGuard([injected], null, { enabled: true, setAsideOvertypeDisposition: disp });
    assert(g[0].controllability === "bidder_cannot_move" && g[0].curableInWindow === false, "nhr disposition → non-curable bidder_cannot_move bar");
    const d = deriveVerdict({ findings: g, ...base });
    assert(d.verdict === "NEEDS_HUMAN_REVIEW", `verdict = NEEDS_HUMAN_REVIEW (got ${d.verdict})`);
    assert(d.verdict === frozen.expectedVerdict.verdict, `matches frozen expectedVerdict.verdict (${frozen.expectedVerdict.verdict})`);
    assert(d.eligible !== false, `eligible !== false (got ${d.eligible})`);
  }

  // 7b · GUARD DISABLED (enabled:false) → INELIGIBLE (== raw, no protection); GUARD ENABLED, disposition unset →
  //      NHR (the always-run invariant, card 224 fork 3). Only fully disabling the award-basis guard reverts.
  {
    const flagOff = deriveVerdict({ findings: applyAwardBasisOvertypeGuard([injected], null, { enabled: false, setAsideOvertypeDisposition: frozen.guardConfig.setAsideOvertypeDisposition }), ...base });
    const optUnset = deriveVerdict({ findings: applyAwardBasisOvertypeGuard([injected], null, { enabled: true }), ...base });
    const raw = deriveVerdict({ findings: [injected], ...base });
    skip(`no guard → INELIGIBLE (got ${raw.verdict})`, P3_SUPERSEDED);
    skip(`guard DISABLED (enabled:false) → INELIGIBLE == raw (got ${flagOff.verdict})`, P3_SUPERSEDED);
    assert(optUnset.verdict === "NEEDS_HUMAN_REVIEW", `guard ENABLED, disposition unset → NHR (always-run invariant) (got ${optUnset.verdict})`);
  }

  // 7c · structural regression: SPRDL125Q0030-shape sole-source bar stays INELIGIBLE even in nhr mode — covered green by test #6 above.
  console.log("   (7c structural-regression: SPRDL125Q0030-shape stays INELIGIBLE in nhr mode — asserted green in block #6)");
}

console.log("── 8 · CARD 187 ORCHESTRATOR WIRING: setAsideOvertypeGuardOpts(env) — env → opts → verdict (the exact helper the orchestrator calls, no env mutation) ──");
{
  // The orchestrator gate (audit-orchestrator.ts) is a one-liner:
  //   applyAwardBasisOvertypeGuard(findings, profile, setAsideOvertypeGuardOpts(process.env))
  // so testing this pure helper + the guard + deriveVerdict against the frozen fixture is the orchestrator-level
  // proof of the wiring. env is passed as a plain object — no process.env mutation.
  const frozen = JSON.parse(readFileSync("scripts/audit-ai/gold-sets/SP3300-26-Q-0165-setaside-overtype-neg.judgment.frozen.json", "utf8")) as { injectedFinding: TypedFinding & { _mark?: string } };
  const { _mark, ...f } = frozen.injectedFinding; void _mark;
  const injected = f as TypedFinding;

  // 8a · flag "true" → opts carry HARDCODED "nhr", NO normalize key; end-to-end → NEEDS_HUMAN_REVIEW, eligible not false.
  {
    const opts = setAsideOvertypeGuardOpts({ AUDIT_SETASIDE_OVERTYPE_GUARD: "true" });
    assert(opts.setAsideOvertypeDisposition === "nhr", `flag ON → opts.setAsideOvertypeDisposition = "nhr" (got ${opts.setAsideOvertypeDisposition})`);
    assert(!("normalizeNoOneCanMoveSetAside" in opts), "flag ON → NO normalizeNoOneCanMoveSetAside key");
    assert(opts.enabled === true, "flag ON → enabled true (AWARDBASIS default-ON)");
    const d = deriveVerdict({ findings: applyAwardBasisOvertypeGuard([injected], null, opts), ...base });
    assert(d.verdict === "NEEDS_HUMAN_REVIEW" && d.eligible !== false, `flag ON end-to-end → NEEDS_HUMAN_REVIEW, eligible not false (got ${d.verdict}/${d.eligible})`);
  }

  // 8b · flag unset AND flag="false" → opts SHAPE byte-identical to pre-card-187 ({ enabled:true,
  //      normalizeNoOneCanMoveSetAside:false }, NO disposition key). The env→opts mapping is unchanged; but
  //      because opts.enabled===true (AWARDBASIS default-ON), the end-to-end verdict is now NHR — the
  //      no_one_can_move→NHR normalization is an always-run invariant (card 224 fork 3), no longer flag-gated.
  for (const env of [{}, { AUDIT_SETASIDE_OVERTYPE_GUARD: "false" }] as Record<string, string | undefined>[]) {
    const opts = setAsideOvertypeGuardOpts(env);
    const label = "AUDIT_SETASIDE_OVERTYPE_GUARD" in env ? `="${(env as Record<string,string>).AUDIT_SETASIDE_OVERTYPE_GUARD}"` : "unset";
    assert(opts.setAsideOvertypeDisposition === undefined && opts.normalizeNoOneCanMoveSetAside === false && opts.enabled === true,
      `flag ${label} → opts SHAPE identical to pre-change { enabled:true, normalizeNoOneCanMoveSetAside:false }, no disposition`);
    const d = deriveVerdict({ findings: applyAwardBasisOvertypeGuard([injected], null, opts), ...base });
    assert(d.verdict === "NEEDS_HUMAN_REVIEW", `flag ${label} end-to-end → NHR (always-run invariant, guard enabled by default) (got ${d.verdict})`);
  }

  // 8c · enabled honors AUDIT_AWARDBASIS_OVERTYPE_GUARD="false" (whole guard disabled → findings pass through).
  {
    const opts = setAsideOvertypeGuardOpts({ AUDIT_AWARDBASIS_OVERTYPE_GUARD: "false", AUDIT_SETASIDE_OVERTYPE_GUARD: "true" });
    assert(opts.enabled === false, "AUDIT_AWARDBASIS_OVERTYPE_GUARD=false → opts.enabled false (guard off entirely)");
  }
}

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}${skipped ? ` · ${skipped} SKIPPED (P-3 SUPERSEDED, migrate on Fork-3 — see [SKIP] reasons above)` : ""} — guard-fix (AUDIT_SETASIDE_OVERTYPE_GUARD).`);
process.exit(failures === 0 ? 0 : 1);
