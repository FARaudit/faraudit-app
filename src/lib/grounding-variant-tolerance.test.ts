// $0 PROOF — UNIT 2.2 GROUNDING-MATCHER VARIANT TOLERANCE + TRUE-LOCATION ATTRIBUTION (Brain cards #548/#549). Run:
//   npx tsx src/lib/grounding-variant-tolerance.test.ts
//
// Live driver: SEQ-2 12318726Q0165 audit dccce793 — the NHR banner read "A potential disqualifying
// requirement in §L could not be grounded to a finding: 'Maintain licensing requirements,
// certifications, accreditations, and the required insurance'." Both halves false vs source: the
// comma-form sentence lives at PWS §7.3.2 (the Nurse — a reference-only, non-billable row), NOT §L;
// and its slash-form twin (§7.2.2) WAS grounded as the audit's own P0 finding — the exact-gram
// matcher can't cross comma/slash + plural drift on the sentence HEAD, and the finding's citation
// ("PWS §7.2.2") parses to no UCF letter so the same-section constraint also blocked it. On the
// commercial route both PWS rows sit in the SAME routed "L" slice (the fixtures mirror that). Banks:
// twin-pair reproduction (counter-proof) · the fix · negative probes BOTH directions · the locator ·
// the gate-reason surface through the REAL completenessOf→gradeCoverageV2→gateV2Outcome composition.
import { completenessOf, locateObligationContext, normVariant } from "./audit-orchestrator";
import type { AuditToolContext } from "./audit-tools";
import { gradeCoverageV2, gateV2Outcome } from "./audit-gate-v2";
import type { TypedFinding } from "./audit-findings";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const FLAG = "AUDIT_GROUNDING_VARIANT_TOLERANCE";
const withFlag = <T>(on: boolean, fn: () => T): T => {
  const prev = process.env[FLAG];
  if (on) process.env[FLAG] = "true"; else delete process.env[FLAG];
  try { return fn(); } finally { if (prev === undefined) delete process.env[FLAG]; else process.env[FLAG] = prev; }
};

// ── The dccce793 twin pair (comma-form obligation head vs slash-form finding excerpt) ───────────────
const OB_COMMA = "Maintain licensing requirements, certifications, accreditations, and the required insurance coverage during the entire performance period with proof being submitted to the CO upon request.";
const EX_SLASH = "Maintain licensing requirements/certification/accreditation and required insurance coverage at a minimum of $1 mil per occurrence/3 mil aggregate during the entire performance period with proof being submitted to the CO upon request";
// A REAL bar sentence with no grounding finding (stays ungrounded both states → carries the gate reason ON).
const OB_BAR = "Personnel who fail to maintain the required professional licensure will not be considered for continued performance.";
// The routed "L" slice mirrors dccce793: BOTH PWS rows landed in the same commercial slice keyed "L".
const L_TEXT = [
  "Instructions to quoters follow below.",
  `7.2.2. ${EX_SLASH}.`,
  `7.3.2. ${OB_COMMA}`,
  `7.4.1. ${OB_BAR}`,
].join("\n");
const FULL_SOURCE = [
  "==== DOCUMENT: Combined Solicitation RFQ.pdf ====",
  "Performance Work Statement. PLEASE NOTE: This position is only for the Drug/Alcohol Abuse Counselor. All other positions are for reference only.",
  "7.2. Key personnel requirements apply to the following labor categories.",
  L_TEXT,
  "8.1. The Government will monitor performance under the QASP.",
].join("\n");
const mkCtx = (): AuditToolContext => ({ fullSource: FULL_SOURCE, sections: { L: L_TEXT } } as unknown as AuditToolContext);
const TWIN_FINDING: TypedFinding = { id: "f1", kind: "eligibility_bar", excerpt: EX_SLASH, citation: "PWS §7.2.2", severity: "P0", disposition: "gate_to_clear", requirement: "insurance" } as unknown as TypedFinding;
const attL = (r: ReturnType<typeof completenessOf>) => r.attestations.find((a) => a.section === "L")!;

console.log("\n── P1 — normVariant: the comma/slash+plural class collapses; distinct content stays distinct ──");
{
  const a = normVariant("requirements, certifications, accreditations, and the required insurance");
  const b = normVariant("requirements/certification/accreditation and required insurance");
  assert(a === b, `variant-normal forms equal ("${a}")`);
  assert(normVariant("shall submit a price list") !== normVariant("shall submit a compliance matrix"), "distinct obligations stay distinct");
  assert(normVariant("") === "" && normVariant("///,,,") === "", "degenerate inputs safe");
}

console.log("\n── P2 — COUNTER-PROOF (flag OFF reproduces the live false-NHR driver) ──");
{
  const r = withFlag(false, () => completenessOf(mkCtx(), ["L"], [TWIN_FINDING], new Set(["L"])));
  assert(attL(r).ungrounded.some((u) => u.includes("Maintain licensing requirements,")), "OFF: comma-form obligation UNGROUNDED despite its grounded twin (reproduces dccce793)");
  const out = gateV2Outcome(gradeCoverageV2(r.attestations));
  assert(out.cap === "NEEDS_HUMAN_REVIEW" && out.reason.includes("in §L"), `OFF: gate caps NHR attributing "§L" (the fabricated attribution) — ${out.reason.slice(0, 90)}…`);
}

console.log("\n── P3 — FIX: flag ON grounds the twin (variant grams + section-null same-span relaxation) ──");
{
  const r = withFlag(true, () => completenessOf(mkCtx(), ["L"], [TWIN_FINDING], new Set(["L"])));
  assert(!attL(r).ungrounded.some((u) => u.includes("Maintain licensing requirements,")), "ON: the dccce793 NHR driver GROUNDS to its twin finding");
  assert(attL(r).citedFindingIds.includes("f1"), "ON: grounding cites the twin finding id");
  assert(attL(r).ungrounded.some((u) => u.includes("will not be considered")), "ON: the genuinely-unmatched bar sentence STAYS ungrounded (fail-toward-disqualifier intact)");
}

console.log("\n── P4 — NEGATIVE probes: tolerance must not launder ──");
{
  const UNRELATED: TypedFinding = { id: "f2", kind: "other", excerpt: "The Government will award to the responsible offeror whose quote is most advantageous.", citation: "PWS §2.1", severity: "P1", disposition: "gate_to_clear", requirement: "x" } as unknown as TypedFinding;
  const r = withFlag(true, () => completenessOf(mkCtx(), ["L"], [UNRELATED], new Set(["L"])));
  assert(attL(r).ungrounded.some((u) => u.includes("Maintain licensing requirements,")), "ON: an unrelated finding does NOT ground the obligation");
  // S7 cross-section guard intact: same twin excerpt cited to a DIFFERENT UCF letter never grounds
  const CROSS: TypedFinding = { ...TWIN_FINDING, id: "f3", citation: "Section B" } as TypedFinding;
  const r2 = withFlag(true, () => completenessOf(mkCtx(), ["L"], [CROSS], new Set(["L"])));
  assert(attL(r2).ungrounded.some((u) => u.includes("Maintain licensing requirements,")), "ON: a §B-cited finding still cannot ground a §L obligation (S7 guard intact)");
  // section-null relaxation requires SAME-SPAN: an excerpt NOT present in this section's text cannot certify it
  const ELSEWHERE: TypedFinding = { ...TWIN_FINDING, id: "f4", excerpt: "Maintain licensing and other obligations as restated in the QASP appendix, an entirely different span of text" } as TypedFinding;
  const r3 = withFlag(true, () => completenessOf(mkCtx(), ["L"], [ELSEWHERE], new Set(["L"])));
  assert(attL(r3).ungrounded.some((u) => u.includes("Maintain licensing requirements,")), "ON: a null-section finding whose excerpt is NOT in this section's text does not ground it");
}

console.log("\n── P5 — locator: true section + scope context carried; inert dark; never fabricates ──");
{
  const off = withFlag(false, () => locateObligationContext(FULL_SOURCE, OB_COMMA));
  assert(off === null, "OFF: locator inert (flag-gated)");
  const on = withFlag(true, () => locateObligationContext(FULL_SOURCE, OB_COMMA));
  assert(!!on && on.locatedAt.includes("7.3.2"), `ON: located at the true heading (got "${on?.locatedAt}")`);
  assert(!!on && /reference only|position is only for/i.test(on.contextNote ?? ""), `ON: scope note carried (got "${on?.contextNote ?? "(none)"}")`);
  const bar = withFlag(true, () => locateObligationContext(FULL_SOURCE, OB_BAR));
  assert(!!bar && bar.locatedAt.includes("7.4.1"), `ON: the bar sentence locates to 7.4.1 (got "${bar?.locatedAt}")`);
  const miss = withFlag(true, () => locateObligationContext(FULL_SOURCE, "totally absent sentence about bonding capacity thresholds and sureties"));
  assert(miss === null, "ON: locator returns null for a sentence not in source (no fabricated location)");
}

console.log("\n── P6 — gate-reason surface through the REAL composition: true location, pole unchanged ──");
{
  // Flag ON end-to-end: the twin grounds (P3), the licensure bar stays ungrounded → it carries the NHR
  // reason — now located to ITS true heading instead of the routed "L" key. Pole unchanged.
  const out = withFlag(true, () => {
    const r = completenessOf(mkCtx(), ["L"], [TWIN_FINDING], new Set(["L"]));
    const cov = gradeCoverageV2(r.attestations, { locate: (ob) => locateObligationContext(FULL_SOURCE, ob) });
    return gateV2Outcome(cov);
  });
  assert(out.cap === "NEEDS_HUMAN_REVIEW", "pole unchanged: the genuinely-ungrounded bar still caps NHR");
  assert(out.reason.includes("will not be considered"), "reason carries the REAL ungrounded bar (not the grounded twin)");
  assert(out.reason.includes("at ") && out.reason.includes("7.4.1") && !out.reason.includes("in §L"), `reason names the TRUE location, not the routed key — ${out.reason.slice(0, 130)}…`);
  // No locator wired (legacy caller) ⇒ legacy reason shape, byte-identical
  const legacy = withFlag(true, () => {
    const r = completenessOf(mkCtx(), ["L"], [TWIN_FINDING], new Set(["L"]));
    return gateV2Outcome(gradeCoverageV2(r.attestations));
  });
  assert(legacy.reason.includes("in §L") && !legacy.reason.includes("Surrounding context"), "no locator wired ⇒ legacy reason shape (byte-identical)");
}

console.log("\n── P7 (R1-F1) — LAUNDERING regressions: one generic gram is NOT a grounding proof ──");
{
  // 2a shape: a section-null benign-logistics finding sharing ONLY the generic head with a disqualifier
  const OB_SITE = "Quotes shall be submitted only by vendors who attended the mandatory site visit; quotes from vendors who did not attend will not be considered for award.";
  const L2 = `Instructions follow.\n9.1. ${OB_SITE}`;
  const ctx2 = { fullSource: L2, sections: { L: L2 } } as unknown as AuditToolContext;
  const GENERIC: TypedFinding = { id: "g1", kind: "submission", excerpt: "Quotes shall be submitted electronically to the contracting office email inbox before the closing date and time stated on the cover page", citation: "PWS §2.1", severity: "P1", disposition: "gate_to_clear", requirement: "email" } as unknown as TypedFinding;
  // make the generic excerpt same-span-present so ONLY the coverage bar stands between it and laundering
  const L2b = `${L2}\n${GENERIC.excerpt}.`;
  const ctx2b = { fullSource: L2b, sections: { L: L2b } } as unknown as AuditToolContext;
  const r = withFlag(true, () => completenessOf(ctx2b, ["L"], [GENERIC], new Set(["L"])));
  // obligationsOf splits at ";" — the graded piece is the site-visit half (the "will not be considered"
  // half carries no obligation verb); the coverage bar must keep the graded piece ungrounded.
  assert(r.attestations[0].ungrounded.some((u) => u.includes("mandatory site visit")),
    "ON: generic-head section-null finding does NOT ground the site-visit obligation (coverage bar holds)");
  void ctx2;
  // 2b shape: variant-only bridge to a different-subject finding, letter-cited
  const OB_TRANS = "The offeror shall provide the certified translator staffing plan and shall maintain certified translator coverage for all shifts at the facility.";
  const L3 = `Instructions follow.\n9.2. ${OB_TRANS}`;
  const ctx3 = { fullSource: L3, sections: { L: L3 } } as unknown as AuditToolContext;
  const BRIDGE: TypedFinding = { id: "g2", kind: "other", excerpt: "offeror shall provide certified copies of insurance policies to the contracting officer upon request during performance", citation: "§L", severity: "P1", disposition: "gate_to_clear", requirement: "ins" } as unknown as TypedFinding;
  const r2 = withFlag(true, () => completenessOf(ctx3, ["L"], [BRIDGE], new Set(["L"])));
  assert(r2.attestations[0].ungrounded.some((u) => u.includes("certified translator")),
    "ON: a variant-only single-gram bridge does NOT ground a different-subject obligation");
  // 1c shape: an UNCITED finding is never a grounder via the relaxation
  const UNCITED: TypedFinding = { ...TWIN_FINDING, id: "g3", citation: "" } as TypedFinding;
  const r3 = withFlag(true, () => completenessOf(mkCtx(), ["L"], [UNCITED], new Set(["L"])));
  assert(attL(r3).ungrounded.some((u) => u.includes("Maintain licensing requirements,")),
    "ON: an uncited (empty-citation) finding cannot ground via the section-null relaxation");
  // and the REAL twin still grounds (coverage ~100% clears the bar)
  const r4 = withFlag(true, () => completenessOf(mkCtx(), ["L"], [TWIN_FINDING], new Set(["L"])));
  assert(!attL(r4).ungrounded.some((u) => u.includes("Maintain licensing requirements,")),
    "ON: the dccce793 twin STILL grounds under the substantive-coverage bar");
}

console.log("\n── P8 (R1-F2/F8) — locator does not fabricate headings ──");
{
  const SRC = [
    "==== DOCUMENT: Combined Solicitation RFQ.pdf ====",
    "Performance Work Statement overview text.",
    "7.3. Key personnel requirements are listed below.",
    "23.55", // a bare wage-rate line between the true heading and the sentence
    `Some intervening table text.\n12.31.2025\n7.3.2. ${OB_COMMA}`,
  ].join("\n");
  const on = withFlag(true, () => locateObligationContext(SRC, OB_COMMA));
  assert(!!on && on.locatedAt.includes("7.3.2") && !on.locatedAt.includes("23.55") && !on.locatedAt.includes("12.31"),
    `ON: rate/date lines never become headings (got "${on?.locatedAt}")`);
  // no validated heading anywhere → locator DECLINES (legacy reason), never "(unheaded region)"
  const bare = `==== DOCUMENT: Notes.pdf ====\nplain text with no headings at all\n${OB_BAR}`;
  const none = withFlag(true, () => locateObligationContext(bare, OB_BAR));
  assert(none === null, "ON: no validated heading ⇒ locator declines (renders legacy 'in §<key>')");
}

console.log("\n── P9 (R1-F3) — scope-note labeling: adjacent asserted, distant flagged for verification ──");
{
  const near = withFlag(true, () => locateObligationContext(FULL_SOURCE, OB_COMMA));
  assert(!!near && /^(Surrounding context|An earlier scope note)/.test(near.contextNote ?? ""), `note is labeled (got "${(near?.contextNote ?? "").slice(0, 60)}…")`);
  const FAR_SRC = [
    "==== DOCUMENT: Combined Solicitation RFQ.pdf ====",
    "General Information. PLEASE NOTE: All other positions are for reference only.",
    `${"Filler paragraph of ordinary PWS text repeated for distance. ".repeat(60)}`,
    `7.4.1. ${OB_BAR}`,
  ].join("\n");
  const far = withFlag(true, () => locateObligationContext(FAR_SRC, OB_BAR));
  assert(!!far && /verify it governs/.test(far.contextNote ?? ""), `distant note carries the verify-applicability label (got "${(far?.contextNote ?? "").slice(0, 80)}…")`);
}

console.log("\n── P10 (R1-F7) — singularization covers -es/-ies/possessive classes ──");
{
  const pairs: Array<[string, string]> = [
    ["small business", "small businesses"],
    ["the labor class", "the labor classes"],
    ["the match", "the matches"],
    ["facility", "facilities"],
    ["offeror's quote", "offerors quote"],
  ];
  for (const [a, b] of pairs) assert(normVariant(a) === normVariant(b), `"${a}" ≡ "${b}" (got "${normVariant(a)}" vs "${normVariant(b)}")`);
  assert(normVariant("class") === "clas".replace("clas", "class"), `-ss guard holds ("class" → "${normVariant("class")}")`);
}

console.log("\n── P11 (R2-F1) — the substantive bar: idiom bridges, half-coverage, scattered grams all FAIL ──");
{
  const mk = (obSentence: string, excerpt: string, citation = "PWS §3.3") => {
    const L = `Instructions follow below.\n9.7. ${obSentence}\n${excerpt}.`;
    const ctx = { fullSource: L, sections: { L } } as unknown as AuditToolContext;
    const F: TypedFinding = { id: "fx", kind: "other", excerpt, citation, severity: "P1", disposition: "gate_to_clear", requirement: "x" } as unknown as TypedFinding;
    return withFlag(true, () => completenessOf(ctx, ["L"], [F], new Set(["L"])));
  };
  // a1 — SHORT disqualifier vs a DIFFERENT bar's identical consequence idiom (trigger covered, no subject)
  const a1 = mk("Quote submissions received late will not be considered.",
    "Quotes lacking the signed site visit acknowledgment form will not be considered");
  assert(a1.attestations[0].ungrounded.some((u) => u.includes("received late")),
    "a1: consequence-idiom bridge does NOT ground a short disqualifier (trigger needs shared subject)");
  // a2 — logistics head covered (~50%), consequence tail in NO finding
  const a2 = mk("Quotes shall be submitted via email to the Contracting Officer and quotes received after the deadline will not be considered.",
    "Quotes shall be submitted via email to the Contracting Officer no later than the closing date stated on the cover page");
  assert(a2.attestations[0].ungrounded.some((u) => u.includes("will not be considered")),
    "a2: half-covered obligation with UNCOVERED trigger does NOT ground");
  // a3 — scattered grams from a two-idiom excerpt, no contiguous majority run
  const a3 = mk("The offeror shall provide certified interpreters and facsimile submissions of interpreter credentials will not be considered.",
    "The offeror shall provide certified copies of insurance policies. Facsimile submissions of any kind will not be considered by the office");
  assert(a3.attestations[0].ungrounded.some((u) => u.includes("interpreters")),
    "a3: scattered-gram assembly does NOT ground (contiguity required)");
  // control — the dccce793 twin STILL grounds under the hardened bar
  const r4 = withFlag(true, () => completenessOf(mkCtx(), ["L"], [TWIN_FINDING], new Set(["L"])));
  assert(!attL(r4).ungrounded.some((u) => u.includes("Maintain licensing requirements,")),
    "control: the dccce793 twin still grounds (contiguous full-substance share)");
}

console.log("\n── P12 (R2-F2/F3) — mixed-delimiter headings decline; cross-heading near notes are labeled ──");
{
  // R2-F2: space-delimited depth-2 heading (rejected) NEARER than the accepted §10.1 ⇒ locator declines
  const MIX = [
    "==== DOCUMENT: PWS.pdf ====",
    "Performance Work Statement.",
    "10.1. General duties described here.",
    "10.2 Key Personnel",
    `${OB_BAR}`,
  ].join("\n");
  const mixed = withFlag(true, () => locateObligationContext(MIX, OB_BAR));
  assert(mixed === null, "R2-F2: rejected nearer candidate ⇒ DECLINE (no fallback to §10.1)");
  // R2-F3: a near-window note under the PREVIOUS heading is labeled, not asserted
  const CROSS = [
    "==== DOCUMENT: PWS.pdf ====",
    "Performance Work Statement.",
    "9.8. Physician. The Physician position is for reference only.",
    `9.9. ${OB_BAR}`,
  ].join("\n");
  const cross = withFlag(true, () => locateObligationContext(CROSS, OB_BAR));
  assert(!!cross && cross.locatedAt.includes("9.9"), `R2-F3: bar locates to its own heading (got "${cross?.locatedAt}")`);
  assert(!!cross && /verify it governs/.test(cross.contextNote ?? "") && !/^Surrounding context/.test(cross.contextNote ?? ""),
    `R2-F3: cross-heading near note is LABELED, never asserted (got "${(cross?.contextNote ?? "").slice(0, 70)}…")`);
}

console.log("\n── P13 (R2-F4) — the -se/-ze plural class unifies; -ss guard intact ──");
{
  const pairs: Array<[string, string]> = [
    ["clauses", "clause"], ["licenses", "license"], ["responses", "response"], ["purposes", "purpose"],
    ["phases", "phase"], ["leases", "lease"], ["releases", "release"], ["cases", "case"],
    ["exercises", "exercise"], ["expenses", "expense"], ["increases", "increase"], ["sizes", "size"], ["databases", "database"],
  ];
  for (const [a, b] of pairs) assert(normVariant(a) === normVariant(b), `"${a}" ≡ "${b}" (got "${normVariant(a)}" vs "${normVariant(b)}")`);
  assert(normVariant("the labor classes") === normVariant("the labor class"), "classes/class still unified (-ss guard)");
  assert(normVariant("small businesses") === normVariant("small business"), "businesses/business still unified");
}

console.log("\n── P14 (R3-F1/F2/F3/F4) — trigger-tail bridges, fail-closed triggers, multi-trigger, collision flips ──");
{
  const mk = (obSentence: string, excerpt: string, citation = "PWS §3.3") => {
    const L = `Instructions follow below.\n9.7. ${obSentence}\n${excerpt}.`;
    const ctx = { fullSource: L, sections: { L } } as unknown as AuditToolContext;
    const F: TypedFinding = { id: "fx", kind: "other", excerpt, citation, severity: "P1", disposition: "gate_to_clear", requirement: "x" } as unknown as TypedFinding;
    return withFlag(true, () => completenessOf(ctx, ["L"], [F], new Set(["L"])));
  };
  // R3-F1a — the idiom + its standard tail ("for award") is NOT a subject
  const b1 = mk("Quote submissions received late will not be considered for award.",
    "Quotations submitted by telephone or facsimile will not be considered for award");
  assert(b1.attestations[0].ungrounded.some((u) => u.includes("received late")),
    "R3-F1: trigger + 'for award' tail does NOT bridge different-subject bars");
  // R3-F1b — auxiliary tokens ("shall be") are not a subject
  const b2 = mk("Quote packages without the signed acknowledgment shall be deemed non-responsive.",
    "Offers exceeding the stated page limit shall be deemed non-responsive for evaluation purposes");
  assert(b2.attestations[0].ungrounded.some((u) => u.includes("signed acknowledgment")),
    "R3-F1: auxiliary bridge ('shall be deemed non-responsive') does NOT ground");
  // R3-F2 — failure-to family: partial-token trigger must FAIL CLOSED, never skip
  const b3 = mk("Failure to submit the completed SF-1449 will result in disqualification of the quotation.",
    "The price schedule must include all option periods and will result in disqualification of the quotation if incomplete");
  assert(b3.attestations[0].ungrounded.some((u) => u.includes("SF-1449")),
    "R3-F2: failure-to trigger enforced (snapped to word boundary, fail-closed)");
  // R3-F3 — EVERY trigger in a compound sentence enforced
  const b4 = mk("Quotes received after the exact deadline stated on the cover page will not be considered, and offerors failing to complete the site visit shall be rejected.",
    "Quotes received after the exact deadline stated on the cover page will not be considered");
  assert(b4.attestations[0].ungrounded.some((u) => u.includes("site visit")),
    "R3-F3: a compound bar's SECOND trigger must also be covered (matchAll)");
  // R3-F4 — SAM ≡ "same" collision closed by the result-length guard
  assert(normVariant("registered in SAM") !== normVariant("registered in the same"),
    `R3-F4: sam/same no longer collide (got "${normVariant("registered in SAM")}" vs "${normVariant("registered in the same")}")`);
  assert(normVariant("please note") !== normVariant("please not"), "R3-F4: note/not distinct");
  const b5 = mk("Offerors must be registered in SAM at time of quote submission.",
    "Vendors shall be registered in the same manner at time of quote submission to the portal");
  assert(b5.attestations[0].ungrounded.some((u) => u.includes("SAM")),
    "R3-F4: the SAM/'same' collision flip is dead end-to-end");
  // fallthrough singulars still unify (result-length guard falls through to -s strip)
  for (const [a, b] of [["cases", "case"], ["uses", "use"], ["sizes", "size"], ["bases", "base"]] as Array<[string, string]>)
    assert(normVariant(a) === normVariant(b), `"${a}" ≡ "${b}" via -s fallthrough (got "${normVariant(a)}" vs "${normVariant(b)}")`);
}

console.log("\n── P15 (R3-F5) — bare-number heading lines: deep outline accepted, shallow/rate declines ──");
{
  // depth-3 bare number with title on next line = the TRUE heading (accepted)
  const DEEP = [
    "==== DOCUMENT: PWS.pdf ====",
    "Performance Work Statement.",
    "10.1. Scope described here.",
    "10.2. Key personnel overview follows.",
    "10.2.1\nKey Personnel Licensure",
    `${OB_BAR}`,
  ].join("\n");
  const deep = withFlag(true, () => locateObligationContext(DEEP, OB_BAR));
  assert(!!deep && deep.locatedAt.includes("10.2.1"), `R3-F5: deep bare-number heading accepted (got "${deep?.locatedAt}")`);
  // depth-2 bare number (or a rate line) = rejected candidate nearer than the last accepted ⇒ DECLINE
  const SHALLOW = [
    "==== DOCUMENT: PWS.pdf ====",
    "Performance Work Statement.",
    "7.1. Pricing tables. The staffing rates shown are for estimating purposes only.",
    "7.2\nDelivery of Nursing Services",
    `${OB_BAR}`,
  ].join("\n");
  const shallow = withFlag(true, () => locateObligationContext(SHALLOW, OB_BAR));
  assert(shallow === null, "R3-F5: shallow bare-number line forces DECLINE (no §7.1 misattribution, no asserted note)");
}

console.log("\n── P16 (R4-F1/F2/F4) — trigger-less tail bridges, duplicate idioms, dateline headings ──");
{
  const mk = (obSentence: string, excerpt: string, citation = "PWS §3.3") => {
    const L = `Instructions follow below.\n9.7. ${obSentence}\n${excerpt}.`;
    const ctx = { fullSource: L, sections: { L } } as unknown as AuditToolContext;
    const F: TypedFinding = { id: "fx", kind: "other", excerpt, citation, severity: "P1", disposition: "gate_to_clear", requirement: "x" } as unknown as TypedFinding;
    return withFlag(true, () => completenessOf(ctx, ["L"], [F], new Set(["L"])));
  };
  // R4-F1 — TRIGGER-LESS boilerplate-tail bridge: a deadline tail ≥50% of a short bar must NOT ground it
  const c1 = mk("SAM registration must be active no later than the date and time specified for receipt of quotes.",
    "Questions must be submitted no later than the date and time specified for receipt of quotes");
  assert(c1.attestations[0].ungrounded.some((u) => u.includes("SAM registration")),
    "R4-F1: trigger-less deadline-tail bridge does NOT ground (head anchor required)");
  const c2 = mk("Offerors lacking an active facility clearance must notify the Contracting Officer at the time and date specified in block 8 of the SF-1449.",
    "Invoices shall reference the contract number and be submitted at the time and date specified in block 8 of the SF-1449");
  assert(c2.attestations[0].ungrounded.some((u) => u.includes("facility clearance")),
    "R4-F1: block-8 tail bridge does NOT ground a clearance bar");
  // R4-F2 — duplicate consequence idiom: a clipped excerpt covering only the FIRST occurrence must refuse
  const OB_DUP = "Late quotes will not be considered, and quotes lacking the required bid guarantee will not be considered.";
  const c3 = mk(OB_DUP, "Late quotes will not be considered, and quotes lacking the required bid");
  assert(c3.attestations[0].ungrounded.some((u) => u.includes("bid guarantee")),
    "R4-F2: EVERY occurrence of a repeated trigger must be covered (clipped excerpt refused)");
  // control — full-sentence excerpt still grounds the compound bar
  const c4 = mk(OB_DUP, OB_DUP.slice(0, -1));
  assert(!c4.attestations[0].ungrounded.some((u) => u.includes("bid guarantee")),
    "control: the full verbatim compound bar still grounds");
  // R4-F4 — dateline "1.2.26" with a letter-bearing next line must NOT become a heading (no outline root)
  const DATE = [
    "==== DOCUMENT: cover-letter.pdf ====",
    "1.2.26\nAmendment of Solicitation Requirements",
    `${OB_BAR}`,
  ].join("\n");
  const date = withFlag(true, () => locateObligationContext(DATE, OB_BAR));
  assert(date === null || !date.locatedAt.includes("1.2.26"), `R4-F4: dateline never fabricates a heading (got "${date?.locatedAt ?? "null"}")`);
  // and the outline-consistent deep bare number still validates (P15 DEEP shape: root 10 accepted via 10.1.)
  const DEEP2 = [
    "==== DOCUMENT: PWS.pdf ====",
    "Performance Work Statement.",
    "10.1. Scope described here.",
    "10.2. Key personnel overview follows.",
    "10.2.1\nKey Personnel Licensure",
    `${OB_BAR}`,
  ].join("\n");
  const deep2 = withFlag(true, () => locateObligationContext(DEEP2, OB_BAR));
  assert(!!deep2 && deep2.locatedAt.includes("10.2.1"), `control: outline-consistent bare heading still accepted (got "${deep2?.locatedAt}")`);
}

console.log("\n── P17 (R5-F1/F2/F3/F4/F6) — head-bridges, occurrence inflation, subject-swap, datelines, note clamp ──");
{
  const mk = (obSentence: string, excerpt: string, citation = "PWS §3.3") => {
    const L = `Instructions follow below.\n9.7. ${obSentence}\n${excerpt}.`;
    const ctx = { fullSource: L, sections: { L } } as unknown as AuditToolContext;
    const F: TypedFinding = { id: "fx", kind: "other", excerpt, citation, severity: "P1", disposition: "gate_to_clear", requirement: "x" } as unknown as TypedFinding;
    return withFlag(true, () => completenessOf(ctx, ["L"], [F], new Set(["L"])));
  };
  // R5-F1 — HEAD-BRIDGE: a compound bar's boilerplate head half must not launder its tail half
  const d1 = mk("Offerors must be registered in the System for Award Management prior to submitting a quote and must possess an active facility security clearance at the time of award.",
    "Offerors must be registered in the System for Award Management prior to submitting a quote");
  assert(d1.attestations[0].ungrounded.some((u) => u.includes("facility security clearance")),
    "R5-F1: compound bar's head half does NOT ground its clearance tail (tail anchor)");
  // R5-F2 — OCCURRENCE INFLATION: an unrelated same-idiom sentence in the excerpt must not tile/count
  const d2 = mk("Late quotes will not be considered, and quotes lacking the required bid guarantee will not be considered.",
    "Late quotes will not be considered, and quotes lacking the required bid guarantee remain the offeror's responsibility. Facsimile submissions will not be considered");
  assert(d2.attestations[0].ungrounded.some((u) => u.includes("bid guarantee")),
    "R5-F2: unrelated idiom repetition does NOT tile the compound disqualifier (sentence-scoped)");
  // R5-F3 — SUBJECT-SWAP: token-0 skip only behind a genuine leading conjunction
  const d3 = mk("Subcontractors shall be registered in the System for Award Management prior to the award of any subcontract.",
    "Offerors shall be registered in the System for Award Management prior to the award of any subcontract");
  assert(d3.attestations[0].ungrounded.some((u) => u.includes("Subcontractors")),
    "R5-F3: subject-swap at token 0 does NOT ground (conjunction-typed head tolerance)");
  // positive — an "and"-led obligation twin still grounds through the conjunction tolerance
  const OB_AND = "and quotes lacking the signed acknowledgment form shall include a written explanation for the omission.";
  const d4 = mk(OB_AND, "Quotes lacking the signed acknowledgment form shall include a written explanation for the omission");
  assert(!d4.attestations[0].ungrounded.some((u) => u.includes("signed acknowledgment")),
    "control: an 'and'-led obligation twin still grounds (leading-conjunction tolerance)");
  // R5-F4 — parent-prefix: a dateline whose PARENT was never accepted declines (g2 shape)
  const G2 = [
    "==== DOCUMENT: PWS.pdf ====",
    "3.1. Deliverables are described in this section.",
    "3.12.25\nAmendment of Solicitation Requirements",
    `${OB_BAR}`,
  ].join("\n");
  const g2 = withFlag(true, () => locateObligationContext(G2, OB_BAR));
  assert(g2 === null || !g2.locatedAt.includes("3.12.25"), `R5-F4: unparented dateline never fabricates (got "${g2?.locatedAt ?? "null"}")`);
  // R5-F6 — a long scope note renders word-clean with a closed quote
  const LONG_NOTE = `An earlier scope note appears in this document (verify it governs this requirement): "${"positions are for reference only and are not a separately billable requirement under any resulting contract line item ".repeat(3).trim()}".`;
  const out = withFlag(true, () => gateV2Outcome(gradeCoverageV2(
    [{ section: "L", status: "obligations_ungrounded", obligations: [OB_BAR], citedFindingIds: [], ungrounded: [OB_BAR] }],
    { locate: () => ({ locatedAt: "PWS §7.4.1", contextNote: LONG_NOTE }) },
  )));
  const clampTail = /(\S+)…"\.$/.exec(out.reason.trim());
  assert(!!clampTail && new RegExp(`\\b${clampTail[1].replace(/[^\w]/g, "")}\\b`).test(LONG_NOTE),
    `R5-F6: long note clamps at a WHOLE word with a closed quote (tail: …${out.reason.slice(-40)})`);
}

console.log("\n── P18 (R6-F1/F2/F3) — reordered assembly, tail swaps, protected sentence splits ──");
{
  const mk = (obSentence: string, excerpt: string, citation = "PWS §3.3") => {
    const L = `Instructions follow below.\n9.7. ${obSentence}\n${excerpt}.`;
    const ctx = { fullSource: L, sections: { L } } as unknown as AuditToolContext;
    const F: TypedFinding = { id: "fx", kind: "other", excerpt, citation, severity: "P1", disposition: "gate_to_clear", requirement: "x" } as unknown as TypedFinding;
    return withFlag(true, () => completenessOf(ctx, ["L"], [F], new Set(["L"])));
  };
  // R6-F1(i) — REORDERED chunk assembly inside one sentence must refuse (order binding)
  const e1 = mk("Offerors must possess an active facility security clearance at the time of award.",
    "While an active facility security clearance at the time of award is not required, offerors must possess an active System for Award Management registration");
  assert(e1.attestations[0].ungrounded.some((u) => u.includes("facility security clearance")),
    "R6-F1: reversed-chunk single-sentence assembly does NOT ground (order binding)");
  // R6-F2 — final-token swap must refuse (tail anchor is symmetric, token n-1 required)
  const e2 = mk("Offerors must hold evidence of an active facility clearance.",
    "Offerors must hold evidence of an active facility registration");
  assert(e2.attestations[0].ungrounded.some((u) => u.includes("facility clearance")),
    "R6-F2: a tail-noun swap does NOT ground (final token required)");
  // R6-F3 — protected splits: decimals, abbreviation chains, and hard-wraps do NOT fragment a legit twin
  const e3 = mk(OB_COMMA,
    "Maintain licensing requirements/certification/accreditation and required insurance coverage at a minimum of $1.5 mil per occurrence during the entire performance period with proof being submitted to the CO upon request");
  assert(!e3.attestations[0].ungrounded.some((u) => u.includes("Maintain licensing requirements,")),
    "R6-F3: a '$1.5' decimal insertion does not fragment the twin (grounds)");
  const e4 = mk(OB_COMMA,
    "Maintain licensing requirements/certification/accreditation (e.g. professional liability) and required insurance coverage during the entire performance period with proof being submitted to the CO upon request");
  assert(!e4.attestations[0].ungrounded.some((u) => u.includes("Maintain licensing requirements,")),
    "R6-F3: an 'e.g.' abbreviation does not fragment the twin (grounds)");
  const e5 = mk(OB_COMMA,
    "Maintain licensing requirements/certification/accreditation and required insurance\ncoverage during the entire performance period with proof being submitted to the CO upon request");
  assert(!e5.attestations[0].ungrounded.some((u) => u.includes("Maintain licensing requirements,")),
    "R6-F3: a PDF hard-wrap does not fragment the twin (grounds)");
  // control — a REAL sentence boundary still separates (the R5-F2 tiling shape stays dead)
  const e6 = mk("Late quotes will not be considered, and quotes lacking the required bid guarantee will not be considered.",
    "Late quotes will not be considered, and quotes lacking the required bid guarantee remain the offeror's responsibility. Facsimile submissions will not be considered");
  assert(e6.attestations[0].ungrounded.some((u) => u.includes("bid guarantee")),
    "control: real sentence boundaries still refuse the tiling shape (protected split does not merge)");
  // DOCUMENTED POLARITY FLOOR (Brain-sanction pending): an IN-ORDER negation wrapper inside one
  // sentence grounds — the same floor the legacy exact path has. Banked so any behavior change is visible.
  const e7 = mk("Offerors must possess an active facility security clearance at the time of award.",
    "Offerors must possess an active System for Award Management registration, and although an active facility security clearance at the time of award is preferred it is not required for quote submission");
  assert(!e7.attestations[0].ungrounded.some((u) => u.includes("facility security clearance")),
    "documented floor: in-order polarity wrapper grounds (Brain-sanction pending — change = intentional only)");
}

console.log("\n── P19 (R7-F1/F2) — boundary erasure closed, U.S. twins ground, size guard ──");
{
  const mk = (obSentence: string, excerpt: string, citation = "PWS §3.3") => {
    const L = `Instructions follow below.\n9.7. ${obSentence}\n${excerpt}.`;
    const ctx = { fullSource: L, sections: { L } } as unknown as AuditToolContext;
    const F: TypedFinding = { id: "fx", kind: "other", excerpt, citation, severity: "P1", disposition: "gate_to_clear", requirement: "x" } as unknown as TypedFinding;
    return withFlag(true, () => completenessOf(ctx, ["L"], [F], new Set(["L"])));
  };
  const OB_DBL = "Late quotes will not be considered, and quotes lacking the required bid guarantee will not be considered.";
  // R7-F1 — the '…in the U.S. Facsimile…' glue must REFUSE (final chain dot before a capital = boundary)
  const n1 = mk(OB_DBL,
    "Late quotes will not be considered, and quotes lacking the required bid guarantee must be issued by a surety authorized in the U.S. Facsimile submissions will not be considered");
  assert(n1.attestations[0].ungrounded.some((u) => u.includes("bid guarantee")),
    "R7-F1: the U.S.-glue launder REFUSES (chain-final dot before a capital is a boundary)");
  // legit U.S. twins still ground (lowercase continuation protected; capital continuation fragments pair up)
  const n3a = mk("Personnel must be U.S. citizens holding an active identification badge for facility access.",
    "Personnel must be U.S. citizens holding an active identification badge for facility access");
  assert(!n3a.attestations[0].ungrounded.some((u) => u.includes("citizens")), "R7-F1: 'U.S. citizens' twin grounds");
  // documented floor (Brain-sanction pending): the space-dropped OCR digit glue ("15.52.228-1") still
  // erases a boundary — banked so any behavior change is visible.
  const n2 = mk(OB_DBL,
    "Late quotes will not be considered, and quotes lacking the required bid guarantee must be received by 1400 on June 15.52.228-1 provides that facsimile submissions will not be considered");
  assert(!n2.attestations[0].ungrounded.some((u) => u.includes("bid guarantee")),
    "documented floor: OCR digit-glue grounds (Brain-sanction pending — change = intentional only)");
  // R7-F2 — size guard: an over-cap "obligation" (table block) refuses relaxed acceptance
  const BIG = `The contractor shall ${"provide ongoing support services and maintain records ".repeat(30)}as required.`;
  const big = mk(BIG, BIG.slice(0, -1));
  assert(big.attestations[0].ungrounded.length > 0, "R7-F2: a >120-token block refuses relaxed acceptance (fail-safe)");
}

console.log("\n── P20 (R8-F1/F2) — continuation-signature boundary, size-guard boundaries ──");
{
  const mk = (obSentence: string, excerpt: string, citation = "PWS §3.3") => {
    const L = `Instructions follow below.\n9.7. ${obSentence}\n${excerpt}.`;
    const ctx = { fullSource: L, sections: { L } } as unknown as AuditToolContext;
    const F: TypedFinding = { id: "fx", kind: "other", excerpt, citation, severity: "P1", disposition: "gate_to_clear", requirement: "x" } as unknown as TypedFinding;
    return withFlag(true, () => completenessOf(ctx, ["L"], [F], new Set(["L"])));
  };
  const OB_DBL = "Late quotes will not be considered, and quotes lacking the required bid guarantee will not be considered.";
  const HEAD = "Late quotes will not be considered, and quotes lacking the required bid guarantee must be issued by a surety authorized in the U.S.";
  // R8-F1 — non-ASCII/annotation sentence starts are boundaries (curly quote, §, bracket)
  for (const [label, tailTxt] of [["curly-quote", "\u201CFacsimile submissions will not be considered\u201D"], ["section-sign", "\u00A7 52.228-1 provides that facsimile submissions will not be considered"], ["bracket", "[Facsimile submissions will not be considered]"]] as Array<[string, string]>) {
    const r = mk(OB_DBL, `${HEAD} ${tailTxt}`);
    assert(r.attestations[0].ungrounded.some((u) => u.includes("bid guarantee")), `R8-F1: ${label}-led glue REFUSES (boundary by default)`);
  }
  // positives: currency continuation stays glued; capital-led legit continuation grounds via fragment pairing
  const cur = mk("Maintain insurance coverage of U.S. $1.5 million per occurrence for the duration of performance.",
    "Maintain insurance coverage of U.S. $1.5 million per occurrence for the duration of performance");
  assert(!cur.attestations[0].ungrounded.some((u) => u.includes("insurance")), "R8-F1: 'U.S. $1.5 million' twin grounds (currency continuation protected)");
  const cap = mk("All work shall be performed within the U.S. Contractor personnel must hold active badges for entry.",
    "All work shall be performed within the U.S. Contractor personnel must hold active badges for entry");
  assert(cap.attestations[0].ungrounded.length === 0, "R8-F1: capital-led legit continuation grounds (symmetric fragment pairing)");
  // documented floor: lowercase-led glue joins the n2 ledger row (Brain-sanction pending)
  const low = mk(OB_DBL, `${HEAD} e-mail submissions will not be considered`);
  assert(!low.attestations[0].ungrounded.some((u) => u.includes("bid guarantee")),
    "documented floor: lowercase-led glue grounds (orthographically undecidable — change = intentional only)");
  // R8-F2/R7-F2 — size-guard boundary: 120 grounds, 121 refuses
  const words = (k: number) => Array.from({ length: k }, (_, i) => `item${i}`).join(" ");
  const ob120 = `The contractor shall provide ${words(117)}.`; // vToks = 3 + 117 = 120 ("The" article-dropped)
  const r120 = mk(ob120, ob120.slice(0, -1));
  assert(r120.attestations[0].ungrounded.length === 0, "size guard: a 120-token twin still grounds (boundary exact)");
  const ob121 = `The contractor shall provide ${words(118)}.`; // vToks = 121
  const r121 = mk(ob121, ob121.slice(0, -1));
  assert(r121.attestations[0].ungrounded.length > 0, "size guard: a 121-token block refuses relaxed acceptance (fail-safe)");
}

console.log("\n── P21 (R9-F1/F2) — quote-glyph boundaries; closer-strip; proper-noun twins ──");
{
  const mk = (obSentence: string, excerpt: string, citation = "PWS §3.3") => {
    const L = `Instructions follow below.\n9.7. ${obSentence}\n${excerpt}.`;
    const ctx = { fullSource: L, sections: { L } } as unknown as AuditToolContext;
    const F: TypedFinding = { id: "fx", kind: "other", excerpt, citation, severity: "P1", disposition: "gate_to_clear", requirement: "x" } as unknown as TypedFinding;
    return withFlag(true, () => completenessOf(ctx, ["L"], [F], new Set(["L"])));
  };
  const OB_DBL = "Late quotes will not be considered, and quotes lacking the required bid guarantee will not be considered.";
  const HEAD = "Late quotes will not be considered, and quotes lacking the required bid guarantee must be issued by a surety authorized in the U.S.";
  // R9-F1 — straight-quote-led second sentences are boundaries (openers, not continuations)
  for (const [label, tailTxt] of [["straight-double-quote", '"Facsimile submissions will not be considered"'], ["straight-single-quote", "'Facsimile submissions will not be considered'"], ["spaced-comma", ", facsimile submissions will not be considered"], ["spaced-paren", ") Facsimile submissions will not be considered"]] as Array<[string, string]>) {
    const r = mk(OB_DBL, `${HEAD} ${tailTxt}`);
    assert(r.attestations[0].ungrounded.some((u) => u.includes("bid guarantee")), `R9: ${label}-led glue REFUSES`);
  }
  // R9-F2 — a closer hugging the chain dot does not shield the boundary
  const t3 = mk(OB_DBL, `Late quotes will not be considered, and quotes lacking the required bid guarantee must be issued by a "surety authorized in the U.S." Facsimile submissions will not be considered`);
  assert(t3.attestations[0].ungrounded.some((u) => u.includes("bid guarantee")), "R9-F2: closer-hugged chain dot is still a boundary (closer-strip)");
  // positives — capital proper-noun continuations ground via symmetric fragment pairing
  const t4 = mk("Offerors must be registered with the U.S. Small Business Administration prior to the award of any contract.",
    "Offerors must be registered with the U.S. Small Business Administration prior to the award of any contract");
  assert(t4.attestations[0].ungrounded.length === 0, "R9: 'U.S. Small Business Administration' twin grounds (fragment pairing)");
  const t6 = mk('Deliverables must conform to the U.S. "Code of Federal Regulations" formatting standards in every submission volume.',
    'Deliverables must conform to the U.S. "Code of Federal Regulations" formatting standards in every submission volume');
  assert(t6.attestations[0].ungrounded.length === 0, "R9: quote-apposition twin grounds (fragment pairing)");
  // documented floor: a "$"-led second sentence stays glued (currency continuation is a banked positive)
  const t9 = mk(OB_DBL, `${HEAD} $50,000 quotes lacking the required bid guarantee will not be considered`);
  assert(!t9.attestations[0].ungrounded.some((u) => u.includes("bid guarantee")),
    "documented floor: $-led glue grounds (currency ambiguity — change = intentional only)");
}

console.log(failures === 0 ? "\n✅ ALL PASS — grounding-variant-tolerance" : `\n❌ ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
