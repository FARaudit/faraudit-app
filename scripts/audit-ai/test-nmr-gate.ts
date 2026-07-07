// $0 gate for the WIRED Fork-7 NMR mechanism (Brain card 240 + card 242 ruling).
//   npx tsx scripts/audit-ai/test-nmr-gate.ts
//
// Brain card 242 RETIRED the card-132 `applyNonmanufacturerRuleGate` (the SAM-facts cautionFloor emitter). This
// gate now proves the SINGLE replacement mechanism, WIRED THROUGH THE ORCHESTRATOR (runAgenticAudit), not just unit:
//   • the deterministic keyfact detector is the SOLE NMR-attribute emitter;
//   • applyNmrSingleEmitter + applyNmrFirmStatusGate type it onto the Fork-3 who-can-win path;
//   • compliant → BID/eligible=true (P-8 KILLED, POST-WIRING) · canonical-noncompliant → INELIGIBLE (attribute-specific)
//     · unknown/null → NHR with curability text · synonym token → NHR (Finding-1 wall, never false INELIGIBLE);
//   • flag OFF ⇒ byte-identical (the keyfact NMR keeps its card-206-A unverified-gate path).
//   • I0/I1 MIGRATION (card 236 discipline): the old card-132 integration cases (no-NMR→BID; NMR-floors→CAUTION)
//     migrate to their empirically-confirmed new verdicts (BID unchanged; NMR under a null profile → NHR).

import { deriveVerdict, applyNmrSingleEmitter, applyNmrFirmStatusGate, NMR_ATTRIBUTE } from "@/lib/audit-decide";
import type { TypedFinding, BidderProfile, VerdictInputs } from "@/lib/audit-findings";
import { runAgenticAudit } from "@/lib/audit-orchestrator";
import { type CallModel, type RawFinding } from "@/lib/audit-expert";
import type { AuditToolContext } from "@/lib/audit-tools";

let pass = 0; const fails: string[] = [];
const eq = (label: string, got: unknown, exp: unknown) => { if (JSON.stringify(got) === JSON.stringify(exp)) pass++; else fails.push(`${label}: got ${JSON.stringify(got)} exp ${JSON.stringify(exp)}`); };
const ok = (label: string, cond: boolean) => { if (cond) pass++; else fails.push(label); };
// I0/I1 MIGRATION LEDGER (card 236 discipline): empirical live verdict computed BEFORE the assertion, table printed.
const mig: Array<{ assert: string; from: string; to: string }> = [];

// ── UNIT: single-emitter + firm-status gate, keyed on the NMR attribute (order-independent) ──
const nmr = (over: Partial<TypedFinding> = {}): TypedFinding => ({
  requirement: "Non-Manufacturer Rule (FAR 52.219-33): a nonmanufacturer must supply a small U.S. manufacturer's end item.",
  citation: "FAR 52.219-33 · 13 CFR 121.406(b)", excerpt: "the non-manufacturer rule applies to this small-business set-aside supply acquisition",
  kind: "eligibility_bar", controllability: "bidder_controls", requiredAttribute: NMR_ATTRIBUTE, curableInWindow: true, grounded: true, lens: "keyfact_detector", ...over,
});
const gate = (fs: TypedFinding[], p: BidderProfile | null) => applyNmrFirmStatusGate(applyNmrSingleEmitter(fs), p, { enabled: true });
const inp = (fs: TypedFinding[], p: BidderProfile | null): VerdictInputs => ({ findings: gate(fs, p), bidderProfile: p, coverageComplete: true, verifierSound: true, conflict: false, manifestComplete: true });
const withTristate = <T>(fn: () => T): T => { const prev = process.env.AUDIT_ELIGIBLE_TRISTATE; process.env.AUDIT_ELIGIBLE_TRISTATE = "true"; try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_ELIGIBLE_TRISTATE; else process.env.AUDIT_ELIGIBLE_TRISTATE = prev; } };

withTristate(() => {
  eq("U-single: a model-lens NMR attribute is stripped to advisory when keyfact also emits (one canonical carrier)",
    applyNmrSingleEmitter([{ ...nmr(), lens: "small_business_counsel" }, nmr()]).filter((f) => f.requiredAttribute === NMR_ATTRIBUTE).length, 1);
  eq("U-compliant: firmStatus satisfies → BID / eligible=true (P-8 killed)", (() => { const d = deriveVerdict(inp([nmr()], { satisfiedAttributes: [NMR_ATTRIBUTE] })); return [d.verdict, d.eligible]; })(), ["BID", true]);
  eq("U-noncompliant: POSITIVE canonical non-compliance token → INELIGIBLE / eligible=false", (() => { const d = deriveVerdict(inp([nmr()], { satisfiedAttributes: ["nonmanufacturer:noncompliant"], openWorld: false })); return [d.verdict, d.eligible]; })(), ["INELIGIBLE", false]);
  eq("U-absence: closed-world with NO NMR token → NHR (absence ≠ ineligible, review-hardened)", deriveVerdict(inp([nmr()], { satisfiedAttributes: ["some clearance"], openWorld: false })).verdict, "NEEDS_HUMAN_REVIEW");
  eq("U-unknown: null profile → NEEDS_HUMAN_REVIEW", deriveVerdict(inp([nmr()], null)).verdict, "NEEDS_HUMAN_REVIEW");
});

// ── deriveVerdict INTEGRATION (the card-132 I-series, now on the NEW mechanism) ──
// A non-NMR clean base (gate-to-clear facts) — a clean BID's worth.
const base: TypedFinding[] = [
  { requirement: "submit pricing for all CLINs", citation: "§B", excerpt: "pricing", kind: "pricing", controllability: "bidder_controls", grounded: true, lens: "capture" },
  { requirement: "Certificate of Conformance", citation: "§L", excerpt: "CoC", kind: "submission", controllability: "bidder_controls", grounded: true, lens: "ko" },
];
withTristate(() => {
  const i0 = deriveVerdict(inp(base, null)).verdict;               // no NMR
  mig.push({ assert: "I0 clean base, no NMR, null profile", from: "BID", to: i0 });
  eq("I0 clean base (no NMR) → BID (unchanged)", i0, "BID");
  const i1 = deriveVerdict(inp([...base, nmr()], null)).verdict;   // NMR present, null profile
  mig.push({ assert: "I1 base + NMR, null profile (was card-132 CAUTION floor)", from: "BID_WITH_CAUTION", to: i1 });
  eq("I1 NMR under null profile → NEEDS_HUMAN_REVIEW (migrated from the card-132 CAUTION floor)", i1, "NEEDS_HUMAN_REVIEW");
});

// ── WIRED + VERIFY-SAFE: runAgenticAudit is the SOLE NMR mechanism; the flag types it end-to-end ──
const SRC = [
  "SECTION B - SUPPLIES AND PRICES", "Offerors shall submit pricing for all CLINs 0001 through 0005.",
  "SECTION C - STATEMENT OF WORK", "The contractor shall furnish one mini-excavator with a fully enclosed cab.",
  "SECTION I - CONTRACT CLAUSES", "52.219-33 Non-Manufacturer Rule applies to this Total Small Business Set-Aside supply acquisition.",
  "SECTION L - INSTRUCTIONS TO OFFERORS", "Submit a Certificate of Conformance with the offer.",
  "SECTION M - EVALUATION FACTORS", "Award will be made on a Lowest-Priced Technically Acceptable basis.",
].join("\n");
const ctx: AuditToolContext = { fullSource: SRC };
const RF: Record<string, RawFinding> = {
  price: { requirement: "submit pricing for all CLINs", citation: "§B", excerpt: "pricing for all CLINs", kind: "pricing", controllability: "bidder_controls" },
  cab:   { requirement: "enclosed cab", citation: "§C", excerpt: "fully enclosed cab", kind: "technical_spec", controllability: "bidder_controls" },
  // T1-12 — §L/§M are certified per-obligation (≥4-word verbatim grounding), not by a loose covered_direct.
  // A real lens grounds an obligation with its full verbatim source span, so the excerpt is the whole §L
  // sentence (a 3-word "Certificate of Conformance" no longer grounds "Submit a Certificate of Conformance…").
  coc:   { requirement: "Certificate of Conformance", citation: "§L", excerpt: "Submit a Certificate of Conformance with the offer", kind: "submission", controllability: "bidder_controls" },
  eval:  { requirement: "LPTA evaluation", citation: "§M", excerpt: "Lowest-Priced Technically Acceptable", kind: "other", controllability: "bidder_controls" },
};
const ALL = ["B", "C", "I", "L", "M"];
const stub: CallModel = async ({ system, priorToolResults }) =>
  priorToolResults.length === 0
    ? { toolCalls: ALL.map((k) => ({ id: `r${k}`, name: "read_section", input: { key: k } })), findings: null }
    : { toolCalls: [], findings: ({ LENS_A: [RF.price, RF.cab], LENS_B: [RF.coc, RF.eval] } as Record<string, RawFinding[]>)[system] ?? [] };
const experts = [{ key: "capture", system: "LENS_A" }, { key: "ko", system: "LENS_B" }];
const nmrCount = (fs: TypedFinding[]) => fs.filter((f) => f.requiredAttribute === NMR_ATTRIBUTE).length;

const withEnv = async (env: Record<string, string | undefined>, fn: () => Promise<void>) => {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) { prev[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]!; }
  try { await fn(); } finally { for (const k of Object.keys(prev)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]!; } }
};
const WIRED = { AUDIT_KEYFACT_DETECTOR: "true", AUDIT_NMR_FIRMSTATUS_GATE: "true", AUDIT_ELIGIBLE_TRISTATE: "true" };

(async () => {
  // W-emitter: the keyfact detector emits exactly ONE NMR attribute from the source (sole emitter).
  await withEnv(WIRED, async () => {
    const compliant = await runAgenticAudit({ ctx, experts, callModel: stub, naics: "336413", setAside: "Total Small Business Set-Aside", bidderProfile: { satisfiedAttributes: [NMR_ATTRIBUTE] } });
    eq("W-emitter: exactly one NMR attribute emitted (keyfact = sole emitter)", nmrCount(compliant.findings), 1);
    // W-compliant (THE P-8 NEGATIVE, POST-WIRING, orchestrator path): compliant firm → BID / eligible=true.
    eq("W-compliant: wired orchestrator path → BID", compliant.decision.verdict, "BID");
    eq("W-compliant: P-8 KILLED end-to-end → eligible=true (was null forever)", compliant.decision.eligible, true);

    // W-noncompliant: a POSITIVE canonical non-compliance token → INELIGIBLE with an attribute-specific reason.
    const nonc = await runAgenticAudit({ ctx, experts, callModel: stub, naics: "336413", setAside: "Total Small Business Set-Aside", bidderProfile: { satisfiedAttributes: ["nonmanufacturer:noncompliant"], openWorld: false } });
    eq("W-noncompliant: POSITIVE canonical non-compliance token → INELIGIBLE", nonc.decision.verdict, "INELIGIBLE");
    ok("W-noncompliant: reason names the NMR attribute (attribute-specific, no category claim)", /nonmanufacturer:compliant/i.test(nonc.decision.reason) && !/who-can-win/i.test(nonc.decision.reason));
    // W-absence: closed-world with an unrelated attribute (NO NMR token) → NHR, never a false INELIGIBLE (review-hardened).
    const absent = await runAgenticAudit({ ctx, experts, callModel: stub, naics: "336413", setAside: "Total Small Business Set-Aside", bidderProfile: { satisfiedAttributes: ["Top Secret facility clearance"], openWorld: false } });
    eq("W-absence: closed-world, NO NMR token → NHR (absence ≠ ineligible)", absent.decision.verdict, "NEEDS_HUMAN_REVIEW");

    // W-unknown: null profile → NHR with the curability path (not the lead-time framing), never NO_BID.
    const unk = await runAgenticAudit({ ctx, experts, callModel: stub, naics: "336413", setAside: "Total Small Business Set-Aside", bidderProfile: null });
    eq("W-unknown: null profile → NEEDS_HUMAN_REVIEW", unk.decision.verdict, "NEEDS_HUMAN_REVIEW");
    ok("W-unknown: NHR reason carries NMR curability (supply a small U.S. manufacturer's product)", /supplying a small u\.s\. manufacturer/i.test(unk.decision.reason) && !/lead time exceeds/i.test(unk.decision.reason));
    ok("W-unknown: never NO_BID", unk.decision.verdict !== "NO_BID");

    // W-synonym (Finding-1 WALL): a closed-world firm asserting NMR status in an UNRECOGNIZED form → NHR, never INELIGIBLE.
    const syn = await runAgenticAudit({ ctx, experts, callModel: stub, naics: "336413", setAside: "Total Small Business Set-Aside", bidderProfile: { satisfiedAttributes: ["nonmanufacturer-ok"], openWorld: false } });
    eq("W-synonym: closed-world synonym token → NHR (never false INELIGIBLE)", syn.decision.verdict, "NEEDS_HUMAN_REVIEW");
    ok("W-synonym: NOT INELIGIBLE (walk-away-error wall holds through the orchestrator)", syn.decision.verdict !== "INELIGIBLE");
  });

  // W-off: flag OFF ⇒ byte-identical — the keyfact NMR keeps its card-206-A unverified-gate path (eligible=null caution),
  //        the who-can-win typing NEVER runs, verdict is NOT a hard pole.
  await withEnv({ AUDIT_KEYFACT_DETECTOR: "true", AUDIT_NMR_FIRMSTATUS_GATE: undefined, AUDIT_ELIGIBLE_TRISTATE: "true" }, async () => {
    const off = await runAgenticAudit({ ctx, experts, callModel: stub, naics: "336413", setAside: "Total Small Business Set-Aside", bidderProfile: null });
    ok("W-off: gate OFF → NMR is NOT a hard pole (no INELIGIBLE/NO_BID) — byte-identical card-206-A path", off.decision.verdict !== "INELIGIBLE" && off.decision.verdict !== "NO_BID");
    eq("W-off: gate OFF → NMR attribute still emitted by keyfact (sole emitter), just not who-can-win typed", nmrCount(off.findings), 1);
    // BYTE-IDENTITY (adversarial review Finding 2): gate OFF + a NON-NULL profile self-asserting NMR in synonym form.
    // The firmStatus NMR branch is gated on nmrGuard (only set by the Fork-7 gate), so with the gate OFF it is INERT
    // — the NMR stays on its card-206-A unverified-gate path → eligible=null (NOT the over-green eligible=true the
    // un-gated branch would have produced). This is the flag-off-is-byte-identical guarantee, non-null-profile path.
    const offNonNull = await runAgenticAudit({ ctx, experts, callModel: stub, naics: "336413", setAside: "Total Small Business Set-Aside", bidderProfile: { satisfiedAttributes: ["NMR compliant"], openWorld: true } });
    eq("W-off byte-identity: gate OFF + non-null synonym profile → eligible NOT force-true (NMR branch inert)", offNonNull.decision.eligible !== true, true);
  });

  console.log(`nmr-gate: ${pass}/${pass + fails.length} pass`);
  if (fails.length) { console.log("✗ FAILURES:\n" + fails.map((x) => "  - " + x).join("\n")); process.exit(1); }
  console.log("\n── I0/I1 CARD-132→FORK-7 MIGRATION (card 236 discipline, empirical verdict before assertion) ──");
  mig.forEach((m, i) => console.log(`  ${i + 1}  ${m.assert.padEnd(52)}  ${m.from} → ${m.to}`));
  console.log(`  (${mig.length} migrated · 0 xfail/skips)`);
  console.log("✅ ALL PASS — WIRED Fork-7 NMR mechanism (card 242): keyfact sole emitter; compliant→BID/eligible=true (P-8 killed, orchestrator path); noncompliant→INELIGIBLE; unknown/synonym→NHR; flag-off byte-identical. card-132 RETIRED.");
  process.exit(0);
})();
