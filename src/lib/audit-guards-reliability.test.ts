// $0 PERMANENT REGRESSION for the three deterministic RELIABILITY guards (post card-291, W9126 arc):
//   Guard 1 — null-profile + detected set-aside → committal eligible=null (manifest-sourced, proposer-independent)
//   Guard 2 — routine-clause over-type downgrade (Availability-of-Funds no_one_can_move / bonding bidder_cannot_move)
//   Guard 3 — anthropic caller retries a NETWORK-LEVEL fetch throw (not just HTTP status), never an external abort
// Run: npx tsx src/lib/audit-guards-reliability.test.ts
import { deriveVerdict, applyRoutineClauseOvertypeGuard } from "./audit-decide";
import { disposeVerdict } from "./audit-dispose";
import { callStructuredClaude } from "./anthropic-structured";
import type { TypedFinding, VerdictInputs } from "./audit-findings";

let pass = 0, fail = 0;
const eq = (l: string, g: unknown, w: unknown) => { const okk = JSON.stringify(g) === JSON.stringify(w); okk ? pass++ : fail++; console.log(`${okk ? "✓" : "✗"} ${l}${okk ? "" : ` — got ${JSON.stringify(g)} want ${JSON.stringify(w)}`}`); };
const ok = (l: string, c: boolean) => eq(l, !!c, true);

const F = (over: Partial<TypedFinding>): TypedFinding => ({ requirement: "r", citation: "c", excerpt: "e", kind: "other", controllability: "bidder_controls", grounded: true, lens: "judgment", ...over });
const biddable: TypedFinding[] = [F({ requirement: "submit an offer", controllability: "bidder_controls", kind: "submission" })];
const base = (over: Partial<VerdictInputs>): VerdictInputs => ({ findings: biddable, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false, ...over });

const savedTristate = process.env.AUDIT_ELIGIBLE_TRISTATE;
const savedFetch = globalThis.fetch;

(async () => {
  // ── GUARD 1 — manifest-sourced eligibility clamp (bites only under the tristate) ──────────────────────
  process.env.AUDIT_ELIGIBLE_TRISTATE = "true";
  {
    const d = deriveVerdict(base({ detectedUnverifiableEligibilityGate: true }));
    ok("G1-1 tristate ON + gate → decided verdict (not honest-fail)", d.verdict === "BID" || d.verdict === "BID_WITH_CAUTION");
    eq("G1-1 tristate ON + gate → eligible=null (never a false eligible=true)", d.eligible, null);
    ok("G1-1 verify-caution surfaced in reason", /ELIGIBILITY NOT VERIFIED/.test(d.reason));
  }
  {
    const d = deriveVerdict(base({ detectedUnverifiableEligibilityGate: false }));
    eq("G1-2 tristate ON, no gate → eligible=true (unchanged; no false clamp)", d.eligible, true);
  }
  {
    const d = deriveVerdict(base({})); // undefined gate — every legacy caller
    eq("G1-3 tristate ON, gate undefined → eligible=true (byte-identical to pre-guard)", d.eligible, true);
  }
  // Flag-OFF (tristate OFF) — the clamp must be inert even with the gate asserted.
  process.env.AUDIT_ELIGIBLE_TRISTATE = savedTristate === "true" ? "true" : "false";
  delete process.env.AUDIT_ELIGIBLE_TRISTATE;
  {
    const d = deriveVerdict(base({ detectedUnverifiableEligibilityGate: true }));
    eq("G1-4 tristate OFF + gate → eligible=true (clamp inert without tristate — byte-identical)", d.eligible, true);
    ok("G1-4 no verify-caution when tristate OFF", !/ELIGIBILITY NOT VERIFIED/.test(d.reason));
  }

  // ── GUARD 1 (DISPOSE carry-through) — the caution-disagreement branch must not re-assert eligible=true ──
  {
    // proposer BID (eligible true) vs rail BID_WITH_CAUTION with the clamp (eligible null) → downgrade to
    // BID_WITH_CAUTION MUST carry eligible=null, not the old hardcoded true (which defeated Guard 1).
    const dz = disposeVerdict({ verdict: "BID", eligible: true, reason: "p" }, { verdict: "BID_WITH_CAUTION", eligible: null, reason: "r" });
    eq("G1-5 DISPOSE downgrade carries eligible=null when the rail clamped it", dz.eligible, null);
    eq("G1-5 DISPOSE downgrade verdict is BID_WITH_CAUTION", dz.verdict, "BID_WITH_CAUTION");
    // both sides genuinely eligible → downgrade still asserts eligible=true (no false clamp).
    const dz2 = disposeVerdict({ verdict: "BID", eligible: true, reason: "p" }, { verdict: "BID_WITH_CAUTION", eligible: true, reason: "r" });
    eq("G1-6 DISPOSE downgrade keeps eligible=true when both verified", dz2.eligible, true);
  }

  // ── GUARD 2 — routine-clause over-type downgrade ──────────────────────────────────────────────────────
  const funds = F({ requirement: "Availability of Funds", citation: "52.232-18", excerpt: "funds are not presently available", controllability: "no_one_can_move" });
  const bond = F({ requirement: "furnish a performance and payment bond", citation: "52.228-15", excerpt: "The Contractor shall furnish a performance bond", controllability: "bidder_cannot_move", requiredAttribute: "bond" });
  const soleSource = F({ requirement: "sole-source to the OEM", citation: "x", excerpt: "award will be made sole source to the named manufacturer", controllability: "no_one_can_move", universalDefect: "unmeetable_by_any_offeror" });
  const genuineBar = F({ requirement: "hold a Top Secret facility clearance", citation: "x", excerpt: "offeror must hold a facility security clearance", controllability: "bidder_cannot_move", requiredAttribute: "TS facility clearance" });

  {
    const g = applyRoutineClauseOvertypeGuard([funds, bond, soleSource, genuineBar], { enabled: true });
    eq("G2-1 Availability-of-Funds no_one_can_move → bidder_controls", g[0].controllability, "bidder_controls");
    ok("G2-1 marker set", g[0].routineClauseGuard === true);
    eq("G2-2 bonding bidder_cannot_move → bidder_controls", g[1].controllability, "bidder_controls");
    eq("G2-3 SAFETY: verified universal defect (sole-source) NOT downgraded", g[2].controllability, "no_one_can_move");
    eq("G2-4 SAFETY: genuine profile bar (clearance, no funds/bond token) NOT downgraded", g[3].controllability, "bidder_cannot_move");
  }
  {
    const g = applyRoutineClauseOvertypeGuard([funds, bond], { enabled: false });
    eq("G2-5 disabled (default) → funds unchanged (flag-OFF byte-identical)", g[0].controllability, "no_one_can_move");
    eq("G2-5 disabled (default) → bond unchanged", g[1].controllability, "bidder_cannot_move");
  }
  {
    // ADVERSARIAL NEGATIVES (Rule-69 panel): the excerpt-coincidence false-BID holes. The TRIGGER keys on
    // citation+requirement only, and a structural token anywhere keeps the bar — so a genuine bar whose grounded
    // excerpt merely QUOTES a neighboring routine clause must survive.
    const clearanceExcerptQuotesBond = F({
      requirement: "Offeror must hold an active Top Secret facility clearance before award", citation: "§H.4 / DD-254",
      excerpt: "The Contractor shall possess a TS facility clearance. The successful offeror shall furnish performance and payment bonds within 10 days per 52.228-15.",
      controllability: "bidder_cannot_move", kind: "eligibility_bar", requiredAttribute: "TS facility clearance", curableInWindow: false });
    const contradictoryExcerptQuotesFunds = F({
      requirement: "Required delivery date precedes the RFQ issue date — no offeror can deliver before the solicitation exists", citation: "§F",
      excerpt: "Prices are subject to the availability of funds for FY26. Delivery shall be completed by 01 OCT 2025.",
      controllability: "no_one_can_move", curableInWindow: false });
    const g = applyRoutineClauseOvertypeGuard([clearanceExcerptQuotesBond, contradictoryExcerptQuotesFunds], { enabled: true });
    eq("G2-7 SAFETY: clearance bar whose EXCERPT quotes the bonds clause STAYS a bar (excerpt-coincidence hole closed)", g[0].controllability, "bidder_cannot_move");
    eq("G2-8 SAFETY: contradictory no_one_can_move whose EXCERPT quotes availability-of-funds STAYS a bar", g[1].controllability, "no_one_can_move");
    // Second-pass negatives: a GENUINE non-curable bar whose OWN requirement co-states a routine bond/funds clause
    // (DoD construction+cyber bundles) must keep the bar — the comprehensive structural exclusion covers CMMC/ATO.
    const cmmcPlusBond = F({
      requirement: "The contractor shall maintain CMMC Level 2 certification at time of award and shall furnish performance and payment bonds.", citation: "DFARS 252.204-7021; FAR 52.228-15",
      controllability: "bidder_cannot_move", kind: "eligibility_bar", requiredAttribute: "CMMC Level 2", curableInWindow: false });
    const atoPlusFunds = F({
      requirement: "Offeror must hold an ATO; award is subject to the availability of appropriations.", citation: "52.232-19",
      controllability: "no_one_can_move", curableInWindow: false });
    const g2 = applyRoutineClauseOvertypeGuard([cmmcPlusBond, atoPlusFunds], { enabled: true });
    eq("G2-9 SAFETY: CMMC bar co-stating a bond clause in its requirement STAYS a bar", g2[0].controllability, "bidder_cannot_move");
    eq("G2-10 SAFETY: ATO bar co-stating availability-of-appropriations STAYS a bar", g2[1].controllability, "no_one_can_move");
  }
  {
    // End-to-end: a lone routine Availability-of-Funds no_one_can_move honest-fails (NHR) WITHOUT the guard;
    // downgraded to bidder_controls it becomes a decided BID (the false-honest-fail the guard closes).
    const before = deriveVerdict(base({ findings: [funds] }));
    const after = deriveVerdict(base({ findings: applyRoutineClauseOvertypeGuard([funds], { enabled: true }) }));
    ok("G2-6 without guard, routine funds clause does NOT decide BID", before.verdict !== "BID");
    eq("G2-6 with guard, routine funds clause → BID (decided, no false honest-fail)", after.verdict, "BID");
  }

  // ── GUARD 3 — anthropic caller retries a network-level fetch THROW ────────────────────────────────────
  const okResponse = () => ({ ok: true, json: async () => ({ content: [{ type: "text", text: JSON.stringify({ verdict: "BID" }) }], stop_reason: "end_turn", usage: {} }) });
  {
    let calls = 0;
    globalThis.fetch = (async () => { calls++; if (calls === 1) throw new TypeError("fetch failed"); return okResponse() as unknown as Response; }) as typeof fetch;
    const r = await callStructuredClaude({ apiKey: "k", model: "claude-haiku-4-5-20251001", system: "s", userPrompt: "u", schema: {}, maxTokens: 64, timeoutMs: 60000, label: "g3" });
    eq("G3-1 network throw is RETRIED then succeeds (calls=2)", calls, 2);
    ok("G3-1 returns the recovered result", r.text.includes("BID"));
  }
  {
    let calls = 0;
    const ac = new AbortController(); ac.abort();
    globalThis.fetch = (async () => { calls++; throw Object.assign(new Error("aborted"), { name: "AbortError" }); }) as typeof fetch;
    let threw = false;
    try { await callStructuredClaude({ apiKey: "k", model: "claude-haiku-4-5-20251001", system: "s", userPrompt: "u", schema: {}, maxTokens: 64, timeoutMs: 60000, label: "g3-abort", signal: ac.signal }); }
    catch { threw = true; }
    ok("G3-2 EXTERNAL abort throws (upstream cancellation respected)", threw);
    eq("G3-2 EXTERNAL abort is NOT retried (calls=1)", calls, 1);
  }
  {
    // ADVERSARIAL NEGATIVE (Rule-69 cost fix): an INTERNAL timeout surfaces as an AbortError with NO external
    // signal. It must NOT be retried — a timed-out call may have billed output tokens; re-firing would silently
    // re-spend up to MAX_RETRIES×. Only genuine (non-abort) network throws retry.
    let calls = 0;
    globalThis.fetch = (async () => { calls++; throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" }); }) as typeof fetch;
    let threw = false;
    try { await callStructuredClaude({ apiKey: "k", model: "claude-haiku-4-5-20251001", system: "s", userPrompt: "u", schema: {}, maxTokens: 64, timeoutMs: 60000, label: "g3-timeout" }); }
    catch { threw = true; }
    ok("G3-3 INTERNAL timeout-abort (no external signal) throws (honest-fail, no re-spend)", threw);
    eq("G3-3 INTERNAL timeout-abort is NOT retried (calls=1)", calls, 1);
  }

  // restore globals/env
  globalThis.fetch = savedFetch;
  if (savedTristate === undefined) delete process.env.AUDIT_ELIGIBLE_TRISTATE; else process.env.AUDIT_ELIGIBLE_TRISTATE = savedTristate;

  console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
  if (fail > 0) process.exit(1);
})();
