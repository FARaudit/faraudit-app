// $0 regression lock for REPORT-TRUTH #2 — the affirmative NON-PRESENCE claim class.
// Run: npx tsx src/lib/audit-nonpresence-honesty.test.ts
//
// WHAT BROKE (live run 95698f91, 2026-07-30): three findings told the customer something was NOT in the solicitation
// while it demonstrably was — 52.219-6 at raw line 1434, 52.222-43 at line 1463, WD 2015-5631 at line 2930. The
// escalation one is the expensive case: a bidder who believes there is no escalation clause pads four option years
// that 52.222-43 reimburses and loses a price-only buy.
//
// Absence cannot be grounded in an excerpt, so it may never ship as a bare claim about the document (Rule 64).
export {};

let pass = 0, fail = 0;
function ok(label: string, cond: boolean) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } }

(async () => {
  const { rescopeNonPresence, hasNonPresenceClaim, applyNonPresenceHonesty, NONPRESENCE_PREFIX } =
    await import("./audit-nonpresence-honesty");

  // ---- 1. THE THREE REAL CLAIMS (verbatim from run 95698f91) --------------------------------------------------
  const ESCALATION = "Option-year pricing lock-in: all four option periods (years 1-4, CLINs 1001-4005) are priced at award as FFP — if SCA wage rates escalate or are revised during option periods, the contractor bears the full delta with no escalation clause visible in the provided sections";
  const SETASIDE = "NAICS 561730 (Landscaping Services) size standard applies; if bidder is not a small business under this NAICS, set-aside eligibility is unknown from provided sections — no set-aside designation is visible in the provided text";
  const WAGES = "Wage Determination (Attachment 0002) is referenced but not reproduced — actual SCA wage rates and fringe benefits are unknown; if rates are high for the applicable locality/occupation, cost risk is significant";

  for (const [label, claim] of [["escalation", ESCALATION], ["set-aside", SETASIDE], ["wages", WAGES]] as Array<[string, string]>) {
    const r = rescopeNonPresence(claim);
    ok(`${label}: detected as a non-presence claim`, r.shapes.length > 0);
    ok(`${label}: the sentence is FRAMED as unverified`, r.text.startsWith(NONPRESENCE_PREFIX));
    ok(`${label}: original wording is preserved in full`, r.text.includes(claim.slice(0, 80)));
    ok(`${label}: reader is told to confirm in the solicitation`, /confirm directly in the solicitation/.test(r.text));
    // The rewrite must stay a readable sentence — the in-place-edit approach failed exactly here (see the module
    // header: "in the was located by this audit text").
    ok(`${label}: no doubled/garbled phrasing`, !/was located by this audit.*was located by this audit/.test(r.text));
  }

  // ---- 2. FALSIFICATION: ordinary positive findings must be LEFT ALONE ------------------------------------------
  // A gate that wraps everything would pass every assertion in §1. These are real positive findings from the same run.
  const POSITIVE = [
    "The following factors will be used to evaluate offers: Price Only. A price that is determined to be an outlier and/or unrealistically low may be rejected.",
    "The Government will evaluate offers for award purposes by adding the total price for all options to the total price for the basic requirement.",
    "The contractor shall furnish all necessary labor, material, equipment and operating personnel to mow, edge, and maintain the grounds.",
    "Place of Performance: US Army Corps of Engineers Valley Resident Office, 1810 Jefferson Blvd, Sacramento, CA 95833",
    "Firm Fixed Price contract type for all CLINs transfers all cost risk to the contractor.",
    "Offerors must submit their quote by email to the Contract Specialist no later than the date stated in block 8.",
  ];
  for (const p of POSITIVE) {
    const r = rescopeNonPresence(p);
    ok(`positive finding untouched: "${p.slice(0, 42)}…"`, r.shapes.length === 0 && r.text === p);
  }

  // ---- 2b. THE TWO COLLISIONS THE FALSIFICATION LEG CAUGHT ----------------------------------------------------
  // Both are `no` used as something other than a negation of existence. The first is the dangerous one: "no later
  // than" is how every solicitation states its DEADLINE, and framing a deadline as an unverified absence would be
  // worse than the defect this gate fixes.
  const COLLISIONS = [
    "Offerors must submit their quote by email to the Contract Specialist no later than the date stated in block 8.",
    "Quotes shall remain valid for no fewer than 90 days from the date specified in the solicitation.",
    "Deliveries shall be made no earlier than the period of performance start date stated in the schedule.",
    "At no cost to the Government, materials shall be provided by the contractor.",
    "The contractor shall complete the work in no more than the number of days shown in the schedule.",
  ];
  for (const c of COLLISIONS) {
    const r = rescopeNonPresence(c);
    ok(`collision NOT framed: "${c.slice(0, 46)}…"`, r.shapes.length === 0 && r.text === c);
  }

  // ---- 3. BYTE-IDENTITY on no match ----------------------------------------------------------------------------
  // Non-matching text must come back reference-identical, not merely equal — the split/join must never touch it.
  const untouched = "A sentence.  Two spaces between.   And   irregular   spacing inside.";
  const r3 = rescopeNonPresence(untouched);
  ok("no match ⇒ identical string returned, whitespace preserved", r3.text === untouched);

  // ---- 4. IDEMPOTENCE ------------------------------------------------------------------------------------------
  // A finding must never accumulate a second frame if the gate runs twice.
  const once = rescopeNonPresence(ESCALATION).text;
  const twice = rescopeNonPresence(once).text;
  ok("running the gate twice changes nothing", once === twice);
  ok("exactly one frame, never two", (twice.match(/UNVERIFIED ABSENCE/g) || []).length === 1);

  // ---- 5. SENTENCE SCOPE: only the offending sentence is framed -------------------------------------------------
  const MIXED = "A site visit will be held on 13 August 2026. FAR 52.237-1 is incorporated. Attendance is not stated as mandatory.";
  const r5 = rescopeNonPresence(MIXED);
  ok("mixed finding: the clean opening sentence is NOT framed", r5.text.startsWith("A site visit will be held"));
  ok("mixed finding: the offending sentence IS framed", /UNVERIFIED ABSENCE — Attendance is not stated/.test(r5.text));
  ok("mixed finding: exactly one frame", (r5.text.match(/UNVERIFIED ABSENCE/g) || []).length === 1);

  // ---- 6. SHAPE COVERAGE — each form of asserted absence is caught ----------------------------------------------
  const FORMS: Array<[string, string]> = [
    ["copula-negated", "The bonding requirement is not stated."],
    ["no-subject verbless", "There is no wage determination attached."],
    ["no-subject copula", "No set-aside designation is visible."],
    ["unknown-state", "The size standard is unknown."],
    ["does-not", "The solicitation does not contain a QASP."],
    ["absent-from", "The evaluation criteria are missing from the package."],
  ];
  for (const [name, s] of FORMS) ok(`shape caught: ${name}`, hasNonPresenceClaim(s));

  // ---- 7. THE FINDING-SET API ----------------------------------------------------------------------------------
  const set = [
    { id: "a", requirement: POSITIVE[0] },
    { id: "b", requirement: ESCALATION },
    { id: "c", requirement: POSITIVE[2] },
  ];
  const applied = applyNonPresenceHonesty(set);
  ok("only the non-presence finding is rewritten", applied.rewrites.length === 1 && applied.rewrites[0].id === "b");
  ok("input array is not mutated", set[1].requirement === ESCALATION);
  ok("untouched findings are returned by reference", applied.findings[0] === set[0] && applied.findings[2] === set[2]);
  ok("the rewrite carries before AND after for the audit trail", !!applied.rewrites[0].before && !!applied.rewrites[0].after);

  // ---- 8. EXCERPTS ARE NEVER EDITED (Rule 64) ------------------------------------------------------------------
  // An edited excerpt would break every downstream grounding check that substring-matches it against the source.
  const withExcerpt = [{ id: "x", requirement: ESCALATION, excerpt: "no escalation clause visible in the provided sections" }];
  const r8 = applyNonPresenceHonesty(withExcerpt);
  ok("excerpt survives byte-identical even when it contains the shape",
    (r8.findings[0] as { excerpt: string }).excerpt === "no escalation clause visible in the provided sections");

  // ---- 9. KNOWN RESIDUE — documented, not hidden ---------------------------------------------------------------
  // The corpus sweep (_cert-rt2-nonpresence-corpus.ts, 22 framed sentences across 12 run records) showed ~2 false
  // positives, both the SAME shape: the finding QUOTES a solicitation obligation that itself contains a negation,
  // rather than the audit asserting an absence. These are pinned as CURRENT BEHAVIOUR, not as correct behaviour —
  // if a future change fixes them, this leg fails and the residue gets re-judged instead of silently shifting.
  //
  // Left unfixed deliberately: excluding them needs a conditional/obligation detector, which would cost recall on the
  // real class, and the failure direction here is cosmetic — a TRUE statement gains a "confirm directly" caveat it did
  // not need. Under-matching (a false absence claim shipping as fact) is the only direction that hurts a customer.
  const RESIDUE = [
    "Submission of a quote that does not contain all items requested below may result in rejection.",
    // Fires on "omitted from drawings" (absent-from shape) — verbatim from the corpus, since a shortened paraphrase
    // drops the very clause that triggers it and would make this leg pass for the wrong reason.
    "Assemblies, framework, fixtures, or apparatus not explicitly shown on project drawings or SOW must still be priced and provided by the Contractor for a complete, fully operating, and functioning system — no price relief for items omitted from drawings",
  ];
  for (const r of RESIDUE) {
    ok(`known residue still frames (quoted obligation, cosmetic): "${r.slice(0, 40)}…"`, rescopeNonPresence(r).shapes.length > 0);
  }

  console.log(`\nREPORT-TRUTH #2 · non-presence honesty: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
