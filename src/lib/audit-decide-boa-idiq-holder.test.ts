// $0 REGRESSION for B2 — the BOA/IDIQ/BPA/GWAC HOLDER-STATUS keep-class inside the eligibility-authority allow-list
// (Brain card 421 Fork-2). Run: npx tsx src/lib/audit-decide-boa-idiq-holder.test.ts
//
// Doctrine (null / open-world doctrine): a hard bidder-eligibility bar keyed to HOLDER status on an existing
// acquisition vehicle (BOA/IDIQ/BPA/GWAC/MAS/FSS on-ramp) has NO FAR-19 authority — its authority is the vehicle's own
// ordering/eligibility terms. Without the keep-class the allow-list phantom-DEMOTES it to a caution (a silent
// downgrade of a genuine bar). Holder status is an UNSTATED profile attribute: under a null/open-world profile it is
// unknown ⇒ the bar must be KEPT and route to NEEDS_HUMAN_REVIEW ("confirm holder status"), NEVER a silent caution and
// NEVER INELIGIBLE (that needs closedWorld:true — a FUTURE path, not built here). Keeping is the conservative
// (zero-contract-loss) direction. Sub-flag `boaIdiqKeep` gated; default-OFF ⇒ the bar demotes exactly as it does today.
// Pure functions, flag INJECTED via opts (no env mutation).
import { applyEligibilityAuthorityAllowlist, deriveVerdict } from "./audit-decide";
import type { TypedFinding } from "./audit-findings";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const base = { bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as const;
const keepOn = (fs: TypedFinding[]) => applyEligibilityAuthorityAllowlist(fs, { enabled: true, boaIdiqKeep: true });
const keepOff = (fs: TypedFinding[]) => applyEligibilityAuthorityAllowlist(fs, { enabled: true, boaIdiqKeep: false }); // allow-list on, B2 off
const allOff = (fs: TypedFinding[]) => applyEligibilityAuthorityAllowlist(fs, { enabled: false });

// ── FA8137 findings[15] — the regression-lock target, VERBATIM from the live run (audit be69ce16). The lens emitted a
//    hard eligibility bar ("only BOA holders may propose"); the allow-list DEMOTED it to bidder_controls/caution +
//    the "[cited clause is not a recognized … authority]" annotation (see ceo/fa8137-run-be69ce16.json findings[15]).
//    This fixture reconstructs the PRE-demotion finding (controllability/curableInWindow/requirement restored). ──
const boaHolderBar = (): TypedFinding => ({
  requirement: "Must be a holder of the underlying Multiple Award Contract (MAC) Basic Ordering Agreement (BOA). This is an ITO (Invitation to Order) issued against a MAC BOA; only BOA holders may propose.",
  citation: "Section L, §1.1",
  excerpt: "The government plans to award a single construction order for the project described in the Order Proposal Request (OPR)… This ITO shall take precedence should there be any conflict between the Basic Ordering Agreement (BOA) and this ITO.",
  kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "former_ko",
  requiredAttribute: "vehicle:mac-boa-holder", curableInWindow: false,
});
// Other genuine holder-status phrasings that must ALSO be kept.
const idiqHolderBar = (): TypedFinding => ({
  requirement: "Competition is limited to holders of the parent IDIQ contract.",
  citation: "§ M.1", excerpt: "task orders are open only to IDIQ contract holders under vehicle W912-XX.",
  kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "ex_ko",
  requiredAttribute: "vehicle:idiq-holder", curableInWindow: false,
});
const gwacOnRampBar = (): TypedFinding => ({
  requirement: "Award restricted to GWAC awardees; the vehicle is not accepting on-ramp participants at this time.",
  citation: "§ L.2", excerpt: "only current GWAC holders (governmentwide acquisition contract) are eligible to compete.",
  kind: "eligibility_bar", controllability: "no_one_can_move", grounded: true, lens: "former_ko",
  requiredAttribute: "vehicle:gwac-holder", curableInWindow: false,
});
// The WTO phantom from the sibling test — NOT a holder bar → must STILL be demoted even with boaIdiqKeep ON.
const wtoPhantom = (): TypedFinding => ({
  requirement: "Items are not subject to the WTO GPA or Free Trade Agreements, per FAR 5.101(4)(iii).",
  citation: "Solicitation para 14(b)",
  excerpt: "The items are not subject to the WTO GPA and/or a Free Trade Agreement per FAR 5.101(4)(iii).",
  kind: "clause_flowdown", controllability: "no_one_can_move", grounded: true, lens: "former_ko",
});

console.log("\n── 1 · REGRESSION-LOCK: FA8137 findings[15] 'only BOA holders may propose' → KEPT as a bar (not demoted) ──");
{
  const g = keepOn([boaHolderBar()]);
  assert(g[0].controllability === "bidder_cannot_move" && !g[0].eligibilityAuthorityGuard && !g[0].cautionFloor,
    "BOA holder bar KEPT (bidder_cannot_move, no phantom-demote, no cautionFloor)");
  assert(g[0].requiredAttribute === "vehicle:mac-boa-holder", "requiredAttribute preserved (not cleared)");
  const d = deriveVerdict({ findings: g, ...base });
  assert(d.verdict === "NEEDS_HUMAN_REVIEW", `routes to NHR under null profile — confirm holder status (got ${d.verdict})`);
}

console.log("\n── 2 · sub-flag OFF (allow-list ON, boaIdiqKeep OFF): the BOA holder bar DEMOTES exactly as today ──");
{
  const g = keepOff([boaHolderBar()]);
  assert(g[0].controllability === "bidder_controls" && g[0].cautionFloor === true && g[0].eligibilityAuthorityGuard === true,
    "B2 OFF ⇒ phantom demotion unchanged (independent sub-flag; Rule 61)");
  // Byte-match to the LIVE artifact: the demotion appends the exact "[cited clause is not a recognized …]" annotation
  // seen in ceo/fa8137-run-be69ce16.json findings[15] — proves flag-OFF reproduces production behavior.
  assert(g[0].controllability === "bidder_controls" && g[0].curableInWindow === true &&
    /\[cited clause is not a recognized bidder-eligibility\/set-aside authority \(FAR 19 \/ 13 CFR 121-128\); treated as informational, not a show-stopper — confirm\]$/.test(g[0].requirement),
    "flag-OFF output byte-matches the live FA8137 demoted finding (controllability/curable/annotation)");
}

console.log("\n── 3 · IDIQ-holder + GWAC on-ramp phrasings → also KEPT ──");
{
  for (const mk of [idiqHolderBar, gwacOnRampBar]) {
    const g = keepOn([mk()]);
    assert(!g[0].eligibilityAuthorityGuard && g[0].controllability === mk().controllability, `KEEP: ${mk.name}`);
  }
}

console.log("\n── 4 · SCOPE: a non-holder phantom (WTO/FAR-5.101) is STILL demoted with boaIdiqKeep ON ──");
{
  const g = keepOn([wtoPhantom()]);
  assert(g[0].controllability === "bidder_controls" && g[0].eligibilityAuthorityGuard === true,
    "keep-class is scoped to holder bars — the WTO phantom still re-types off the bar path");
}

console.log("\n── 5 · allow-list OFF entirely → byte-identical on every input ──");
{
  for (const mk of [boaHolderBar, idiqHolderBar, gwacOnRampBar, wtoPhantom]) {
    const o = allOff([mk()]);
    assert(JSON.stringify(o) === JSON.stringify([mk()]), `${mk.name}: unchanged when allow-list OFF`);
  }
}

console.log("\n── 6 · NO OVER-FIRE: a benign informational BOA mention (not a holder restriction) does NOT match the RE ──");
{
  // These strings mention a vehicle but assert NO holder-eligibility restriction. Modeled as hard bars to prove the
  // keep-class does not widen — a false-typed benign bar must fall through to the existing demotion, not be kept.
  const benign: Array<[string, TypedFinding]> = [
    ["orders issued against a BOA", { requirement: "Orders will be issued against the resulting BOA on a first-come basis.", citation: "§B", excerpt: "the Government will place orders against the resulting BOA.", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "former_ko" }],
    ["informational IDIQ ceiling", { requirement: "The IDIQ ceiling is $50M over five years.", citation: "§B", excerpt: "total contract ceiling across the ordering period is $50,000,000.", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "ex_ko" }],
    // Fast-follow lock: bare "only" after a vehicle acronym was dropped from the RE — this benign IDIQ funding note
    // ("orders are only issued after funds…") must NOT be kept (would have over-fired on the old `IDIQ … only` token).
    ["benign IDIQ funding note (only-issued)", { requirement: "This IDIQ has a $50M ceiling; orders are only issued after funds are available.", citation: "§B", excerpt: "orders will only be issued when funding is available under the IDIQ.", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "ex_ko" }],
  ];
  for (const [name, f] of benign) {
    const g = keepOn([f]);
    assert(g[0].eligibilityAuthorityGuard === true, `benign '${name}' NOT kept by B2 → falls through to demotion (no over-fire)`);
  }
}

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
