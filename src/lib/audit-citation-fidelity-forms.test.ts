// ARC #747 · E2 — THE TWO WAYS A FAIL-CLOSED CITATION GATE GETS IT WRONG.
// Run: npx tsx src/lib/audit-citation-fidelity-forms.test.ts
//
// Round 3 of /code-review high on PR #294 found one of each.
//
//   #5  OVER-STRICT — the grammar capped the non-clause dash suffix at two digits, which is the shape of a
//       paragraph split (6.302-1) but not of the part-53/253 sections that PRESCRIBE the standard forms.
//       FAR 53.301-1442 (SF 1442, on essentially every construction solicitation) was withheld as invalid,
//       and the presence exoneration could not rescue it because solicitations name the FORM, not the
//       prescribing section. A fail-closed gate deleting a TRUE citation is this module's own stated failure
//       mode, pointed the other way.
//
//   #6  A HOLE — the orchestrator gated `decision.reason`, then audit-executor-v3 reopened that exact field
//       to fold in model-authored panel-judge rationale, ungated, and persisted it as the "Bottom line".
//
// The suite holds the two directions together on purpose: every widening of the grammar is an invitation to
// re-open the fabrication path, so the founding catch is asserted in the same file that widens it.
export {};
import { CORPUS_GRAMMAR, gateCitationsInText } from "./audit-citation-fidelity";
import { foldPanelReason } from "./panel-findings-bridge";

let failures = 0;
const check = (name: string, ok: boolean, extra?: string) => {
  console.log(`${ok ? "✅" : "❌"} ${name}${!ok && extra ? `\n     ${extra}` : ""}`);
  if (!ok) failures++;
};

process.env.AUDIT_CITATION_FIDELITY = "true";

// A source that names the FORMS the way a real solicitation does — never the prescribing section.
const SOURCE =
  "The offeror shall submit Standard Form 1442 with its bid. Standard Form 1449 applies to commercial items. " +
  "Award will be made in accordance with FAR 9.5 and the procedures at FAR 6.302-1.";

// ── #5 · REAL DESIGNATIONS SURVIVE ───────────────────────────────────────────────────────────────────
{
  const mustSurvive: Array<[string, string]> = [
    ["FAR 53.301-1442", "the section prescribing SF 1442 — every construction solicitation"],
    ["DFARS 253.303-1449", "the DFARS twin, prescribing SF 1449"],
    ["FAR 53.301-30", "a two-digit form section — the shape that already worked"],
    ["FAR 9.5", "a bare subpart — the regression the module's header records"],
    ["FAR 6.302-1", "a paragraph split"],
    ["FAR 52.219-14", "a clause"],
    ["DFARS 252.204-7012", "the DFARS clause shape"],
  ];
  for (const [cite, why] of mustSurvive) {
    const out = gateCitationsInText(`Comply with ${cite} as applicable.`, SOURCE);
    check(`#5 survives: ${cite} (${why})`, !out.text.includes("citation withheld"),
      `withheld → ${out.text}`);
  }
}

// ── #5b · THE FOUNDING CATCH IS NOT LOOSENED ─────────────────────────────────────────────────────────
{
  // "215-2" is the founding defect: a DFARS *subpart* written as if it were a clause. It carries no dot, so
  // the non-clause alternative never applies to it however wide the dash suffix gets. Assert that here, in
  // the file that widened the suffix — a widening that quietly readmits this is the whole risk.
  const trailing = gateCitationsInText("The offeror shall comply with DFARS 215-2.", SOURCE);
  check("#5b the founding malformed cite is still withheld (trailing period)",
    trailing.text.includes("citation withheld"), `passed through → ${trailing.text}`);

  const midSentence = gateCitationsInText("Per DFARS 215-2, submit two volumes.", SOURCE);
  check("#5b …and mid-sentence", midSentence.text.includes("citation withheld"),
    `passed through → ${midSentence.text}`);

  check("#5b grammar rejects a 5-digit dash suffix (still bounded)",
    !CORPUS_GRAMMAR.FAR.test("53.301-14425"), "FAR grammar admits an unbounded suffix");
  check("#5b grammar rejects a non-existent FAR part",
    !CORPUS_GRAMMAR.FAR.test("54.301-1442"), "FAR grammar admits part 54");
}

// ── #6 · THE PANEL FOLD CANNOT REOPEN THE GATED FIELD ────────────────────────────────────────────────
{
  // Reproduce the executor's composition exactly: gate the reason, then fold ungated rationale into it, then
  // gate the RESULT — which is what the fix does and what the reader receives.
  const derived = gateCitationsInText("Two volumes are required.", SOURCE, "reason").text;
  const rationale = "The panel agrees the offeror must comply with DFARS 215-2 before submission.";

  const ungated = foldPanelReason(derived, rationale);
  check("#6 (control) the fold DOES carry an ungated cite into the reason — the hole was real",
    ungated.includes("DFARS 215-2"), `fold produced: ${ungated}`);

  const gated = gateCitationsInText(ungated, SOURCE, "reason");
  check("#6 gating the fold's OUTPUT withholds it",
    !gated.text.includes("DFARS 215-2") && gated.text.includes("citation withheld"),
    `gated reason: ${gated.text}`);
  check("#6 the panel's substance survives — only the citation is withheld",
    gated.text.includes("The panel agrees") && gated.text.includes("before submission"),
    `gated reason: ${gated.text}`);
  check("#6 a REAL cite folded in by the panel is not withheld",
    !gateCitationsInText(foldPanelReason(derived, "The panel notes FAR 6.302-1 governs."), SOURCE, "reason")
      .text.includes("citation withheld"),
    "a valid citation in the panel rationale was deleted");
}

// ── #6b · CALL-SITE TRIPWIRE ─────────────────────────────────────────────────────────────────────────
{
  // As on E1: the behavioural checks prove the composition is sound, not that the executor performs it.
  // This reads the source, and is the weaker instrument — it catches the reversion, not every regression.
  const src = require("fs").readFileSync(require("path").join(__dirname, "audit-executor-v3.ts"), "utf8") as string;
  check("tripwire · the executor gates the folded reason before buildV3Payload",
    /foldPanelReason\([^)]*\);\s*\n\s*const foldGate\s*=\s*citationFidelityEnabled\(\)/.test(src),
    "foldPanelReason's output is assigned straight to res.decision.reason — the gate is bypassed again");
}

// ── #3 · A LATER IN-PLACE PASS MUST SURVIVE THIS GATE ────────────────────────────────────────────────
{
  // PR #292 and PR #294 branch from the same commit and both append a block immediately before the same
  // `return`, so they merge into one block. The gate produces COPIES for every touched row; #292's head
  // re-grounding mutates findings IN PLACE. If the gate hands its copies to the return while the local still
  // points at the originals, whichever pass runs second writes to objects that never ship — and it fails
  // silently, for exactly the rows the gate touched. Reproduced here with a stand-in mutator so the property
  // is pinned on this branch, without depending on the sibling branch's code.
  const { gateFindingCitations } = require("./audit-citation-fidelity") as typeof import("./audit-citation-fidelity");
  type Row = { id: string; lens: string; citation?: string; requirement?: string; excerpt?: string };
  const mkRows = (): Row[] => [
    { id: "a", lens: "instructions", citation: "DFARS 215-2", requirement: "Submit per DFARS 215-2", excerpt: "clipped" },
    { id: "b", lens: "pricing", citation: "FAR 6.302-1", requirement: "Justify the sole source", excerpt: "clipped" },
  ];
  const widenInPlace = (rows: Row[]) => { for (const r of rows) r.excerpt = "WIDENED " + r.excerpt; };

  // ORDER 1 — gate, rebind (what the orchestrator now does), then the in-place pass.
  const o1 = mkRows();
  const gated1 = gateFindingCitations(o1, SOURCE).findings;
  widenInPlace(gated1);                       // the pass operates on the array that ships
  // ORDER 2 — the in-place pass first, then the gate.
  const o2 = mkRows();
  widenInPlace(o2);
  const gated2 = gateFindingCitations(o2, SOURCE).findings;

  check("#3 the widening survives in BOTH orders",
    gated1.every((r) => r.excerpt?.startsWith("WIDENED")) && gated2.every((r) => r.excerpt?.startsWith("WIDENED")),
    `order1: ${gated1.map((r) => r.excerpt)} | order2: ${gated2.map((r) => r.excerpt)}`);
  check("#3 the two orders produce identical rows — the passes are on disjoint fields",
    JSON.stringify(gated1) === JSON.stringify(gated2),
    `order1: ${JSON.stringify(gated1)}\n     order2: ${JSON.stringify(gated2)}`);
  check("#3 the malformed cite is still withheld under both",
    !!gated1[0].citation?.includes("citation withheld") && !!gated2[0].citation?.includes("citation withheld"),
    `order1 cite: ${gated1[0].citation} | order2 cite: ${gated2[0].citation}`);

  // The regression itself: writing to the ORIGINALS after the gate loses the work on touched rows only —
  // which is why it would have shipped looking like an intermittent bug rather than a broken merge.
  const o3 = mkRows();
  const gated3 = gateFindingCitations(o3, SOURCE).findings;
  widenInPlace(o3);                           // the pre-fix shape: mutate the locals, return the copies
  check("#3 (control) mutating the pre-gate originals loses the touched row — the hazard was real",
    !gated3[0].excerpt?.startsWith("WIDENED") && !!gated3[1].excerpt?.startsWith("WIDENED"),
    `touched row: ${gated3[0].excerpt} | untouched row: ${gated3[1].excerpt}`);

  const src = require("fs").readFileSync(require("path").join(__dirname, "audit-orchestrator.ts"), "utf8") as string;
  check("tripwire · the orchestrator rebinds findings/decision before returning",
    /findings = citeGate\.findings;\s*\n\s*decision = decisionOut;/.test(src),
    "the gate's copies go straight to the return — a later in-place pass writes to objects that never ship");
}

console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILURE(S)`);
if (failures) process.exit(1);
