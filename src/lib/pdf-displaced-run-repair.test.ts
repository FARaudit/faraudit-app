// $0 PROOF for DISPLACED-RUN REPAIR (CEO queue #1 — the "run-in heading hoist").
// Run: npx tsx src/lib/pdf-displaced-run-repair.test.ts
//
// Every POSITIVE specimen below is verbatim from the assembled source of live run
// eab43ada-2baf-49e2-b224-a968df7864f3 (W50S6U26QA019), primary region `Solicitation - W50S6U26QA0190002.pdf`,
// pulled by scripts/audit-ai/_hoist-01-reproduce.ts. They are FAR clause text — public, no PII — so this suite
// asserts against real data everywhere and needs no banked corpus.
//
// The NEGATIVE controls are the point of the suite. A repair keyed on a text shape is only as good as the
// population it refuses, and the first version of this recogniser was wrong in BOTH directions: too narrow on
// what counts as a displaced run (it discarded 13 of 49 real sites for ending in a period or exceeding six
// words), and untested against a real two-column table row, which carries the same "\t"-then-short-line shape
// and must never be rewritten.
import { repairDisplacedRuns } from "./pdf-displaced-run-repair";
import { healDisplacedRuns } from "./pdf-text-extractor";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

const nonWs = (s: string) => s.replace(/\s/g, "").split("").sort().join("");

console.log("── 1. THE SPECIMEN THAT MOTIVATED THE ARC ───────────────────────────────");
// FAR 52.212-1(e). The subject "the Government will" and its predicate "disclose the following information"
// are severed by the interpolated heading. This exact string was measured ABSENT from the run's source.
const DEBRIEF =
  "(e) . If a postaward debriefing is given to requesting Vendors, the Government will\t\n" +
  "Debriefings\n" +
  "disclose the following information, if applicable:\n" +
  "(1) The agency's evaluation of the significant weak or deficient factors.";
{
  const before = DEBRIEF;
  const { text: after, repairs } = repairDisplacedRuns(before);
  assert(!before.includes("the Government will disclose the following information"),
    "BEFORE: subject and predicate are severed — the joined sentence is absent (this is the defect)");
  assert(after.includes("the Government will disclose the following information, if applicable:"),
    "AFTER: the sentence is contiguous — subject reunited with its predicate");
  assert(repairs.length === 1 && repairs[0].run === "Debriefings", `exactly one repair, run="Debriefings" (got ${repairs.length}, ${JSON.stringify(repairs[0]?.run)})`);
  assert(after.split("\n")[0] === "Debriefings", "the displaced run is relocated to its OWN line, above the paragraph");
  assert(nonWs(before) === nonWs(after), "CONSERVATION: no non-whitespace character added or lost");
  assert(!after.includes("(e) Debriefings."),
    "the run is NOT re-inserted at a guessed position inside the sentence — that would construct source text");
}

console.log("\n── 2. THE 13 SITES THE FIRST RECOGNISER WRONGLY EXCLUDED ─────────────────");
// Each of these was classified as "not a heading" by a <=6-word / no-terminal-punctuation rule and would have
// been left corrupted. All are verbatim from the same region.
const WIDENED: Array<[string, string, string]> = [
  ["terminated run", "e WAWF system provides the method to electronically process\t\nElectronic invoicing.\npayment requests.", "Electronic invoicing."],
  ["7-word run", "(q) . The Contractor agrees to comply\t\nCompliance with laws unique to Government contracts\nwith all applicable laws.", "Compliance with laws unique to Government contracts"],
  ["9-word run", "(c) .\t\nLate submissions, modifications, revisions, and withdrawals of quotations\nare governed by this paragraph.", "Late submissions, modifications, revisions, and withdrawals of quotations"],
  ["displaced italic, not a heading at all", "yment ( , duplicate payment, erroneous payment, liquidation\t\ne.g.\nof an advance).", "e.g."],
];
for (const [label, src, expected] of WIDENED) {
  const { text: after, repairs } = repairDisplacedRuns(src);
  assert(repairs.length === 1 && repairs[0].run === expected, `${label}: repaired, run=${JSON.stringify(expected)}`);
  assert(nonWs(src) === nonWs(after), `${label}: CONSERVATION holds`);
}

console.log("\n── 2b. THE TOTAL SCAR — enumerator stripped to bare punctuation ──────────");
// Three real sites declined while the scar test required whitespace AFTER the stranded period. When the whole
// heading is displaced the line ends AT the period, which is the strongest evidence of displacement there is.
const TOTAL_SCAR: Array<[string, string]> = [
  ["(5) . / Interest", "(5) .\t\nInterest\n(i) All amounts that become payable by the Contractor shall bear simple interest."],
  ["(s) . / Unauthorized obligations", "(s) .\t\nUnauthorized obligations\n(1) Except as stated in paragraph (s)(2) of this clause, when any supply is provided."],
  ["(c) . / Late submissions", "(c) .\t\nLate submissions, modifications, revisions, and withdrawals of quotations\n(1) Vendors are responsible for submitting quotations."],
];
for (const [label, src] of TOTAL_SCAR) {
  const { text: after, repairs } = repairDisplacedRuns(src);
  assert(repairs.length === 1 && repairs[0].mark === "origin-scar", `${label}: repaired on the total scar`);
  assert(nonWs(src) === nonWs(after), `${label}: CONSERVATION holds`);
}
{
  // The counter-case the widened scar must still refuse: end-of-line hyphenation is not a displacement scar.
  const HYPHEN = "(a) As used in this clause-\t\nDefinitions.\n\"DoDAAC\" is a six position code.";
  const { repairs } = repairDisplacedRuns(HYPHEN);
  assert(repairs.length === 0, "a trailing hyphen with no preceding space is NOT a scar — word-wrap looks identical");
}

console.log("\n── 3. NEGATIVE CONTROLS — what the repair must REFUSE ────────────────────");
{
  // A real two-column table row. Same "\t" + short next line, but the continuation starts with a capital and
  // the opening line carries no origin scar — nothing was severed, so nothing may be joined.
  const TABLE = "Item Description\t\nQuantity\nUnit Price shall be entered in Block 24.";
  const { text: after, repairs } = repairDisplacedRuns(TABLE);
  assert(repairs.length === 0 && after === TABLE, "a two-column table row is left byte-identical");
}
{
  // No cell separator anywhere ⇒ untouched, and the fast path returns the same string object's content.
  const PLAIN = "(a) The Contractor shall comply with all applicable laws.\nThis line is fine.";
  const { text: after, repairs } = repairDisplacedRuns(PLAIN);
  assert(repairs.length === 0 && after === PLAIN, "text with no cell separator is byte-identical");
}
{
  // A long run is prose that happened to follow a separator, not a displaced label.
  const LONG = "(a) . Something happened here\t\n" +
    "this is a long line of ordinary body prose that runs well past any plausible label length and keeps going\n" +
    "and continues here.";
  const { repairs } = repairDisplacedRuns(LONG);
  assert(repairs.length === 0, "a run past the word cap is refused — prose is not a label");
}
{
  // Independent prose (contains ". " + capital) is not a label even when short.
  const PROSE = "(a) . Opening line\t\nDone. See below.\ncontinues here.";
  const { repairs } = repairDisplacedRuns(PROSE);
  assert(repairs.length === 0, "a short run containing its own sentence boundary is refused");
}

console.log("\n── 4. FAIL-CLOSED ───────────────────────────────────────────────────────");
{
  // Idempotence: running the repair on already-repaired text must change nothing further.
  const once = repairDisplacedRuns(DEBRIEF).text;
  const twice = repairDisplacedRuns(once);
  assert(twice.text === once && twice.repairs.length === 0, "idempotent — a second pass is a no-op");
}
{
  const empty = repairDisplacedRuns("");
  assert(empty.text === "" && empty.repairs.length === 0, "empty input is safe");
}

console.log("\n── 5. THE FULL 52.212-4 RUN, END TO END ─────────────────────────────────");
// Six consecutive clause paragraphs, verbatim, exercising back-to-back repairs.
const RUN_212_4 =
  "(a) . The clause at Federal Acquisition Regulation (FAR) 52.202-1, Definitions, is\t\nDefinitions\nincorporated by reference.\n" +
  "(b) . The Contractor shall only tender for acceptance those items that\t\nInspection/Acceptance\nconform to the requirements of this contract.\n" +
  "(c) . The Contractor or its assignee may assign its rights to receive payment due as\t\nAssignment\na result of performance of this contract.\n" +
  "(d) . Changes in the terms and conditions of this contract may be made only by written\t\nChanges\nagreement of the parties.\n" +
  "(e) . This contract is subject to 41 U.S.C. chapter 71, Contract Disputes. Failure of the\t\nDisputes\nparties to this contract to reach agreement.\n" +
  "(f) . The Contractor shall be liable for default unless nonperformance is\t\nExcusable delays\ncaused by an occurrence beyond the reasonable control.";
{
  const { text: after, repairs } = repairDisplacedRuns(RUN_212_4);
  assert(repairs.length === 6, `all six paragraphs repaired (got ${repairs.length})`);
  assert(nonWs(RUN_212_4) === nonWs(after), "CONSERVATION holds across six consecutive repairs");
  const joined = [
    "52.202-1, Definitions, is incorporated by reference.",
    "tender for acceptance those items that conform to the requirements",
    "may assign its rights to receive payment due as a result of performance",
    "may be made only by written agreement of the parties",
    "Failure of the parties to this contract to reach agreement",
    "liable for default unless nonperformance is caused by an occurrence",
  ];
  for (const j of joined) assert(after.includes(j), `sentence rejoined: "${j.slice(0, 46)}…"`);
  assert(repairs.every((r) => r.mark === "origin-scar" || r.mark === "both"),
    "every repair names the mark that justified it");
}

console.log("\n── 6. THE SEAM IS WIRED, AND FLAG-OFF IS BYTE-IDENTICAL ─────────────────");
// Sections 1–5 prove the recogniser. They prove NOTHING about whether the extractor calls it — an inert seam
// and a working one produce identical green. `extractText` calls `healDisplacedRuns` and nothing else, so this
// exercises the production path with only the PDF parse itself left out.
{
  const mk = () => ({
    pages: [{ pageNum: 1, text: DEBRIEF, lines: DEBRIEF.split("\n") }],
    raw: DEBRIEF,
    warnings: [] as string[],
  });

  delete process.env.AUDIT_INGEST_DISPLACED_RUN;
  const off = mk();
  const offRaw = healDisplacedRuns(off.pages, off.raw, off.warnings);
  assert(offRaw === DEBRIEF, "flag OFF: rawText is byte-identical");
  assert(off.pages[0].text === DEBRIEF, "flag OFF: pages[] untouched");
  assert(off.warnings.length === 0, "flag OFF: no warning pushed");

  process.env.AUDIT_INGEST_DISPLACED_RUN = "true";
  const on = mk();
  const onRaw = healDisplacedRuns(on.pages, on.raw, on.warnings);
  assert(onRaw !== DEBRIEF, "flag ON: the seam actually fired (rawText changed)");
  assert(onRaw.includes("the Government will disclose the following information"),
    "flag ON: the severed sentence is contiguous in rawText");
  assert(on.pages[0].text.includes("the Government will disclose the following information"),
    "flag ON: pages[] repaired too — rawText and pages cannot disagree");
  assert(on.pages[0].lines.length > 0 && !on.pages[0].lines.some((l) => l.endsWith("\t")),
    "flag ON: pages[].lines rebuilt from the repaired text");
  assert(on.warnings.some((w) => w.startsWith("DISPLACED_RUN_REPAIR:")), "flag ON: telemetry names the repair");
  delete process.env.AUDIT_INGEST_DISPLACED_RUN;
}

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
