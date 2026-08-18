// $0 regression lock for the three coverage-TRUTH defects. Run: npx tsx src/lib/coverage-truth.test.ts
//
// Each of these is a case where the engine reported something one notch stronger than what it knew. None
// changed a verdict; two never reached a customer at all. They are locked anyway, because the instrument
// you read coverage off is the last thing that should be quietly wrong — the docsRead figure below had
// already over-reported twice on the record before anyone noticed it was counting the wrong noun.
//
// 1. tallyDocsRead      — DISTINCT documents, not a sum of per-lens read counts.
// 2. deriveAnalyzedDocuments — says "retrieved in full"; it cannot know the document was READ.
// 3. runAgenticExpert   — records a section only when the read RETURNED it, never on the bare tool call.
export {};

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean, detail?: string) => {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
};

async function main() {
  const { tallyDocsRead } = await import("./audit-orchestrator");
  const { deriveAnalyzedDocuments } = await import("./audit-executor-v3");
  const { runAgenticExpert } = await import("./audit-expert");

  // ── 1. docsRead is a SET, not a SUM ──────────────────────────────────────────────────────────────────
  // Five lenses opening the same three attachments is three documents covered, not fifteen. The old log
  // summed the lengths, so overlap — which is the NORMAL case, every lens reads the base solicitation —
  // inflated the number without bound.
  const overlapping = [
    { docsRead: ["Attachment 1 - PWS.pdf", "Wage Determination.pdf", "SF1442.pdf"] },
    { docsRead: ["Attachment 1 - PWS.pdf", "Wage Determination.pdf", "SF1442.pdf"] },
    { docsRead: ["Attachment 1 - PWS.pdf"] },
  ];
  const t = tallyDocsRead(overlapping);
  ok("distinct counts documents, not reads", t.distinct === 3, `got ${t.distinct}, expected 3`);
  ok("lensReads keeps the re-read pressure figure", t.lensReads === 7, `got ${t.lensReads}, expected 7`);
  ok("the two figures are NOT the same number under overlap", t.distinct !== t.lensReads);
  // Degenerate cases: no lens read anything, and a single lens with no overlap (where sum === set, so a
  // test built only on this shape would pass against the OLD summing code — hence the overlap case above).
  ok("empty panel is 0/0", tallyDocsRead([]).distinct === 0 && tallyDocsRead([]).lensReads === 0);
  const noOverlap = tallyDocsRead([{ docsRead: ["a.pdf"] }, { docsRead: ["b.pdf"] }]);
  ok("no-overlap panel agrees on both figures", noOverlap.distinct === 2 && noOverlap.lensReads === 2);

  // ── 2. "retrieved", not "read" ───────────────────────────────────────────────────────────────────────
  // deriveAnalyzedDocuments is handed the assembled source and the verdict path's gap list. It is NOT
  // handed docsRead, so it has no basis for asserting any lens opened the document. Both facts can be
  // true at once — the bytes arrived AND nothing read them — and that is the case this string describes.
  const src = [
    "==== DOCUMENT: Attachment 1 - PWS.pdf ====",
    "The contractor shall provide grounds maintenance.",
    "==== DOCUMENT: Wage Determination.pdf ====",
    "General Decision Number: TX20260012",
  ].join("\n");
  const d = deriveAnalyzedDocuments(src, ["Wage Determination.pdf"]);
  const reason = d.unanalyzed[0]?.reason ?? "";
  ok("names the uncovered document", d.unanalyzed[0]?.name === "Wage Determination.pdf", d.unanalyzed[0]?.name);
  ok("claims RETRIEVAL, which it can support", /retrieved in full/i.test(reason), reason);
  ok("does NOT claim the document was READ", !/\bread in full\b/i.test(reason), reason);
  ok("still says plainly that nothing analyzed it", /not analyzed/i.test(reason), reason);

  // ── 3. a section enters sectionsRead only if the read RETURNED it ────────────────────────────────────
  // The lens asks for §L (present) and §M (absent — this package has no §M). Membership in sectionsRead is
  // what moves a section out of completenessOf's `unread` branch, so an absent section that gets in is an
  // absent section that can be certified covered.
  const ctx = {
    fullSource: "SECTION L\nOfferors shall submit a technical volume.\n",
    sections: { L: "Offerors shall submit a technical volume." },
  };
  let turn = 0;
  const callModel = async () => {
    turn++;
    if (turn === 1) {
      return {
        toolCalls: [
          { id: "t1", name: "read_section", input: { key: "L" } },
          { id: "t2", name: "read_section", input: { key: "M" } },
        ],
        findings: null,
      };
    }
    return { toolCalls: [], findings: [] };
  };
  const run = await runAgenticExpert(
    { key: "probe", system: "s" },
    ctx as never,
    { callModel: callModel as never, maxTurns: 3 },
  );
  ok("the section that EXISTS is recorded", run.sectionsRead.includes("L"), JSON.stringify(run.sectionsRead));
  ok("the ABSENT section the lens asked for is NOT recorded", !run.sectionsRead.includes("M"), JSON.stringify(run.sectionsRead));
  // The lens still SAW the call — the trace is the pure observer and must keep both, or the diagnostic
  // record of what the lens tried to do is lost along with the bad bookkeeping.
  const asked = run.trace.flatMap((b) => b.tools).filter((x) => x.name === "read_section").map((x) => String(x.input.key));
  ok("the trace still records that §M was requested", asked.includes("M"), JSON.stringify(asked));

  console.log(`\ncoverage-truth: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
