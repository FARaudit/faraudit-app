// ARC #747 · E2 — CITATION FIDELITY GATE.
// Run: npx tsx src/lib/audit-citation-fidelity.test.ts
//
// PROVENANCE OF EVERY FIXTURE IN THIS FILE. The SOURCE spans are verbatim from the stored `raw_pdf_text` of
// audit d0664ba2-bd51-4ce9-888a-bbcf6ff4499a (SPRRA2-26-R-0034) — the record gate 4 graded — pulled by
// `scripts/audit-ai/_e2-pull-fixtures.ts`; the FINDING strings are verbatim from that record's stored
// `compliance_json.v3`. Nothing here is composed by hand. The E1 battery's worst defect was an INVENTED TEST
// FIXTURE — a hand-flattened table that "proved" a repair the real record refuses — so this suite is a
// reproduction or it is nothing.
export {};
import {
  extractRegulationTokens, judgeToken, numberPresentInSource, looksLikePartRange,
  corporaPairedInSource, gateCitationsInText, gateFindingCitations, CORPUS_GRAMMAR,
} from "./audit-citation-fidelity";

let failures = 0;
const check = (name: string, ok: boolean, extra?: string) => {
  console.log(`${ok ? "✅" : "❌"} ${name}${!ok && extra ? `\n     ${extra}` : ""}`);
  if (!ok) failures++;
};

// ── VERBATIM SOURCE (whitespace-collapsed spans, exactly as they appear in raw_pdf_text) ────────────────
const S_COSTPRICE = "feror's summary schedule for the P/N. Submission must include working excel formulas, if applicable. Submission shall be in accordance with FAR 15.408, Table 15-2, Instructions for Submitting Cost/Price Proposals When Certified Cost or Pricing Data are required. Back up documentation shall detail the";
const S_PASSTHRU = "MA or DCAA business unit points of contact (POC's) to expedite the question/review process. -- 2 of 5 -- f. In accordance with FAR clause 52.215-22, Limitation on Pass-Through Charges, if Raytheon intends to subcontract more than 70 percent of the total cost of work to be performed unde";
const S_ADEQUACY = "ny contract, subcontract, or other contractual instrument IAW DFARS 252.204-7016(c). 3. Complete the Proposal Adequacy Checklist located in DFARS 252.215-7009 for offers over the TINA threshold. FOR CONTRACTORS USING THE PROPRICER SYTEM: The original unedited ProPricer system generated Excel file";
const S_OCI = "52.215-22. g. Raytheon shall identify and address in its proposal all actual or potential Organizational Conflicts of Interests (OCIs), per FAR 9.5, or state that there are no known potential OCIs. If any actual or potential OCIs are identified, then Raytheon shall submit a mitigation p";
const SOURCE = [S_COSTPRICE, S_PASSTHRU, S_ADEQUACY, S_OCI].join("\n");

// ── VERBATIM FINDING TEXT (stored, as shipped to the customer) ──────────────────────────────────────────
const F_C1 = "Proposal must include Cost/Price Supporting Documentation per DFARS 215-2 (Instructions for Submitting Cost/Price Proposals When Certified Cost or Pricing Data are required), including labor categories, labor hours, and back-up documentation.";
const F_ANNOTATION = "This is a sole/limited-source IDIQ procurement directed to a named large business (CAGE 05716) under an existing negotiated contract SPRRA2-25-D-0016. The solicitation is a Letter RFP addressed to that specific contractor, not a competitive open solicitation. — [cited clause is not a recognized bidder-eligibility/set-aside authority (FAR 19 / 13 CFR 121-128); treated as informational, not a show-stopper — confirm]";

console.log("── the founding defect ──");
{
  const toks = extractRegulationTokens(F_C1);
  check("C1 extracts exactly one token: DFARS 215-2", toks.length === 1 && toks[0].raw.trim() === "DFARS 215-2", JSON.stringify(toks.map((t) => t.raw)));
  check("C1 is withheld — the corpus/number pair exists nowhere in the record", judgeToken(toks[0], SOURCE).state === "withheld");

  const { text, withheld } = gateCitationsInText(F_C1, SOURCE);
  check("exactly one withholding, on 215-2", withheld.length === 1 && withheld[0].number === "215-2");
  // The requirement is TRUE and is the customer's actual work — dropping the finding to punish its citation
  // would delete a real obligation, which is the PR #293 class.
  check("the obligation survives verbatim (head)", text.includes("Proposal must include Cost/Price Supporting Documentation per"));
  check("the obligation survives verbatim (tail)", text.includes("including labor categories, labor hours, and back-up documentation."));
  check("the parenthetical survives", text.includes("(Instructions for Submitting Cost/Price Proposals"));
  check("the fabricated token is gone", !text.includes("DFARS 215-2"));
  check("the withholding is customer-visible", text.includes("[citation withheld"));
  check("the withholding names the rejected token", text.includes("215-2") && text.includes("DFARS"));
}

console.log("\n── substring collision — the check that stops this gate being a placebo ──");
{
  // "215-2" is a substring of "52.215-22", which this record prints twice.
  check("String.includes reports the FABRICATED token as PRESENT (this is why it is not used)", SOURCE.includes("215-2"));
  check("boundary-anchored presence correctly reports it ABSENT", numberPresentInSource("215-2", SOURCE) === false);
  for (const n of ["52.215-22", "15.408", "252.215-7009", "252.204-7016", "9.5"]) {
    check(`…and still finds ${n}, which really is there`, numberPresentInSource(n, SOURCE));
  }
}

console.log("\n── the true citations in this record are left alone ──");
for (const [raw, why] of [
  ["FAR 9.5", "a real FAR subpart — an over-strict grammar rejected this on the first draft"],
  ["FAR clause 52.215-22", "Limitation on Pass-Through Charges"],
  ["FAR 15.408", "the entry the C1 finding was actually quoting"],
  ["DFARS 252.215-7009", "Proposal Adequacy Checklist — the correct DFARS cite the record did carry"],
  ["DFARS 252.204-7016", "covered telecommunications representation"],
] as Array<[string, string]>) {
  const toks = extractRegulationTokens(raw);
  check(`${raw} untouched — ${why}`, toks.length === 1 && judgeToken(toks[0], SOURCE).state === "ok" && gateCitationsInText(raw, SOURCE).withheld.length === 0);
}

console.log("\n── part ranges are prose, not malformed citations ──");
{
  const { text, withheld } = gateCitationsInText(F_ANNOTATION, SOURCE);
  check("the engine's own '13 CFR 121-128' annotation is untouched", withheld.length === 0 && text === F_ANNOTATION);
  check("ascending pairs are ranges (121-128)", looksLikePartRange("121-128"));
  check("the founding defect's descending pair is not (215-2)", looksLikePartRange("215-2") === false);
}

console.log("\n── body swap — the document may not launder a re-prefixing it never made ──");
{
  // 52.215-22 is real and IS in the source — but the record pairs it with FAR, not DFARS.
  const v = judgeToken(extractRegulationTokens("DFARS 52.215-22")[0], SOURCE);
  check("a number the record attributes to another authority is withheld, not deferred to", v.state === "withheld");
  check("the source pairing is correctly read as FAR", corporaPairedInSource("52.215-22", SOURCE).has("FAR"));
  check("the reason names the authority the record actually used", v.state === "withheld" && v.reason.includes("attributes it to FAR"));

  // The engine must report what a sloppy solicitation says; only inventions are withheld.
  const quoted = judgeToken(extractRegulationTokens("DFARS 215-2")[0], "Offerors shall comply with DFARS 215-2 as printed herein.");
  check("a malformed number the record itself prints under that authority IS deferred to", quoted.state === "ok_quoted_from_source");
}

console.log("\n── grammar is permissive by construction ──");
{
  const ok: Array<[string, string]> = [
    ["FAR", "9.5"], ["FAR", "9.504"], ["FAR", "6.302-1"], ["FAR", "15.408"], ["FAR", "36.204"],
    ["FAR", "52.219-6"], ["FAR", "52.204-24"], ["FAR", "28.101"], ["FAR", "16.104"],
    ["DFARS", "215.2"], ["DFARS", "252.204-7012"], ["DFARS", "252.215-7009"], ["DFARS", "219.502-2"],
    ["AFFARS", "5352.201-9101"], ["DLAD", "5452.233-9001"], ["VAAR", "852.219-10"], ["CFR", "121.406"],
  ];
  let allOk = true;
  for (const [c, n] of ok) if (!CORPUS_GRAMMAR[c].test(n)) { allOk = false; console.log(`     rejected ${c} ${n}`); }
  check(`accepts all ${ok.length} real designations across corpora`, allOk);

  check("rejects a dash where DFARS uses a dot (215-2)", CORPUS_GRAMMAR.DFARS.test("215-2") === false);
  check("rejects a FAR clause number under DFARS (52.219-6)", CORPUS_GRAMMAR.DFARS.test("52.219-6") === false);
  check("rejects a DFARS clause number under FAR (252.204-7012)", CORPUS_GRAMMAR.FAR.test("252.204-7012") === false);

  // Named precisely because an earlier version of this check claimed to prove the ungoverned-corpus branch
  // and did not: every corpus the extractor can produce has a grammar entry, so `if (!grammar)` in judgeToken
  // is unreachable defence, not live behaviour. A test whose passing output is indistinguishable from an
  // inert one proves nothing. [[feedback_placebo_family_inert_equals_passing]]
  check("DLAD 5452.233-9001 passes on its OWN grammar, not an ungoverned-corpus exemption",
    CORPUS_GRAMMAR.DLAD.test("5452.233-9001") && judgeToken(extractRegulationTokens("DLAD 5452.233-9001")[0], SOURCE).state === "ok");

  let governed = true;
  for (const raw of ["FAR 1.1", "DFARS 201.1", "DFAR 201.1", "AFFARS 5301.1", "VAAR 801.1", "DLAD 5401.1", "13 CFR 121.1"]) {
    const t = extractRegulationTokens(raw)[0];
    if (!t || !CORPUS_GRAMMAR[t.corpus]) { governed = false; console.log(`     ungoverned: ${raw}`); }
  }
  check("every corpus the extractor can emit HAS a grammar — nothing reaches judgement ungoverned", governed);

  // Writing this down is the point. A USC grammar was drafted and removed because nothing the extractor can
  // produce could ever reach it; leaving it in would have been a rule that cannot fire.
  check("BARE-INTEGER references are outside the extractor's scope — stated, not implied",
    ["15 U.S.C. 644", "15 USC 644", "FAR part 19"].every((r) => extractRegulationTokens(r).length === 0) && CORPUS_GRAMMAR.USC === undefined);
}

console.log("\n── extraction discipline ──");
{
  check("does not truncate a clause number to its section", extractRegulationTokens("DFARS 252.204-7012")[0].number === "252.204-7012");
  check("ignores BARE numbers — with no stated corpus there is no grammar, and inferring one is the guess this gate refuses",
    extractRegulationTokens("per 52.219-6 and 15.408").length === 0);
  check("normalizes DFAR onto DFARS rather than treating it as ungoverned", extractRegulationTokens("DFAR 215-2")[0].corpus === "DFARS");
  check("normalizes C.F.R. onto CFR", extractRegulationTokens("13 C.F.R. 121.406")[0].corpus === "CFR");
}

console.log("\n── flag discipline and safety ──");
{
  const findings = [{ citation: "DFARS 215-2", requirement: F_C1, excerpt: "Submission shall be in accordance with FAR 15.408, Table 15-2" }];

  const off = gateFindingCitations(findings, SOURCE, { enabled: false });
  check("flag OFF returns the SAME array reference — byte-identity is structural, not re-proved",
    off.findings === findings && off.touched === 0 && off.withheld.length === 0);

  const before = JSON.stringify(findings);
  const on = gateFindingCitations(findings, SOURCE, { enabled: true });
  check("flag ON never mutates the input findings", JSON.stringify(findings) === before);
  check("never rewrites `excerpt` — the one field whose whole value is that it was not rewritten",
    on.findings[0].excerpt === findings[0].excerpt);

  const twice = gateFindingCitations(on.findings, SOURCE, { enabled: true });
  check("idempotent — a second pass withholds nothing further",
    twice.withheld.length === 0 && twice.findings[0].requirement === on.findings[0].requirement);

  const clean = [{ citation: "FAR 9.5", requirement: "OCI disclosure required." }];
  const cleanR = gateFindingCitations(clean, SOURCE, { enabled: true });
  check("untouched findings stay referentially identical, so downstream identity checks do not move",
    cleanR.findings[0] === clean[0] && cleanR.touched === 0);

  const multi = gateFindingCitations([{ citation: "DFARS 215-2", requirement: "see DFARS 215-2 and DFARS 52.215-22" }], SOURCE, { enabled: true });
  check("reports EVERY withheld token for the record, not just the first", multi.withheld.length === 3 && multi.touched === 1);

  const two = gateCitationsInText("first DFARS 215-2 then DFARS 52.215-22 done", SOURCE).text;
  check("multiple withholdings in one string all land, and none corrupts another's offsets",
    two.startsWith("first [citation withheld") && two.endsWith("done") && (two.match(/\[citation withheld/g) ?? []).length === 2);
}

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
