// ⚰️ GRAVEYARD — DEAD PROBE. The unit this exercised (hard-bar floor PART A, the prose possession detector) was
// RETIRED and DELETED by Brain Q3 ruling 2026-07-22 (card #677, panel 3/3). This file no longer executes: it
// imports src/lib/audit-hardbar.ts, which does not exist. It is kept ONLY as a historical adversarial record.
// DO NOT REPAIR IT TO RUN AGAIN — repairing it means rebuilding part A. See ceo/GRAVEYARD-HARDBAR-PART-A.md.
// PANEL-ON-DESIGN probe — HARD-BAR PIVOT (V3) simulation. adversarial-redteam, 2026-07-22.
// The pivot is NOT built; this simulates the spec (ceo/HARDBAR-PIVOT-DESIGN-SPEC.md) against the CURRENT
// building blocks of src/lib/audit-hardbar.ts (regex constants copied VERBATIM — src/** untouched).
//
// Three variants, because the spec does NOT define where the offer-time anchor must BIND:
//   V3-W  anchor required on frames 1-4, tested against the WHOLE CLAUSE (loosest faithful reading)
//   V3-S  anchor required on frames 1-4, tested against the CAPTURED OBJECT SPAN (tightest reading the
//         spec's own machinery supports — the capture is still the [^.?!;]{0,180} window)
//   V3-H2 = V3-S + Brain hypothesis H2: a present-tense possession predicate in the object span
//         (holders of / holding / possessing / maintaining / having / in possession of) counts as
//         structurally offer-time — no anchor needed.
// ESTABLISHMENT is DELETED in all three (per spec §2). All other exclusions retained (spec deletes only one).
// Frame 5 (possession) keeps its built-in anchor, unchanged.
// export {} at bottom: module scope (tsx/tsc redeclare guard).

// ── constants copied verbatim from src/lib/audit-hardbar.ts (2026-07-22 HEAD) ──
const INTERROGATIVE = /\?\s*$/;
const REPRESENTATION = /\b(?:represents?\s+that|the offeror represents|certif(?:ies|y|ication\s+that)|reps?\s+(?:&|and)\s+certs?|self-?certif)/i;
const EVAL_PREFERENCE = /\b(?:evaluat|more favorabl|favorably|additional consideration|will be given (?:preference|added)|preference will be given|strengths?\b|weakness|rated\b|scoring|source selection will|more advantageous|desirable|preferred|encouraged to)/i;
const FLOWDOWN = /\b(?:applies to this|is applicable to|is (?:hereby )?incorporated|incorporated by reference|flow(?:s|ed|-)?\s*down|shall comply with|the contractor shall|during (?:the )?performance|throughout performance|maintain(?:ed)?\s+during|will be (?:issued|provided|granted) (?:at|upon|after) award|issued at award)/i;
const NEGATED = /\b(?:is|are|will|shall|need|does|do)\s+not\s+(?:be\s+)?(?:required|necessary|mandatory)\b|\bno\s+(?:facility\s+)?(?:clearance|certification|registration)\s+is\s+required\b|\bnot\s+(?:a\s+)?(?:prerequisite|precondition|condition\s+of\s+award)\b/i;
const TRAILING_RIDERS = [
  /,\s+which\b[^.?!;]*[.?!]?\s*$/i,
  /\s+and\s+(?:shall|will|must)\s+(?:comply\s+with|be\s+maintained)\b[^.?!;]*[.?!]?\s*$/i,
];
const FRAMES: RegExp[] = [
  /\baward(?:s|ed)?\b[^.?!;]{0,40}?\b(?:is|are|will be|shall be|only)?\s*(?:limited|restricted|reserved|made only|available only)\s+to\b([^.?!;]{0,180})/i,
  /\bto be eligible\b[^.?!;]{0,80}?\b(?:must|shall|is required to|are required to)\b([^.?!;]{0,180})/i,
  /\bonly\b([^.?!;]{0,80}?)\b(?:are|will be|shall be)\s+(?:eligible|considered|awarded)\b/i,
  /\beligibility\b[^.?!;]{0,40}?\b(?:requires|is limited to|is restricted to|restricted to|limited to)\b([^.?!;]{0,180})/i,
  /\b(?:offerors?|contractors?|firms?|vendors?|bidders?|quoters?|awardees?)(?!\s+(?:personnel|employees|staff|individuals|team|workforce))\b[^.?!;]{0,60}?\b(?:must|shall|is required to|are required to)\s+(?:possess|hold|already have|have|maintain|be)\b([^.?!;]{0,90}?)\b(?:at|by|prior to|before)\s+(?:the\s+)?(?:time\s+of\s+)?(?:offer|proposal|quotation|quote|submission|bid)\b/i,
];
const OBJECT_MODIFIER_CUT = /\b(?:regarding|concerning|about|pertaining\s+to|relating\s+to|related\s+to|with\s+respect\s+to|in\s+response\s+to|for\s+the\s+purpose\s+of)\b/i;
const TERM_CLEARANCE = /\b(?:facility|personnel|security)\s+(?:security\s+)?clearance\b|\bFCL\b|\bDD[\s-]?254\b|\bTS\s*\/\s*SCI\b|\btop\s+secret\b|\bcleared\s+(?:facility|personnel)\b/i;
const TERM_VEHICLE = /\b(?:MAC|BOA|BPA|IDIQ|GWAC|MATOC|SATOC)\b|\b(?:SeaPort|OASIS\+?|CIO-SP\d?|Alliant)\b|\bPolaris\b(?=[^.?!;]{0,40}\b(?:GWAC|IDIQ|vehicle|contract|schedule)\b)|\bbasic\s+ordering\s+agreement\b|\bmultiple[- ]award\s+(?:contract|vehicle)\b|\b(?:contract|vehicle|schedule)\s+holders?\b|\bidiq\s+holders?\b/i;
const DEALER_CONTEXT = /\b(?:dealer|distributor|reseller|authorized\s+(?:seller|source))\b/i;
const TERM_CMMC = /\bCMMC\b|\bSPRS\b(?![a-z])|NIST\s+SP?\s*800-171|\b252\.204-70(?:12|19|20|21)\b|cybersecurity\s+maturity\s+model/i;
const TERM_SPEC_REG = /\bJCP\b|joint\s+certification\s+program|\bGSA\s+(?:schedule|MAS|multiple\s+award\s+schedule)\b|\bFAA\b[^.?!;]{0,30}\b(?:certif|airworthiness|repair\s+station)\b|\bairworthiness\s+(?:certif|approval)\b|\bstate\s+(?:contractor'?s?\s+)?licens/i;

// The pivot's REQUIRED offer-time anchor — mirrors frame 5's own tail (the only anchor set the file has).
const ANCHOR = /\b(?:at|by|prior\s+to|before)\s+(?:the\s+)?(?:time\s+of\s+)?(?:offer|proposal|quotation|quote|submission|bid)\b/i;
// H2's "structurally offer-time" present-tense possession shape (the natural implementation of the hypothesis).
const H2_POSSESSION = /\b(?:holders?\s+of|holding|possess(?:ing|ors?\s+of)|maintaining|having|in\s+possession\s+of)\b/i;

type Cls = "clearance" | "vehicle_holder" | "cmmc_award_gate" | "specialized_registration";
const CLASSES: Array<{ cls: Cls; term: RegExp; veto?: (s: string) => boolean }> = [
  { cls: "clearance", term: TERM_CLEARANCE },
  { cls: "vehicle_holder", term: TERM_VEHICLE, veto: (s) => DEALER_CONTEXT.test(s) },
  { cls: "cmmc_award_gate", term: TERM_CMMC },
  { cls: "specialized_registration", term: TERM_SPEC_REG },
];

function exclusionScope(clause: string): string {
  let s = clause;
  for (const r of TRAILING_RIDERS) s = s.replace(r, "");
  return s.trim().length >= 12 ? s : clause;
}
// V3: ESTABLISHMENT deleted; every other exclusion retained (spec deletes exactly one guard).
function excludedV3(clause: string): boolean {
  const scope = exclusionScope(clause);
  return INTERROGATIVE.test(clause) || REPRESENTATION.test(scope) || EVAL_PREFERENCE.test(scope)
    || FLOWDOWN.test(scope) || NEGATED.test(scope);
}
function sentences(source: string): string[] {
  return source.split(/(?<=[.?!])\s+|\r?\n+|;\s+/).map((s) => s.trim()).filter((s) => s.length >= 12 && s.length <= 600);
}

type Variant = "V3-W" | "V3-S" | "V3-H2";
function fire(variant: Variant, text: string): { cls: Cls; span: string } | null {
  for (const s of sentences(text)) {
    if (excludedV3(s)) continue;
    for (let fi = 0; fi < FRAMES.length; fi++) {
      const m = FRAMES[fi].exec(s);
      const obj = m?.[1];
      if (!obj) continue;
      const span = obj.split(OBJECT_MODIFIER_CUT)[0].trim();
      if (span.length < 3) continue;
      // frame 5 carries its own built-in anchor; frames 1-4 must satisfy the pivot's requirement
      if (fi < 4) {
        const anchored = variant === "V3-W" ? ANCHOR.test(s) : ANCHOR.test(span);
        const h2ok = variant === "V3-H2" && H2_POSSESSION.test(span);
        if (!anchored && !h2ok) continue;
      }
      for (const c of CLASSES) {
        if (!c.term.test(span)) continue;
        if (c.veto?.(span)) continue;
        return { cls: c.cls, span: span.slice(0, 90) };
      }
    }
  }
  return null;
}

// ── probes ──
interface Probe { id: string; text: string; expect: Record<Variant, string>; note: string }
const P: Probe[] = [
  {
    id: "P1 S-02 SeaPort holder bar (banked TRUE fire, audit-hardbar.test.ts:50/188)",
    text: "Award is limited to holders of the SeaPort-NxG multiple-award contract (MAC).",
    expect: { "V3-W": "null=TRUE-BAR LOST", "V3-S": "null=TRUE-BAR LOST", "V3-H2": "fire" },
    note: "Spec §3 admits this loss for SeaPort only; the banked suite pins it as a MUST-FIRE.",
  },
  {
    id: "P2 S-03-class GSA-Schedule holder bar (banked TRUE fire, test:192)",
    text: "Only firms holding a current GSA Schedule contract are eligible for award.",
    expect: { "V3-W": "null=TRUE-BAR LOST", "V3-S": "null=TRUE-BAR LOST", "V3-H2": "fire" },
    note: "NOT named in the spec's cost list — a second banked true-fire silenced by the pivot.",
  },
  {
    id: "P3 B2-1 REBORN: establishment + quote deadline in one clause-chain (eBuy register)",
    text: "Award will be limited to a single BPA, and all quotes must be submitted through GSA eBuy prior to the quote due date.",
    expect: { "V3-W": "FIRE=P0 over-fire", "V3-S": "FIRE=P0 over-fire", "V3-H2": "FIRE=P0 over-fire" },
    note: "The spec's flagship closure. The submission deadline supplies the anchor; the 180-char object window still swallows the comma-coordinated clause. ESTABLISHMENT (which caught 'a single' pre-pivot) is DELETED.",
  },
  {
    id: "P4 B1-1 REBORN: comma smuggle with an OFFER-TIME (not post-award) admin deadline",
    text: "Award is limited to small business concerns, and offerors must submit the completed DD-254 prior to the proposal due date.",
    expect: { "V3-W": "FIRE=P0 over-fire", "V3-S": "FIRE=P0 over-fire", "V3-H2": "FIRE=P0 over-fire" },
    note: "B1-1's family generator re-armed: pick a benign second clause with an at-offer deadline instead of 'after award'.",
  },
  {
    id: "P5 B3-1 PoP register through frame 2 (the pivot's genuine closure)",
    text: "To be eligible for award, the offeror must maintain a facility security clearance at the SECRET level during the period of performance.",
    expect: { "V3-W": "null=closed", "V3-S": "null=closed", "V3-H2": "null=closed" },
    note: "Credit where due: anchor-required genuinely closes the finite-verb PoP family (no offer-time anchor present).",
  },
  {
    id: "P6 H2(b) KILL #1: participial maintenance-for-duration (ratified #572 benign class)",
    text: "Only firms holding a SECRET facility clearance for the life of the contract are eligible for award of classified task orders.",
    expect: { "V3-W": "null", "V3-S": "null", "V3-H2": "FIRE=false NHR on #572 class" },
    note: "FLOWDOWN lists 'throughout performance' but NOT 'for the life of the contract' (B3-1/U3-04's documented gap) — H2's anchor-free possession shape walks straight through it. (First draft nulled on frame 3's {0,80} capture window, NOT on H2 — probe-validity check applied.)",
  },
  {
    id: "P7 H2(b) KILL #2: eligibility-to-PERFORM vs eligibility-for-AWARD (NISPOM invite-the-uncleared)",
    text: "Only firms possessing a TOP SECRET facility clearance are eligible to perform the classified portions of this effort.",
    expect: { "V3-W": "null", "V3-S": "null", "V3-H2": "FIRE=false NHR" },
    note: "Present possession is current-at-READING-time; the reading time of an eligible-to-PERFORM sentence is performance. DCSA sponsors FCLs post-selection (R1 BRK-3, judge-verified posture) — the same package can say 'an FCL is not required to propose' three sections away.",
  },
  {
    id: "P8 anchor-allowlist UNDER-fire on the FAR-canonical register (B3-2 family)",
    text: "To be eligible for award, an offeror must possess an active TOP SECRET facility clearance as of the date set for receipt of proposals.",
    expect: { "V3-W": "null=TRUE-BAR LOST", "V3-S": "null=TRUE-BAR LOST", "V3-H2": "null=TRUE-BAR LOST" },
    note: "Probe phrase is pattern-grounded (ULTRA-B1 B3-2 documented variant, accepted last round — NOT fetched verbatim from a FAR provision this session). The CANONICAL-register claim rests on live-fetched FAR 52.215-1 phrases ('exact time specified for receipt of offers', 'solicitation closing date and time') — also outside the anchor set. Either way the allowlist misses the formal register while P3/P4 show smuggles supplying the informal one.",
  },
  {
    id: "P9 B2-2 outcome check: genuine holder bar inside establishment clause",
    text: "Only one BPA will be established with a firm holding a current GSA Multiple Award Schedule contract.",
    expect: { "V3-W": "null (bar STILL dead)", "V3-S": "null (bar STILL dead)", "V3-H2": "null (no frame)" },
    note: "Spec table claims B2-2 'closed by construction' via guard deletion. Outcome is identical to the defect: the genuine Schedule-holder bar produces NO fire in any variant ('will be established' matches no frame).",
  },
  {
    id: "P10 control: anchored possession bar still fires everywhere",
    text: "To be eligible for award, offerors must possess an active TOP SECRET facility clearance at the time of proposal submission.",
    expect: { "V3-W": "fire", "V3-S": "fire", "V3-H2": "fire" },
    note: "Continuity control.",
  },
];

let breaks = 0, ok = 0;
for (const p of P) {
  console.log(`\n── ${p.id}`);
  console.log(`   "${p.text}"`);
  for (const v of ["V3-W", "V3-S", "V3-H2"] as Variant[]) {
    const r = fire(v, p.text);
    const got = r ? `FIRE [${r.cls}] span="${r.span}"` : "null";
    const exp = p.expect[v];
    const isBreak = (exp.includes("P0") && !!r) || (exp.includes("LOST") && !r) || (exp.includes("false NHR") && !!r) || (exp.includes("STILL dead") && !r);
    const tag = isBreak ? "BREAK" : (!!r === exp.startsWith("fire") || (exp.startsWith("null") && !r)) ? "OK" : "UNEXPECTED";
    if (isBreak) breaks++; else ok++;
    console.log(`   ${v.padEnd(6)} → ${got.padEnd(70)} expect: ${exp}  [${tag}]`);
  }
  console.log(`   note: ${p.note}`);
}
console.log(`\nTOTAL probe-variant outcomes: ${breaks} BREAK-class · ${ok} OK/expected`);
export {};
