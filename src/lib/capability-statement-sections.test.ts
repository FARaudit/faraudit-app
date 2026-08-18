// $0 REGRESSION for the structured competency / differentiator sections.
// Run: npx tsx src/lib/capability-statement-sections.test.ts
//
// Two representations coexist: the legacy TEXT columns and the structured JSONB ones. The page,
// the PDF and the pasted copy must resolve them identically or they will disagree about the same
// profile, so all three go through this module. The distinctions that matter and are easy to
// collapse: NULL is not [], a legacy line is a head and NOT an invented card, and the caps are
// enforced by refusing rather than by trimming.
import {
  resolveCompetencies, resolveDifferentiators, refusalsFor, sentencesIn,
  COMPETENCY_COUNT, DIFFERENTIATOR_MAX
} from "./capability-statement-sections";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

// ── 1 · structured wins, and carries all four fields ────────────────────────
const structured = {
  core_competencies: "legacy prose that must not be used",
  core_competencies_json: [
    { k: "Machining", h: "5-axis aluminium and titanium details", b: "Build-to-print from Government or OEM drawings.", s: "AS9102 first article · CMM" },
    { k: "Protective equipment", h: "Intake plugs and engine covers", b: "Produced to drawing or to a performance spec.", s: "Insignia to customer standard" },
    { k: "Legacy support", h: "Reverse engineering for out-of-production parts", b: "Dimensional capture when the original source is gone.", s: "Small lots accepted as standard" }
  ]
};
const s = resolveCompetencies(structured);
assert(s.source === "structured", "a structured column is used in preference to the prose one");
assert(s.items.length === 3, `three items (got ${s.items.length})`);
assert(s.items[0].k === "Machining" && s.items[0].s === "AS9102 first article · CMM",
  "the kicker and the spec line survive — the two fields prose cannot carry");
assert(!s.items.some((i) => i.h === "legacy prose that must not be used"),
  "the legacy column is not mixed in when the structured one is present");

// ── 2 · a legacy profile still renders, as heads and NOTHING ELSE ───────────
// The renderer must not invent a body or a spec line for a customer who never wrote one.
const legacy = { core_competencies: "Precision machining\nSustainment spares\nReverse engineering" };
const l = resolveCompetencies(legacy);
assert(l.source === "legacy-text", "a profile with no structured column falls back to prose");
assert(l.items.length === 3 && l.items[0].h === "Precision machining", "each line becomes one head");
assert(l.items.every((i) => i.k === null && i.b === null && i.s === null),
  "a legacy item carries a head and null everywhere else — nothing is invented");

// ── 3 · NULL IS NOT []. Collapsing these resurrects deleted prose or prints an empty heading ──
assert(resolveCompetencies({ core_competencies: "Still here", core_competencies_json: null }).source === "legacy-text",
  "NULL structured column means 'not structured yet' → the prose column answers");
const emptied = resolveCompetencies({ core_competencies: "Deleted prose", core_competencies_json: [] });
assert(emptied.source === "empty" && emptied.items.length === 0,
  "an EMPTY ARRAY means structured-and-empty → the section is omitted, prose is NOT resurrected");
assert(resolveCompetencies({}).source === "empty", "a row with neither column is empty, not an error");
assert(resolveCompetencies({ core_competencies: "   \n  \n " }).source === "empty",
  "whitespace-only prose is empty, not three blank items");

// ── 4 · malformed structured data degrades instead of throwing ──────────────
const junk = resolveCompetencies({ core_competencies_json: [
  { h: "Real one" }, null, "a bare string", { k: "no head" }, { h: "   " }, 42
] as unknown });
assert(junk.items.length === 1 && junk.items[0].h === "Real one",
  `rows with no head are dropped rather than printed blank (kept ${junk.items.length})`);

// ── 5 · differentiators, same rules ─────────────────────────────────────────
const d = resolveDifferentiators({ differentiators_json: [
  { h: "Quotes inside a short RFQ window", b: "No capture team in the path." },
  { h: "Inspection kept under our roof" }
] });
assert(d.source === "structured" && d.items.length === 2 && d.items[1].b === null,
  "a differentiator may carry a head alone");
assert(resolveDifferentiators({ differentiators: "A\nB" }).source === "legacy-text",
  "differentiators fall back to prose too");

// ── 6 · THE CAPS REFUSE, THEY DO NOT TRIM ───────────────────────────────────
// Measured on the plate: a fourth competency is 78px off the page (three grid tracks); the
// differentiator section is 47px over at 8. Trimming here is the silent overflow the card exists
// to prevent — so the contract is a refusal the caller has to handle.
const three = { core_competencies_json: [{ h: "a" }, { h: "b" }, { h: "c" }] };
assert(refusalsFor(three).length === 0, `exactly ${COMPETENCY_COUNT} competencies builds clean`);

const four = refusalsFor({ core_competencies_json: [{ h: "a" }, { h: "b" }, { h: "c" }, { h: "d" }] });
assert(four.length === 1 && four[0].field === "core_competencies" && four[0].count === 4,
  "a fourth competency REFUSES the build and reports the count");
assert(/editorial/i.test(four[0].message), "…and says the choice of which three is the customer's");
assert(resolveCompetencies({ core_competencies_json: [{ h: "a" }, { h: "b" }, { h: "c" }, { h: "d" }] }).items.length === 4,
  "the resolver does NOT silently drop the fourth — refusing and trimming are different answers");

const two = refusalsFor({ core_competencies_json: [{ h: "a" }, { h: "b" }] });
assert(two.length === 1 && /Add 1 more/.test(two[0].message), "too FEW also refuses — the cap is exact, not a maximum");

const sevenD = refusalsFor({
  core_competencies_json: [{ h: "a" }, { h: "b" }, { h: "c" }],
  differentiators_json: Array.from({ length: 7 }, (_, i) => ({ h: `d${i}` }))
});
assert(sevenD.length === 1 && sevenD[0].field === "differentiators" && /Remove 1/.test(sevenD[0].message),
  `${DIFFERENTIATOR_MAX + 1} differentiators refuses`);
assert(refusalsFor({
  core_competencies_json: [{ h: "a" }, { h: "b" }, { h: "c" }],
  differentiators_json: Array.from({ length: DIFFERENTIATOR_MAX }, (_, i) => ({ h: `d${i}` }))
}).length === 0, `exactly ${DIFFERENTIATOR_MAX} differentiators builds clean — the boundary is inclusive`);

// Both wrong at once reports BOTH, so the customer fixes the document in one pass.
assert(refusalsFor({ core_competencies_json: [{ h: "a" }], differentiators_json: Array.from({ length: 9 }, () => ({ h: "x" })) }).length === 2,
  "two problems are reported together, not one at a time");

// A legacy profile is measured by the same cap, which is the whole point of resolving first.
assert(refusalsFor({ core_competencies: "one\ntwo\nthree" }).length === 0,
  "a legacy profile with three lines builds — the cap reads resolved items, not the column type");
assert(refusalsFor({ core_competencies: "one\ntwo" }).length === 1,
  "a legacy profile with two lines refuses, exactly as a structured one would");

// ── 7 · PROSE THAT WAS NEVER SPLIT ──────────────────────────────────────────
// The legacy columns split on NEWLINES, so a customer who typed sentences on ONE line has one
// item whose head is a paragraph. Competencies caught it by accident (the count is exact);
// differentiators had only a ceiling, so a run-on paragraph built clean and downloaded.

// TRANSCRIBED FROM THE LIVE RECORD 2026-08-10 — the sheet Design read at 01f9036e. This is the
// document that carried a test string to a rendered capability statement, and it is the reason
// this check exists. It must refuse.
const liveRecord = "FARaudit-powered compliance intelligence on every bid. Zero DFARS violations in 12 years. Average 4-day quote turnaround on LPTA solicitations. TEST WRITE UP";
assert(sentencesIn(liveRecord) === 4, `the live differentiators field runs 4 sentences on one line (read ${sentencesIn(liveRecord)})`);
assert(resolveDifferentiators({ differentiators: liveRecord }).items.length === 1,
  "…and resolves to ONE item, because there is no newline to split on");
// Indexed reads go through `first`, because an assertion that THROWS on the empty array is a
// gate that crashes rather than one that fails: the run stops at the first missing element and
// every assertion below it is never reached, so a sabotage pass reports one red and hides the
// rest. Proven by breaking this check — it surfaced exactly one failure until this was added.
const first = (r: ReturnType<typeof refusalsFor>) => r[0] ?? { field: "", count: -1, kind: "", message: "" };

const live = refusalsFor({ core_competencies_json: [{ h: "a" }, { h: "b" }, { h: "c" }], differentiators: liveRecord });
assert(live.length === 1 && first(live).field === "differentiators" && first(live).kind === "prose",
  "the live record REFUSES — before this check it built clean and shipped TEST WRITE UP");
assert(/own line/.test(first(live).message), "…and the message says what to do about it");

// NEGATIVE CONTROLS. A gate that only ever fires is as useless as one that never does, and this
// one BLOCKS a customer's export — a wrong refusal costs more than a missed paragraph.
assert(sentencesIn("Zero DFARS violations in 12 years.") === 1, "a single sentence with a trailing period is ONE");
assert(sentencesIn("Cleared work for U.S. Air Force sustainment commands") === 1,
  "an abbreviation is not a boundary — the character before the period is uppercase");
assert(sentencesIn("Average 4.5-day quote turnaround") === 1, "a decimal is not a boundary — no whitespace follows");
assert(sentencesIn("Small lots accepted (10 ea.) as standard") === 1, "a parenthetical abbreviation is not a boundary");
assert(refusalsFor({
  core_competencies: "Precision machining\nSustainment spares\nReverse engineering",
  differentiators: "Quotes inside a short RFQ window\nInspection kept under our roof"
}).length === 0, "a properly split legacy profile builds clean — the check reads shape, not the column type");
assert(refusalsFor({
  core_competencies_json: [{ h: "a" }, { h: "b" }, { h: "c" }],
  differentiators_json: [{ h: "Quotes fast. Inspection in-house.", b: "Two sentences a human typed as a head." }]
}).length === 0, "a STRUCTURED head is exempt — it was authored as a head, not made one by a newline");
assert(refusalsFor({ core_competencies_json: [{ h: "a" }, { h: "b" }, { h: "c" }], differentiators: "One good claim" }).length === 0,
  "ONE differentiator is legitimate and must NOT refuse — this is why the floor is shape, not count");

// THE KNOWN MISS, asserted so it stays visible rather than being discovered as a surprise.
assert(sentencesIn("fast quotes. always on time.") === 1,
  "a lowercase continuation reads as one sentence — the gate fails toward LETTING THE DOCUMENT BUILD, deliberately");

// SUPERSESSION. "Add 2 more" is wrong advice to someone holding one four-sentence paragraph:
// until the entries are separated the count is not knowable.
const blob = refusalsFor({ core_competencies: liveRecord });
assert(blob.length === 1 && first(blob).kind === "prose",
  "unsplit prose reports ONCE, as prose — the count refusal it would otherwise trigger is superseded");
assert(!/Add 2 more/.test(first(blob).message), "…and does not tell the customer to add items it cannot yet count");
assert(first(refusalsFor({ core_competencies: "one\ntwo" })).kind === "count",
  "a genuinely short SPLIT profile still gets the count refusal — supersession is scoped to unsplit prose");

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
