// ⚰️ GRAVEYARD — DEAD PROBE. The unit this exercised (hard-bar floor PART A, the prose possession detector) was
// RETIRED and DELETED by Brain Q3 ruling 2026-07-22 (card #677, panel 3/3). This file no longer executes: it
// imports src/lib/audit-hardbar.ts, which does not exist. It is kept ONLY as a historical adversarial record.
// DO NOT REPAIR IT TO RUN AGAIN — repairing it means rebuilding part A. See ceo/GRAVEYARD-HARDBAR-PART-A.md.
// CODE-REVIEW ULTRA · SCOPE B1 — attack the post-R1-fix hard-bar floor claims (CLAIM 1-4).
// Run: npx tsx scripts/audit-ai/_ultra-b1-hardbar.ts
// Findings-only; no src/** edits. Every reported finding is executed here.
export {}; // force module scope (harness memory: tsx script-scope tsc redeclare collisions)
import { deriveHardBarFloor } from "../../src/lib/audit-hardbar";
import { disposeFinding } from "../../src/lib/audit-decide";
import type { TypedFinding } from "../../src/lib/audit-findings";

const f = (over: Partial<TypedFinding>): TypedFinding => ({
  requirement: "", citation: "", excerpt: "", kind: "other", controllability: "bidder_controls", grounded: true, lens: "probe", ...over,
});
const disp = (findings: TypedFinding[]) => findings.map((x) => ({ f: x, disposition: disposeFinding(x) }));
const fire = (source: string, findings: TypedFinding[] = [], notices: Array<{ excerpt: string; requirement: string; requiredAttribute?: string }> = []) =>
  deriveHardBarFloor(source, disp(findings), notices);

let breaks = 0, oks = 0;
function probe(id: string, dir: string, source: string, expected: string, note: string,
  opts: { findings?: TypedFinding[] } = {}) {
  const d = fire(source, opts.findings ?? []);
  const actual = d ? `FIRE ${d.cap} [${d.hits.map((h) => h.cls).join(",")}]` : "null";
  const ok =
    expected === "null" ? d === null :
    actual.startsWith(expected);
  console.log(`${ok ? "OK   " : "BREAK"} ${id} · ${dir}\n      expected=${expected}  actual=${actual}\n      ${note}`);
  if (!ok) { breaks++; console.log(`      input: ${JSON.stringify(source.slice(0, 240))}`); } else oks++;
}

console.log("════ CLAIM 1 — object-span predicate: can a class term fire from OUTSIDE the true restriction object? ════");

// U1-01 modifier-cut is a BLOCKLIST — "questions ON the draft DD-254" (BRK-13 one preposition wider).
probe("U1-01", "OVER",
  "Offerors must have any questions on the draft DD-254 submitted prior to the proposal due date.",
  "null",
  "BRK-13 fix used a modifier-vocab blocklist (regarding/concerning/about/...). 'on' is the natural miss.");

// U1-02 comma-coordination smuggle: the 180-char object capture swallows a coordinated post-award clause.
probe("U1-02", "OVER",
  "Award is limited to small business concerns, and the awardee will be required to obtain a SECRET facility clearance after award.",
  "null",
  "Restriction object = 'small business concerns'; the coordinated clause is the BRK-3 invite-the-uncleared posture (obtain AFTER award). Comma does not segment.");

// U1-02b same shape, sponsorship register (DCSA posture verbatim class).
probe("U1-02b", "OVER",
  "Award is limited to small business concerns under NAICS 561210, and the successful offeror will be sponsored for a TOP SECRET facility clearance after award.",
  "null",
  "'will be sponsored ... after award' — FLOWDOWN lists issued/provided/granted but not 'sponsored'.");

// U1-03 SeaPort portal-submission sentence (SELF-ATTACK candidate — see ledger; holders-only is TRUE on such packages).
probe("U1-03", "OVER?",
  "Only quotations submitted through the SeaPort-NxG portal will be considered.",
  "null",
  "Object span 'quotations submitted through the SeaPort-NxG portal' — the restricted object is QUOTATIONS (a submission channel), not vehicle holdership. (Realism note: on a SeaPort TO the holders-only conclusion is substantively true — candidate for self-refutal.)");

// U1-04 'be' possession-verb over-capture (pre-proposal-conference register).
probe("U1-04", "OVER?",
  "Offerors must be prepared to address the requirements of the draft DD-254 at the time of proposal submission.",
  "null",
  "'be' + lazy 90-char capture to the offer anchor: possessed object = 'prepared to address the requirements of the draft DD-254' — nothing is possessed.");

console.log("\n════ CLAIM 2 — ESTABLISHMENT guard, both directions ════");

// U2-01 UNDER-SUPPRESSION: establishment phrasing with the class term INSIDE the object span, no ESTABLISHMENT vocab.
probe("U2-01", "OVER",
  "Award will be limited to a single BPA.",
  "null",
  "ESTABLISHMENT needs 'only one|a single AWARD|intends to make|as a result of this|resultant|will be established' — 'limited to a single BPA' hits none. Object span 'a single BPA' carries the BPA term → false 'you must already hold the vehicle'.");

// U2-01b numeral variant of the same eBuy register.
probe("U2-01b", "OVER",
  "Award will be limited to one (1) BPA with a period of performance of five years.",
  "null",
  "Same hole, '(1)' numeral form.");

// U2-01c IDIQ variant.
probe("U2-01c", "OVER",
  "Award under this solicitation is limited to a single IDIQ contract with a five-year ordering period.",
  "null",
  "Single-award IDIQ establishment through the same gap.");

// U2-02 OVER-SUPPRESSION: genuine Schedule-holder bar killed because the SAME clause establishes one BPA.
probe("U2-02", "UNDER",
  "Only one BPA will be established with a firm holding a current GSA Multiple Award Schedule contract.",
  "FIRE",
  "The Schedule-holder condition is a GENUINE eligibility bar (eBuy BPA RFQs); ESTABLISHMENT ('only one' + 'will be established') kills the whole clause.");

// U2-03 OVER-SUPPRESSION: real holders-only restriction carrying 'single-award' as a MODIFIER of the vehicle.
probe("U2-03", "UNDER",
  "Only holders of the single-award BPAs established under Phase 1 are eligible to compete for orders under this solicitation.",
  "FIRE",
  "\\bsingle[-\\s]award\\b matches 'single-award BPAs' — a real holders-only bar (two-phase BPA structures) suppressed.");

// U2-04 coverage: establishment phrasings that the object span ALONE saves (no class term in the capture).
probe("U2-04", "coverage",
  "It is anticipated that award of the resulting BPA will be limited to the responsible quoter whose quotation is most advantageous.",
  "null",
  "'resulting' (not 'resultant') evades ESTABLISHMENT, but the object span ('the responsible quoter...') carries no class term — object-span discriminator holds. (Also EVAL 'most advantageous' excludes.)");
probe("U2-05", "coverage",
  "The Government intends to establish a single Blanket Purchase Agreement resulting from this RFQ.",
  "null",
  "'intends to establish' is not in ESTABLISHMENT — but no restriction frame matches, so no fire. Holds.");

console.log("\n════ CLAIM 3 — anchor asymmetry: performance-time obligations through the anchor-free frames ════");

// U3-01 the task's specified probe.
probe("U3-01", "spec-probe",
  "Award is restricted to firms that maintain an active facility clearance throughout performance.",
  "null",
  "FLOWDOWN 'throughout performance' catches this exact wording — does the vocab hold one synonym out?");

// U3-02 same posture, 'during the period of performance' — FLOWDOWN regex is 'during (the )?performance' ONLY.
probe("U3-02", "OVER",
  "To be eligible for award, the offeror must maintain a facility security clearance at the SECRET level during the period of performance.",
  "null",
  "'during the period of performance' does NOT match /during (the )?performance/ ('period of' intervenes). Performance-time obligation reaches NHR through the anchor-free ELIGIBILITY frame.");

// U3-03 'for the duration of the contract' variant.
probe("U3-03", "OVER",
  "To be eligible for award, offerors must maintain an active SECRET facility clearance for the duration of the contract.",
  "null",
  "'for the duration of the contract' — natural performance-time phrasing entirely absent from FLOWDOWN.");

// U3-04 restriction frame, 'for the life of the contract'.
probe("U3-04", "OVER",
  "Award is restricted to firms that maintain a SECRET facility clearance for the life of the contract.",
  "null",
  "Same performance-time posture through frame 1 (anchor-free).");

// U3-05 UNDER: unambiguous hold-at-offer bar with an anchor-vocab miss ('as of').
probe("U3-05", "UNDER",
  "Offerors must possess an active TOP SECRET facility clearance as of the proposal due date.",
  "FIRE NEEDS_HUMAN_REVIEW",
  "Possession frame anchors = at|by|prior to|before only; 'as of' invisible.");

// U3-06 UNDER: 'no later than' — the most common federal deadline register.
probe("U3-06", "UNDER",
  "The offeror shall possess a SECRET facility security clearance no later than the date set for receipt of proposals.",
  "FIRE NEEDS_HUMAN_REVIEW",
  "'no later than' not in the anchor set; also 'the date set for receipt of proposals' lacks the offer-noun.");

console.log("\n════ CLAIM 4 — rejoinWrapped on adversarial extraction shapes ════");

// U4-01 narrow-column wrap (~30-35 char lines — two-column/SF1449-block extraction): 40-char floor refuses to join.
probe("U4-01", "UNDER",
  "Award is restricted to firms\npossessing a TOP SECRET facility\nclearance at the time of proposal\nsubmission.",
  "FIRE NEEDS_HUMAN_REVIEW",
  "Every predecessor line is under the 40-char prevUnfinished floor → never joined → frame severed from term.");

// U4-02 enumerated-eligibility list (colon lead-in + numbered items) — the standard multi-condition format.
probe("U4-02", "UNDER",
  "To be eligible for award, an offeror must:\n(1) be registered in SAM at the time of offer;\n(2) possess an active TOP SECRET facility clearance at the time of proposal submission; and\n(3) acknowledge all amendments.",
  "FIRE NEEDS_HUMAN_REVIEW",
  "Colon is terminal punctuation (no join) and '(1)' is STRUCTURAL — each item is a subject-less fragment no frame matches.");

// U4-03 hyphenated line-break inside the class term itself.
probe("U4-03", "UNDER",
  "To be eligible for award, offerors must possess a TOP SE-\nCRET clearance at the time of proposal submission.",
  "FIRE",
  "Join produces 'TOP SE- CRET clearance' — TERM_CLEARANCE cannot match across the hyphenation残. (If 'facility clearance' also present the term survives — probed separately.)");
probe("U4-03b", "coverage",
  "To be eligible for award, offerors must possess a TOP SE-\nCRET facility clearance at the time of proposal submission.",
  "FIRE",
  "Control: 'facility clearance' intact on the joined line still carries the term.");

// U4-04 FALSE-GLUE attempt: page-footer + FAR-part continuation + §H personnel sentence (guard-composition test).
// NOTE: first draft used a 49-char 'Award of a contract resulting from this solicitation' opener — that nulls on
// the FRAME's {0,40} subject gap, NOT on any guard. Short opener isolates the guards.
probe("U4-04", "OVER-attempt",
  "Award under this solicitation is limited to\nW912DY-26-R-0018 Page 23 of 87\nofferors determined responsible in accordance with FAR Part 9. Contractor\npersonnel requiring access to the installation must possess a TOP SECRET clearance.",
  "null",
  "Footer glues in (mixed-case, not structural) but the capture clause carries no class term, and the §H sentence is personnel-subject + anchor-free. Composition test.");

// U4-05 FALSE-GLUE attempt: title-case 'Attachment' line is NOT structural (regex is case-sensitive) — can a J-list
// line glue onto a wrapped restriction opener? (Extraction-artifact construct; realism flagged in ledger.)
probe("U4-05", "OVER-attempt",
  "Award under this announcement is limited to\nAttachment 3 DD-254 Contract Security Classification Specification\nresponsible sources as defined in FAR Part 9.",
  "null",
  "STRUCTURAL_LINE matches 'ATTACHMENT' (caps) only; 'Attachment 3 DD-254 ...' (title case) glues into the object span and carries \\bDD[\\s-]?254\\b.");

// U4-06 two-column interleave where the second column's line lands inside the capture with a vehicle term.
probe("U4-06", "OVER-attempt",
  "Award resulting from this synopsis is limited to\nOASIS+ SB Domain 2 task order awards are reported quarterly\nsmall business concerns under the assigned NAICS code.",
  "null",
  "Interleaved right-column line carrying 'OASIS+' glued directly after 'limited to'.");

// U4-07 INVERSE control: ordinary 72-col wrapped real bar still joins and fires (the BRK-8 fix's core promise).
probe("U4-07", "coverage",
  "In accordance with Section H.4, award is restricted to firms possessing a\nTOP SECRET facility clearance at the time of proposal submission.",
  "FIRE NEEDS_HUMAN_REVIEW",
  "Banked BRK-8 shape — must keep firing.");

console.log("\n════ cross-claim: CMMC self-assessment cap (ruling-5 curable subclass) ════");
probe("UX-01", "OVER(cap)?",
  "To be eligible for award, offerors must have a current CMMC Level 2 self-assessment posted in SPRS at the time of offer.",
  "FIRE BID_WITH_CAUTION",
  "Span carries both SPRS and 'CMMC Level' → CMMC_LEVEL_CERT wins → NHR; but a SELF-assessment is the curable/postable subclass ruling 5 caps at BWC.");

console.log("\n════ universal-fire check: DEARS 952.204-73 verbatim (live-fetched acquisition.gov 2026-07-22) ════");
probe("UX-02", "coverage",
  "A Facility Clearance is required for this contract, although not necessarily prior to contract award. A favorable FOCI determination for this contract is required prior to contract award. Before contract award, after obtaining a favorable FOCI determination, the successful offeror/Contractor may be eligible to obtain a Facility Clearance.",
  "null",
  "DOE facility-clearance provision fulltext — appears verbatim on DOE packages under CLAUSE_SOURCE_FULLTEXT; must not fire (clearance obtainable post-award).");

console.log(`\n${breaks} BREAK(s) · ${oks} OK`);
