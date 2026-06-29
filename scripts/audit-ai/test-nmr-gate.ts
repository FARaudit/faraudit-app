// $0 gate for Step 4 — the deterministic NONMANUFACTURER RULE gate (Brain card 132, FAR 52.219-1).
//   npx tsx scripts/audit-ai/test-nmr-gate.ts
//
// Doctrine proven here:
//  • LOAD-BEARING NEGATIVES — fires ONLY on (SB set-aside) AND (supply/manufacturing NAICS sector). Flag-off,
//    services/construction NAICS, full-&-open, and ABSENT NAICS (the upload path) all stay byte-identical.
//  • POSITIVE / REPLAY — a Total-SB set-aside under NAICS 336413 (the #2-fixture shape) emits exactly one
//    bidder_controls + cautionFloor caution citing FAR 52.219-1; it floors a clean BID → BID_WITH_CAUTION and
//    NEVER downgrades a NO_BID (floor-only).
//  • NON-DUPLICATION — a pre-existing NMR finding (52.219-1) blocks the emit; a 52.219-14 (LoS) finding does NOT
//    (distinct obligation) and both survive.
//  • WIRED + VERIFY-SAFE — runAgenticAudit emits the floor only under the flag, post-verify (skeptic can't cull).

import { deriveVerdict, applyNonmanufacturerRuleGate, naicsSector } from "@/lib/audit-decide";
import type { TypedFinding, BidderProfile, VerdictInputs } from "@/lib/audit-findings";
import { runAgenticAudit } from "@/lib/audit-orchestrator";
import { type CallModel, type RawFinding } from "@/lib/audit-expert";
import type { AuditToolContext } from "@/lib/audit-tools";

const f = (o: Partial<TypedFinding> & { kind: TypedFinding["kind"]; controllability: TypedFinding["controllability"] }): TypedFinding => ({
  requirement: o.requirement ?? "requirement", citation: o.citation ?? "FAR 52.x", excerpt: o.excerpt ?? "verbatim", grounded: true, lens: o.lens ?? "x",
  kind: o.kind, controllability: o.controllability, cautionFloor: o.cautionFloor, requiredAttribute: o.requiredAttribute, curableInWindow: o.curableInWindow,
});
const inp = (findings: TypedFinding[], o: { profile?: BidderProfile | null } = {}): VerdictInputs =>
  ({ findings, bidderProfile: o.profile ?? null, coverageComplete: true, verifierSound: true, conflict: false, manifestComplete: true });
const ON = { enabled: true };

let pass = 0; const fails: string[] = [];
const eq = (label: string, got: unknown, exp: unknown) => { if (JSON.stringify(got) === JSON.stringify(exp)) pass++; else fails.push(`${label}: got ${JSON.stringify(got)} exp ${JSON.stringify(exp)}`); };

// A non-NMR baseline finding set (a clean BID's worth of gate-to-clear facts).
const base: TypedFinding[] = [
  f({ requirement: "submit pricing for all CLINs", kind: "pricing", controllability: "bidder_controls" }),
  f({ requirement: "Certificate of Conformance", kind: "submission", controllability: "bidder_controls" }),
];
const nmrCount = (xs: TypedFinding[]) => xs.filter((x) => x.lens === "nonmanufacturer_rule").length;

// ── sector arithmetic (deterministic, no lookup) ──
eq("naicsSector 336413 → 33", naicsSector("336413"), "33");
eq("naicsSector 423610 → 42", naicsSector("423610"), "42");
eq("naicsSector 541330 → 54", naicsSector("541330"), "54");
eq("naicsSector null → null", naicsSector(null), null);
eq("naicsSector garbage → null", naicsSector("NAICS code"), null);

// ── LOAD-BEARING NEGATIVES ──
eq("N1 flag OFF → byte-identical (no emit) even with trigger facts",
   applyNonmanufacturerRuleGate(base, { naics: "336413", setAside: "Total Small Business Set-Aside" }), base);
eq("N2 services NAICS (54) + SB set-aside → silent",
   nmrCount(applyNonmanufacturerRuleGate(base, { naics: "541330", setAside: "Total Small Business Set-Aside" }, ON)), 0);
eq("N3 construction NAICS (23) + SB set-aside → silent",
   nmrCount(applyNonmanufacturerRuleGate(base, { naics: "236220", setAside: "8(a) Set-Aside" }, ON)), 0);
eq("N4 supply NAICS + FULL & OPEN → silent",
   nmrCount(applyNonmanufacturerRuleGate(base, { naics: "336413", setAside: "Full & Open" }, ON)), 0);
eq("N5 supply NAICS + NULL naics (upload path) → silent (honest)",
   nmrCount(applyNonmanufacturerRuleGate(base, { naics: null, setAside: "Total Small Business Set-Aside" }, ON)), 0);
eq("N6 supply NAICS + empty set-aside → silent",
   nmrCount(applyNonmanufacturerRuleGate(base, { naics: "336413", setAside: "" }, ON)), 0);
eq("N7 supply NAICS + non-SB unrestricted label → silent",
   nmrCount(applyNonmanufacturerRuleGate(base, { naics: "336413", setAside: "Unrestricted" }, ON)), 0);

// ── POSITIVE / REPLAY (the #2-fixture shape: NAICS 336413 + Total SB set-aside) ──
const fired = applyNonmanufacturerRuleGate(base, { naics: "336413", setAside: "Total Small Business Set-Aside" }, ON);
eq("P1 emits exactly one NMR finding", nmrCount(fired), 1);
const n = fired.find((x) => x.lens === "nonmanufacturer_rule")!;
eq("P1 citation = FAR 52.219-1", n.citation, "FAR 52.219-1");
eq("P1 controllability = bidder_controls (never a bar)", n.controllability, "bidder_controls");
eq("P1 cautionFloor = true", n.cautionFloor, true);
eq("P1 grounded in the deterministic fact", n.grounded, true);
eq("P2 wholesale NAICS (42) + WOSB → fires", nmrCount(applyNonmanufacturerRuleGate(base, { naics: "423610", setAside: "WOSB Set-Aside" }, ON)), 1);
eq("P3 retail NAICS (44) + 8(a) → fires", nmrCount(applyNonmanufacturerRuleGate(base, { naics: "445110", setAside: "8(a)" }, ON)), 1);

// ── REAL SAM CODES (the value that actually reaches the gate — audit row stores "8A"/"SBA", not the name) ──
for (const code of ["SBA", "SBP", "8A", "8AN", "HZC", "HZS", "SDVOSBC", "SDVOSBS", "WOSB", "WOSBSS", "EDWOSB", "EDWOSBSS"]) {
  eq(`P-code ${code} (supply NAICS) → fires`, nmrCount(applyNonmanufacturerRuleGate(base, { naics: "336413", setAside: code }, ON)), 1);
}
// Codes that must NOT fire (not SBA-program set-asides) even under a supply NAICS.
for (const code of ["NONE", "", "LAS", "IEE", "ISBEE", "BI"]) {
  eq(`N-code ${JSON.stringify(code)} (supply NAICS) → silent`, nmrCount(applyNonmanufacturerRuleGate(base, { naics: "336413", setAside: code }, ON)), 0);
}

// ── NON-DUPLICATION ──
const seededNMR = [...base, f({ requirement: "NMR per lens", citation: "FAR 52.219-1", kind: "submission", controllability: "bidder_controls", lens: "eligibility_counsel" })];
eq("D1 pre-existing 52.219-1 finding → NO double-emit (lens NMR wins the slot)",
   nmrCount(applyNonmanufacturerRuleGate(seededNMR, { naics: "336413", setAside: "Total Small Business Set-Aside" }, ON)), 0);
eq("D1 length unchanged (still one NMR-citing finding total)",
   applyNonmanufacturerRuleGate(seededNMR, { naics: "336413", setAside: "Total Small Business Set-Aside" }, ON).filter((x) => /52\.219-1(?!\d)/.test(x.citation)).length, 1);
const seededLoS = [...base, f({ requirement: "Limitations on Subcontracting 50% self-performance", citation: "FAR 52.219-14", kind: "clause_flowdown", controllability: "bidder_controls", lens: "eligibility_counsel" })];
const withBoth = applyNonmanufacturerRuleGate(seededLoS, { naics: "336413", setAside: "Total Small Business Set-Aside" }, ON);
eq("D2 a 52.219-14 (LoS) finding does NOT block NMR — distinct obligation", nmrCount(withBoth), 1);
eq("D2 both survive (52.219-1 AND 52.219-14)",
   [withBoth.some((x) => x.citation === "FAR 52.219-1"), withBoth.some((x) => x.citation === "FAR 52.219-14")], [true, true]);
// D3 — a lens NMR finding under a DIFFERENT NMR authority (13 CFR 121.406) still blocks the double-emit.
const seeded406 = [...base, f({ requirement: "size/manufacturing analysis", citation: "13 CFR 121.406", kind: "submission", controllability: "bidder_controls", lens: "eligibility_counsel" })];
eq("D3 lens NMR cited as 13 CFR 121.406 → NO double-emit", nmrCount(applyNonmanufacturerRuleGate(seeded406, { naics: "336413", setAside: "SBA" }, ON)), 0);
// D4 — a lens finding that NAMES the rule (requirement text) but cites the waiver section → blocks double-emit.
const seededTopic = [...base, f({ requirement: "the nonmanufacturer rule applies; consider a waiver", citation: "FAR 19.505", kind: "submission", controllability: "bidder_controls", lens: "eligibility_counsel" })];
eq("D4 lens finding naming the nonmanufacturer rule → NO double-emit", nmrCount(applyNonmanufacturerRuleGate(seededTopic, { naics: "336413", setAside: "SBA" }, ON)), 0);
// D5 — THE FALSE-NEGATIVE GUARD: 52.219-6 (set-aside NOTICE, on nearly every SB audit) must NEVER suppress NMR.
const seeded6 = [...base, f({ requirement: "Notice of Total Small Business Set-Aside", citation: "FAR 52.219-6", kind: "eligibility_bar", controllability: "already_satisfied", lens: "eligibility_counsel" })];
eq("D5 a 52.219-6 set-aside-notice finding does NOT suppress the floor (catch-every-time intact)",
   nmrCount(applyNonmanufacturerRuleGate(seeded6, { naics: "336413", setAside: "SBA" }, ON)), 1);

// ── deriveVerdict INTEGRATION: floor a clean BID, never downgrade a bar ──
eq("I0 clean BID baseline (no NMR) → BID", deriveVerdict(inp(base)).verdict, "BID");
eq("I1 NMR floors clean BID → BID_WITH_CAUTION", deriveVerdict(inp(fired)).verdict, "BID_WITH_CAUTION");
eq("I1 floored verdict stays eligible", deriveVerdict(inp(fired)).eligible, true);
const withBar = applyNonmanufacturerRuleGate(
  [...base, f({ requirement: "5-day delivery vs 90-day irreducible lead time", kind: "technical_spec", controllability: "no_one_can_move" })],
  { naics: "336413", setAside: "Total Small Business Set-Aside" }, ON);
eq("I2 NMR NEVER downgrades a real show-stopper → NO_BID", deriveVerdict(inp(withBar)).verdict, "NO_BID");

// ── WIRED + VERIFY-SAFE: runAgenticAudit emits the floor only under the flag, post-verify ──
const SRC = [
  "SECTION B - SUPPLIES AND PRICES", "Offerors shall submit pricing for all CLINs 0001 through 0005.",
  "SECTION C - STATEMENT OF WORK", "The contractor shall furnish one mini-excavator with a fully enclosed cab.",
  "SECTION I - CONTRACT CLAUSES", "52.219-6 Notice of Total Small Business Set-Aside is incorporated.",
  "SECTION L - INSTRUCTIONS TO OFFERORS", "Submit a Certificate of Conformance with the offer.",
  "SECTION M - EVALUATION FACTORS", "Award will be made on a Lowest-Priced Technically Acceptable basis.",
].join("\n");
const ctx: AuditToolContext = { fullSource: SRC };
const RF: Record<string, RawFinding> = {
  price: { requirement: "submit pricing for all CLINs", citation: "§B", excerpt: "pricing for all CLINs", kind: "pricing", controllability: "bidder_controls" },
  cab:   { requirement: "enclosed cab", citation: "§C", excerpt: "fully enclosed cab", kind: "technical_spec", controllability: "bidder_controls" },
  setA:  { requirement: "small-business set-aside (firm qualifies)", citation: "§I", excerpt: "52.219-6", kind: "eligibility_bar", controllability: "already_satisfied" },
  coc:   { requirement: "Certificate of Conformance", citation: "§L", excerpt: "Certificate of Conformance", kind: "submission", controllability: "bidder_controls" },
  eval:  { requirement: "LPTA evaluation", citation: "§M", excerpt: "Lowest-Priced Technically Acceptable", kind: "other", controllability: "bidder_controls" },
};
const ALL = ["B", "C", "I", "L", "M"];
const stub: CallModel = async ({ system, priorToolResults }) =>
  priorToolResults.length === 0
    ? { toolCalls: ALL.map((k) => ({ id: `r${k}`, name: "read_section", input: { key: k } })), findings: null }
    : { toolCalls: [], findings: ({ LENS_A: [RF.price, RF.cab, RF.setA], LENS_B: [RF.cab, RF.coc, RF.eval] } as Record<string, RawFinding[]>)[system] ?? [] };
const experts = [{ key: "capture", system: "LENS_A" }, { key: "ko", system: "LENS_B" }];

(async () => {
  delete process.env.AUDIT_NONMANUFACTURER_RULE_GATE;
  const off = await runAgenticAudit({ ctx, experts, callModel: stub, naics: "336413", setAside: "Total Small Business Set-Aside" });
  eq("W1 flag OFF → BID (unchanged baseline, facts present but inert)", off.decision.verdict, "BID");
  eq("W1 flag OFF → no NMR finding", nmrCount(off.findings), 0);
  eq("W1 flag OFF → no perLens NMR key (byte-identical surface)", off.perLens.nonmanufacturer_rule, undefined);

  process.env.AUDIT_NONMANUFACTURER_RULE_GATE = "true";
  // Use the REAL SAM code "SBA" (Total Small Business) — proves the production code path end-to-end.
  const on = await runAgenticAudit({ ctx, experts, callModel: stub, naics: "336413", setAside: "SBA" });
  eq("W2 flag ON + supply facts (code SBA) → BID_WITH_CAUTION (floor wired, survived verify)", on.decision.verdict, "BID_WITH_CAUTION");
  eq("W2 flag ON → exactly one NMR finding present post-verify", nmrCount(on.findings), 1);

  const onServices = await runAgenticAudit({ ctx, experts, callModel: stub, naics: "541330", setAside: "Total Small Business Set-Aside" });
  eq("W3 flag ON + SERVICES NAICS → BID (silent, no floor)", onServices.decision.verdict, "BID");

  const onNull = await runAgenticAudit({ ctx, experts, callModel: stub, naics: null, setAside: "Total Small Business Set-Aside" });
  eq("W4 flag ON + NULL naics (upload) → BID (honest silence)", onNull.decision.verdict, "BID");
  delete process.env.AUDIT_NONMANUFACTURER_RULE_GATE;

  console.log(`nonmanufacturer-rule gate: ${pass}/${pass + fails.length} pass`);
  if (fails.length) { console.log("✗ FAILURES:\n" + fails.map((x) => "  - " + x).join("\n")); process.exit(1); }
  console.log("✅ ALL PASS — deterministic NMR floor: load-bearing negatives + #2 replay + non-dup + wired/verify-safe.");
  process.exit(0);
})();
