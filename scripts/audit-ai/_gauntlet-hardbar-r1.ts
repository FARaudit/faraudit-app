// ⚰️ GRAVEYARD — DEAD PROBE. The unit this exercised (hard-bar floor PART A, the prose possession detector) was
// RETIRED and DELETED by Brain Q3 ruling 2026-07-22 (card #677, panel 3/3). This file no longer executes: it
// imports src/lib/audit-hardbar.ts, which does not exist. It is kept ONLY as a historical adversarial record.
// DO NOT REPAIR IT TO RUN AGAIN — repairing it means rebuilding part A. See ceo/GRAVEYARD-HARDBAR-PART-A.md.
// GAUNTLET FINDING ROUND R1 — deriveHardBarFloor (generator probes, B2/B3 — deterministic, replayable by the judge).
// Run: npx tsx scripts/audit-ai/_gauntlet-hardbar-r1.ts
// Each probe prints: id · family · direction · expected vs actual · BREAK/OK. NO fixes here — evidence only.
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
function probe(id: string, family: string, dir: string, source: string, expected: string,
  opts: { findings?: TypedFinding[]; notices?: Array<{ excerpt: string; requirement: string; requiredAttribute?: string }> } = {}) {
  const d = fire(source, opts.findings ?? [], opts.notices ?? []);
  const actual = d ? `FIRE ${d.cap} [${d.hits.map((h) => h.cls).join(",")}]` : "null";
  const ok =
    expected === "null" ? d === null :
    expected.startsWith("FIRE") ? actual.startsWith(expected) :
    false;
  console.log(`${ok ? "OK   " : "BREAK"} ${id} · ${family} · ${dir}\n      expected=${expected}  actual=${actual}`);
  if (!ok) { breaks++; console.log(`      input: ${JSON.stringify(source.slice(0, 220))}`); } else oks++;
}

console.log("── F2/F5 · exclusion-evasion + class-term collisions → OVER-fire hunts ─────────────────────");

// P-01 single-award BPA establishment language (GSA eBuy boilerplate) — an OPEN competition establishing the vehicle.
probe("P-01", "class-collision/BPA-establishment", "OVER",
  "Only one BPA will be awarded as a result of this solicitation.",
  "null");

// P-02 single-award IDIQ establishment — "award of the IDIQ will be limited to a single offeror" (single-award RFP prose).
probe("P-02", "class-collision/IDIQ-establishment", "OVER",
  "The Government intends to make a single award; award of the IDIQ contract will be limited to a single offeror.",
  "null");

// P-03 personnel/staffing clearance (curable staffing gate, NOT a firm bar — #557/Phase-5 subject-scope doctrine).
probe("P-03", "exclusion-evasion/personnel-clearance", "OVER",
  "Contractor personnel assigned to this effort must possess an active SECRET security clearance at the time of proposal submission.",
  "null");

// P-04 invite-the-uncleared conditional (explicit no-bar-at-proposal; standard DCSA-sponsorship posture; ambiguity ⇒ no fire).
probe("P-04", "restriction-frame-bridge/negation-clause", "OVER",
  "A facility security clearance is not required at the time of proposal; however, the successful offeror must possess a SECRET facility security clearance prior to award.",
  "null");

// P-05 Q&A-cutoff sentence that happens to name the DD-254 (have-causative) — not a possession bar.
probe("P-05", "exclusion-evasion/QA-cutoff-DD254", "OVER",
  "Offerors must have any questions regarding the draft DD-254 submitted prior to the proposal due date.",
  "null");

// P-06 Polaris = Polaris Industries (UTV/ATV) authorized-dealer requirement — real DLA/GSA commodity buys; NOT a GWAC.
probe("P-06", "class-collision/Polaris-product", "OVER",
  "To be eligible for award, vendors must be an authorized Polaris dealer and hold a current dealer agreement at the time of quotation.",
  "null");

// P-07 SPRS-only bar with CMMC explicitly DISCLAIMED — ruling 5 cap table says BWC (curable), not NHR.
probe("P-07", "cap-table/SPRS-with-CMMC-negation", "OVER(cap)",
  "CMMC certification is not required for this procurement; however, offerors must have a current SPRS summary level score posted at the time of offer.",
  "FIRE BID_WITH_CAUTION");

console.log("\n── F7 · suppression attacks ────────────────────────────────────────────────────────────────");

const barSentence = "Award is restricted to firms possessing a TOP SECRET facility clearance at the time of proposal submission.";

// P-08 classOfFinding set-aside-first hijack: a MET clearance finding whose excerpt (spanning two adjacent source
// sentences) also carries set-aside vocabulary is classed "set_aside" → its clearance suppression is LOST.
{
  const src = "This acquisition is a total small business set-aside. " + barSentence;
  const met = f({
    requirement: "TS facility clearance — firm holds it",
    excerpt: "This acquisition is a total small business set-aside. " + barSentence,
    controllability: "already_satisfied",
  });
  probe("P-08", "suppression/classOfFinding-first-match-hijack", "OVER", src, "null", { findings: [met] });
}

// P-09 set-aside prose-vs-matrix anchor miss: the ladder HANDLED the set-aside (disqualifying finding grounded on the
// §L operative prose; profile satisfies → package reached BID) but the floor keys the clause-matrix row → no 5-word
// overlap → BWC cap on a proven-in-pool firm.
{
  const matrixRow = "52.219-6 Notice of Total Small Business Set-Aside (NOV 2020) Yes";
  const handled = f({
    requirement: "Total Small Business Set-Aside",
    excerpt: "This acquisition is 100 percent set aside for small business concerns under NAICS 561720.",
    kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: false, requiredAttribute: "sb:total",
  });
  probe("P-09", "suppression/setaside-prose-vs-matrix-anchor", "OVER", matrixRow, "null",
    { findings: [handled], notices: [{ excerpt: matrixRow, requirement: "Set-aside applies", requiredAttribute: "sb:total" }] });
}

// P-10 truncated/abbreviated handled excerpt (<5-word overlap) fails to anchor → met bar still fires.
{
  const met = f({ requirement: "TS facility clearance — firm holds it", excerpt: "TS facility clearance required at proposal", controllability: "already_satisfied" });
  probe("P-10", "suppression/truncated-excerpt-anchor-miss", "OVER", barSentence, "null", { findings: [met] });
}

console.log("\n── F3 · exclusion-overreach → UNDER-fire (killed real bars) ────────────────────────────────");

// P-11 real hold-at-offer bar killed because the sentence tail mentions evaluation.
probe("P-11", "exclusion-overreach/eval-verb-tail", "UNDER",
  "To be eligible for award, offerors must possess a TOP SECRET facility clearance, which the Government will verify during its evaluation of proposals.",
  "FIRE NEEDS_HUMAN_REVIEW");

// P-12 real FAA at-offer bar killed by a 'shall comply with' tail in the same sentence.
probe("P-12", "exclusion-overreach/comply-with-tail", "UNDER",
  "To be eligible for award, the offeror must hold a valid FAA repair station certificate and shall comply with 14 CFR Part 145 at all times.",
  "FIRE BID_WITH_CAUTION");

// P-13 singular provision phrasing "The offeror is required to possess …" — POSSESSION_FRAME only accepts must|shall|ARE required to.
probe("P-13", "frame-gap/is-required-to-singular", "UNDER",
  "The offeror is required to possess an active TOP SECRET facility clearance at the time of proposal submission.",
  "FIRE NEEDS_HUMAN_REVIEW");

console.log("\n── F1 · sentence segmentation ──────────────────────────────────────────────────────────────");

// P-14 hard line-wrap mid-sentence (PDF-extracted text wraps ~72-80 cols; splitter treats every newline as a boundary).
probe("P-14", "segmentation/hard-wrap", "UNDER",
  "Award is restricted to firms possessing a TOP SECRET\nfacility clearance at the time of proposal submission.",
  "FIRE NEEDS_HUMAN_REVIEW");

// P-15 realistic 72-col wrap of the whole paragraph.
probe("P-15", "segmentation/hard-wrap-72col", "UNDER",
  ["In accordance with Section H.4, award is restricted to firms possessing a", "TOP SECRET facility clearance at the time of proposal submission and", "maintaining it for the duration of the contract."].join("\n"),
  "FIRE NEEDS_HUMAN_REVIEW");

// P-16 bar inside a >600-char terminator-free blob (table/OCR dump) — span filtered out entirely.
probe("P-16", "segmentation/over-600-blob", "UNDER",
  "CLIN 0001 SVC MO 12 CLIN 0002 SVC MO 12 ".repeat(8) + "to be eligible for award offerors must possess a TOP SECRET facility clearance at the time of proposal submission " + "CLIN 0003 SVC MO 12 ".repeat(12),
  "FIRE NEEDS_HUMAN_REVIEW");

// P-17 Q&A with terminal '?' — banked behavior, replayed here only to confirm the family baseline.
probe("P-17", "segmentation/interrogative", "baseline",
  "Must the offeror possess an active facility clearance at time of proposal submission?",
  "null");

console.log("\n── F6 · universal-fire / CLAUSE_SOURCE_FULLTEXT boilerplate (verbatim clause text) ─────────");

// P-18 52.204-7(b)(1) VERBATIM CURRENT text (live-verified acquisition.gov/far/52.204-7, 2026-07-22).
probe("P-18", "universal-fire/52.204-7-current", "OVER-guard",
  "An Offeror is required to be registered in SAM when submitting an offer or quotation and at time of award.",
  "null");

// P-18b 52.204-7(b)(1) LEGACY (pre-revision) long text still present in older-dated provisions in live packages.
// NOTE: this variant CONTAINS "basic ordering agreement" = a TERM_VEHICLE class term — its only protection is the
// "is required to" frame gap (the same gap ledgered as BRK-9 under-fire). Coupled hazard: fixing BRK-9 re-opens this.
probe("P-18b", "universal-fire/52.204-7-legacy-BOA-term", "OVER-guard",
  "An Offeror is required to be registered in SAM when submitting an offer or quotation, and shall continue to be registered until time of award, during performance, and through final payment of any contract, basic agreement, basic ordering agreement, or blanket purchasing agreement resulting from this solicitation.",
  "null");

// P-19 252.204-7019(b) VERBATIM (live-verified acquisition.gov DFARS 252.204-7019, 2026-07-22).
probe("P-19", "universal-fire/252.204-7019(b)", "OVER-guard",
  "In order to be considered for award, if the Offeror is required to implement NIST SP 800-171, the Offeror shall have a current assessment (i.e., not more than 3 years old unless a lesser time is specified in the solicitation) (see 252.204-7020) for each covered contractor information system that is relevant to the offer, contract, task order, or delivery order.",
  "null");

// P-20 252.204-7021(d)(1)(i) VERBATIM full fill-in fragment standing alone (live-verified acquisition.gov, 2026-07-22).
probe("P-20", "universal-fire/252.204-7021-fragment", "OVER-guard",
  "Have and maintain for the duration of the contract a current CMMC status at the following CMMC level, or higher: ________ [Contracting Officer insert: CMMC Level 1 (Self); CMMC Level 2 (Self); CMMC Level 2 (C3PAO); or CMMC Level 3 (DIBCAC)] for all information systems used in performance of the contract, task order, or delivery order that process, store, or transmit FCI or CUI.",
  "null");

// P-20b same paragraph with its "(d) The Contractor shall—" lead-in concatenated (fulltext render without line breaks).
probe("P-20b", "universal-fire/252.204-7021-with-leadin", "OVER-guard",
  "The Contractor shall— (1)(i) Have and maintain for the duration of the contract a current CMMC status at the following CMMC level, or higher: ________ for all information systems used in performance of the contract, task order, or delivery order that process, store, or transmit FCI or CUI.",
  "null");

// P-21 52.219-1 style §K representation carrying set-aside/size vocabulary — representation posture must not fire.
probe("P-21", "universal-fire/52.219-1-rep", "OVER-guard",
  "The offeror represents that it is a small business concern and holds an active GSA Schedule contract.",
  "null");

console.log("\n── F9 · set-aside branch (B) edge probes ───────────────────────────────────────────────────");

// P-22 undefined requiredAttribute on BOTH notices (interface allows it) — dedup key undefined===undefined
// collapses two DIFFERENT programs into one hit. (Not reachable via today's wiring; latent for the SAM-metadata caller.)
{
  const d = fire("total small business set-aside and HUBZone set-aside", [], [
    { excerpt: "This is a total small business set-aside.", requirement: "Total SB" },
    { excerpt: "This is a HUBZone set-aside.", requirement: "HUBZone" },
  ]);
  const n = d?.hits.filter((h) => h.cls === "set_aside").length ?? 0;
  console.log(`${n === 2 ? "OK   " : "BREAK"} P-22 · set-aside/undefined-attr-dedup-collapse · UNDER(latent)\n      expected=2 set_aside hits  actual=${n}`);
  if (n !== 2) breaks++; else oks++;
}

// P-23 handled-with-matching-anchor set-aside DOES suppress (baseline sanity for P-09's contrast).
{
  const matrixRow = "52.219-6 Notice of Total Small Business Set-Aside (NOV 2020) Yes";
  const handled = f({ requirement: "Total Small Business Set-Aside", excerpt: matrixRow, kind: "eligibility_bar", controllability: "bidder_cannot_move", curableInWindow: false, requiredAttribute: "sb:total" });
  probe("P-23", "set-aside/anchored-handled-suppresses", "baseline", matrixRow, "null",
    { findings: [handled], notices: [{ excerpt: matrixRow, requirement: "Set-aside applies", requiredAttribute: "sb:total" }] });
}

console.log("\n── F11 · ReDoS / pathological input timing ─────────────────────────────────────────────────");
{
  // 599-char adversarial span: repeated subject-nouns + verbs to stress the bounded-gap alternations, ~500 sentences.
  const span = ("offerors must have offerors must have contractors shall hold firms are required to possess ".repeat(7) + "at the time of proposal submission").slice(0, 599);
  const big = Array(500).fill(span).join(". ");
  const t0 = process.hrtime.bigint();
  fire(big);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`${ms < 2000 ? "OK   " : "BREAK"} P-24 · redos/bounded-gap-stress · perf\n      500×599-char adversarial sentences → ${ms.toFixed(1)}ms (threshold 2000ms)`);
  if (ms >= 2000) breaks++; else oks++;
}

console.log("\n── residual real-bar sanity (floor still catches its flagship cases — no silent lobotomy) ───");
probe("S-01", "sanity/clearance-bar", "TRUE-fire", barSentence, "FIRE NEEDS_HUMAN_REVIEW");
probe("S-02", "sanity/vehicle-bar", "TRUE-fire", "Award is limited to holders of the SeaPort-NxG multiple-award contract (MAC).", "FIRE NEEDS_HUMAN_REVIEW");
probe("S-03", "sanity/gsa-ebuy-vehicle-bar", "TRUE-fire", "Only current GSA Schedule contract holders are eligible for award of this BPA.", "FIRE NEEDS_HUMAN_REVIEW");

console.log("\n── P-08 strengthening variants (classOfFinding hijack frequency) ───────────────────────────");
{
  // P-08b: met clearance finding whose CITATION merely references 52.219-14 (present on ~every set-aside package)
  // → classOfFinding hay contains "52.219-1…" → classed set_aside → clearance suppression LOST.
  const metCite = f({ requirement: "TS facility clearance — firm holds it", citation: "H.4; 52.219-14 applies", excerpt: barSentence, controllability: "already_satisfied" });
  probe("P-08b", "suppression/citation-52.219-hijack", "OVER", barSentence, "null", { findings: [metCite] });
  // P-08c control: identical finding without the 52.219 citation → suppression works (isolates the hijack).
  const metPlain = f({ requirement: "TS facility clearance — firm holds it", citation: "H.4", excerpt: barSentence, controllability: "already_satisfied" });
  probe("P-08c", "suppression/control-no-hijack", "baseline", barSentence, "null", { findings: [metPlain] });
}

console.log(`\n${breaks} BREAK(s) · ${oks} OK`);
