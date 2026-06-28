// $0 proof for N5 — conservative capability-statement → BidderProfile wiring.
// Run: npx tsx src/lib/audit-n5-bidder-profile.test.ts
//
// SAFETY invariants (CEO 2026-06-28 "conservative normalized wiring"):
//  • A held socioeconomic cert CLEARS a matching set-aside bar (canonical match) → BID.
//  • OPEN-WORLD: a bar the statement doesn't mention is "unknown" (caution), NEVER a
//    false INELIGIBLE.
//  • A STRUCTURAL bar (clearance / OEM / QPL) can NEVER be self-cleared — the builder
//    never emits those tokens, so they stay "unknown" → human review.
//  • CLOSED-WORLD (gold) behavior is UNCHANGED (regression-guarded by test-derive-verdict).

import { firmStatus, canonicalizeEligibilityAttr, deriveVerdict } from "./audit-decide";
import { buildBidderProfileFromCapability } from "./audit-bidder-profile";
import type { TypedFinding, VerdictInputs } from "./audit-findings";

let pass = 0; let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = got === want;
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : `  — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

const f = (o: Partial<TypedFinding>): TypedFinding => ({
  requirement: o.requirement ?? "req", citation: o.citation ?? "§K", excerpt: o.excerpt ?? "x",
  kind: o.kind ?? "eligibility_bar", controllability: o.controllability ?? "bidder_cannot_move",
  grounded: true, lens: "eligibility", requiredAttribute: o.requiredAttribute, curableInWindow: o.curableInWindow,
});
const inp = (findings: TypedFinding[], profile: VerdictInputs["bidderProfile"]): VerdictInputs =>
  ({ findings, bidderProfile: profile, coverageComplete: true, verifierSound: true, conflict: false });

// ── canonicalizer ──
eq("canon: 8(a) variants", canonicalizeEligibilityAttr("8(a) Business Development"), "se:8a");
eq("canon: bare 8a", canonicalizeEligibilityAttr("8a"), "se:8a");
eq("canon: HUBZone", canonicalizeEligibilityAttr("HUBZone certified"), "se:hubzone");
eq("canon: SDVOSB phrase", canonicalizeEligibilityAttr("Service-Disabled Veteran-Owned Small Business"), "se:sdvosb");
eq("canon: EDWOSB before WOSB", canonicalizeEligibilityAttr("EDWOSB"), "se:edwosb");
eq("canon: WOSB phrase", canonicalizeEligibilityAttr("Woman-Owned Small Business"), "se:wosb");
eq("canon: requiredAttribute style setaside:sdvosb", canonicalizeEligibilityAttr("setaside:sdvosb"), "se:sdvosb");
eq("canon: structural clearance → null (never canonical)", canonicalizeEligibilityAttr("clearance:secret-facility"), null);
eq("canon: OEM sole-source → null", canonicalizeEligibilityAttr("oem:dillon-approved-source"), null);
eq("canon: NAICS-size → null (cannot self-assert size)", canonicalizeEligibilityAttr("naics:333120-small"), null);

// ── firmStatus: open-world capability profile ──
const sdvosbBar = f({ requirement: "SDVOSB set-aside", requiredAttribute: "setaside:sdvosb", curableInWindow: true });
const profSDVOSB = buildBidderProfileFromCapability({ certifications: ["SDVOSB"] })!;
eq("builder produced an open-world profile", profSDVOSB.openWorld, true);
eq("builder token canonicalized", profSDVOSB.satisfiedAttributes.includes("se:sdvosb"), true);
eq("held cert CLEARS matching set-aside bar (canonical) → satisfies", firmStatus(sdvosbBar, profSDVOSB), "satisfies");

// open-world: a DIFFERENT set-aside the firm didn't list → unknown (NOT fails)
const wosbBar = f({ requirement: "WOSB set-aside", requiredAttribute: "setaside:wosb", curableInWindow: true });
eq("unlisted set-aside under open-world → unknown (no false INELIGIBLE)", firmStatus(wosbBar, profSDVOSB), "unknown");

// open-world: a STRUCTURAL bar is never in the profile (builder won't emit it) → unknown
const clearanceBar = f({ requirement: "secret facility clearance", requiredAttribute: "clearance:secret-facility", curableInWindow: false });
eq("structural clearance bar under open-world profile → unknown (human review)", firmStatus(clearanceBar, profSDVOSB), "unknown");

// ── verdict-level safety: open-world never manufactures a false INELIGIBLE ──
eq("WOSB bar + SDVOSB firm (open-world) → NOT INELIGIBLE (curable caution)",
  deriveVerdict(inp([wosbBar], profSDVOSB)).verdict, "BID_WITH_CAUTION");
eq("SDVOSB bar + SDVOSB firm → cleared → BID",
  deriveVerdict(inp([sdvosbBar], profSDVOSB)).verdict, "BID");
// structural non-curable bar + open-world firm that lacks it → human review (conditional NO-BID), never auto-INELIGIBLE
eq("structural clearance bar + open-world firm → NEEDS_HUMAN_REVIEW (not INELIGIBLE)",
  deriveVerdict(inp([clearanceBar], profSDVOSB)).verdict, "NEEDS_HUMAN_REVIEW");

// ── builder edge cases ──
eq("builder: no certs → null", buildBidderProfileFromCapability({ certifications: [] }), null);
eq("builder: only non-socioeconomic certs (ISO 9001) → null", buildBidderProfileFromCapability({ certifications: ["ISO 9001", "CMMI L3"] }), null);
eq("builder: null input → null", buildBidderProfileFromCapability(null), null);
{
  const multi = buildBidderProfileFromCapability({ certifications: ["8(a)", "HUBZone", "ISO 9001"] })!;
  eq("builder: mixed certs → only socioeconomic tokens", multi.satisfiedAttributes.sort().join(","), "se:8a,se:hubzone");
}

// ── Finding 2 fix — a self-asserted cert can NOT clear a BUNDLED / sole-source bar ──
const prof8a = buildBidderProfileFromCapability({ certifications: ["8(a)"] })!;
const soleSource8a = f({ requirement: "8(a) sole-source award to a named firm", requiredAttribute: "setaside:8a", excerpt: "This requirement is a sole source to the named 8(a) firm.", curableInWindow: false });
eq("8(a) SOLE-SOURCE bar + 8(a) firm → NOT self-cleared (unknown → human review)", firmStatus(soleSource8a, prof8a), "unknown");
eq("8(a) sole-source bar → verdict is NOT a clean BID", deriveVerdict(inp([soleSource8a], prof8a)).verdict !== "BID", true);
const bundledSize8a = f({ requirement: "8(a) and small under the NAICS size standard", requiredAttribute: "setaside:8a", excerpt: "Offeror must be 8(a) AND small under the applicable size standard.", curableInWindow: true });
eq("8(a)+size-standard bundled bar → NOT self-cleared (size never self-asserted)", firmStatus(bundledSize8a, prof8a), "unknown");
// Hardened-regex evasions (re-verifier): "directed / non-competitive award to the incumbent"
// and employee-count size caps must also stay un-self-cleared.
const directedIncumbent = f({ requirement: "non-competitive directed award to the incumbent 8(a) firm", requiredAttribute: "setaside:8a", excerpt: "This is a directed, non-competitive award to the incumbent 8(a) participant.", curableInWindow: false });
eq("directed/non-competitive incumbent 8(a) bar → NOT self-cleared", firmStatus(directedIncumbent, prof8a), "unknown");
const empCap8a = f({ requirement: "8(a) and fewer than 500 employees", requiredAttribute: "setaside:8a", excerpt: "Offeror must be 8(a) with fewer than 500 employees (average annual).", curableInWindow: true });
eq("8(a)+employee-count size cap → NOT self-cleared", firmStatus(empCap8a, prof8a), "unknown");

// A2-2 evasion: bundled "small business under NAICS" with no explicit "size standard" word.
const sizeEvade8a = f({ requirement: "8(a) and small business under NAICS 541330", requiredAttribute: "setaside:8a", excerpt: "Offeror must be 8(a) and a small business under NAICS 541330.", curableInWindow: true });
eq("8(a)+'small business under NAICS' (no trigger word) → NOT self-cleared", firmStatus(sizeEvade8a, prof8a), "unknown");

// A PURE set-aside bar (no structural/size language) IS still cleared — the benefit survives.
const pure8a = f({ requirement: "set aside for 8(a) participants", requiredAttribute: "setaside:8a", excerpt: "This acquisition is set aside for 8(a) program participants.", curableInWindow: true });
eq("PURE 8(a) set-aside bar + 8(a) firm → cleared (benefit preserved)", firmStatus(pure8a, prof8a), "satisfies");
// A2-1 over-block fix: a pure set-aside whose excerpt incidentally says "incumbent"/"employees"
// must STILL clear (bare tokens no longer over-block → N5 benefit preserved on common phrasing).
const pureWithIncidental = f({ requirement: "set aside for SDVOSB", requiredAttribute: "setaside:sdvosb", excerpt: "Set aside for SDVOSB; this is a follow-on to the incumbent and the firm's employees perform on site.", curableInWindow: true });
eq("pure SDVOSB set-aside whose excerpt mentions incumbent/employees → STILL cleared (no over-block)", firmStatus(pureWithIncidental, profSDVOSB), "satisfies");

// ── code-review #3 fix — closed-world NON-exact socioeconomic string does NOT canonical-flip ──
const wosbBarExact = f({ requirement: "WOSB set-aside", requiredAttribute: "WOSB", curableInWindow: true });
eq("closed-world non-exact cert string → still 'fails' (no canonical flip; gold intact)", firmStatus(wosbBarExact, { satisfiedAttributes: ["women-owned small business"] }), "fails");

// ── CLOSED-WORLD (gold) regression: unchanged ──
const dillonBar = f({ requirement: "sole-source named OEM", requiredAttribute: "oem:dillon-approved-source", curableInWindow: false });
eq("closed-world empty profile → fails (gold behavior intact)", firmStatus(dillonBar, { satisfiedAttributes: [] }), "fails");
eq("closed-world exact hold → satisfies (gold behavior intact)", firmStatus(dillonBar, { satisfiedAttributes: ["oem:dillon-approved-source"] }), "satisfies");

console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
