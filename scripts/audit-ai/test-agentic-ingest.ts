// Offline functional test of the REAL agentic-ingest exports (no LLM, no API).
// Proves: (1) coverage ledger flags version groups; (2) amendment-resolution
// supersedes ONLY on proven full-replacement, KEEPS all on incremental-patch text.
import { buildCoverageLedger, resolveAmendments, classifyBindingContent, parseAmendmentNumber } from "../../src/lib/agentic-ingest";
import { selectMapTargets, mergeExtracts, countSchemaUnions, DOC_EXTRACT_SCHEMA, type DocExtract } from "../../src/lib/agentic-map";
import { composeExtractedFacts, buildCoverageReport, partitionVacuousBindings } from "../../src/lib/agentic-orchestrator";
import { decideCoverageChip } from "../../src/app/audit/[id]/_v2-render-surfaces";
import { scoreGoldSet, type GoldSetPackage, type EngineExtraction } from "./gold-set-score";
import { scalarsFromSolicitation } from "../../src/lib/agentic-executor";
import {
  buildCompactMatrix, selectBindingExcerpts,
  OVERVIEW_LENS_SCHEMA, COMPLIANCE_LENS_SCHEMA, RISKS_LENS_SCHEMA, CROSSDOC_LENS_SCHEMA,
} from "../../src/lib/agentic-lenses";

const buf = (s: string) => Buffer.from(s);
// 3 versions of one inventory (different bytes) + a base section C (single).
const files = [
  { name: "J-1503010-09 Inventory.xlsx", bytes: buf("rows v1 .................") },
  { name: "revised J-1503010-09 Inventory.xlsx", bytes: buf("rows v2 ....") },
  { name: "Amendment 0011 Revised Section J-1503010-09 Inventory.xlsx", bytes: buf("rows v3") },
  { name: "Amendment 0005 Revised Section C 1503010 Custodial.pdf", bytes: buf("scope") },
];

const ledger = buildCoverageLedger(files);
let pass = true;
const check = (label: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} — ${label}`); pass = pass && cond; };

check("inventory detected as 1 version group (3 differing versions)", ledger.versionGroups === 1);
check("ledger NOT fullyResolved before amendment pass", ledger.fullyResolved === false);

// Negative: incremental patch language → no proof, all versions kept.
const patchText = "Amendment 0005: In Section C, paragraph 3.2, delete '24 hours' and insert '4 hours'. All other terms remain unchanged.";
const r1 = resolveAmendments(ledger, patchText);
check("incremental patch → 1 unresolved version group (kept all)", r1.versionGroups === 1);
check("incremental patch → 0 superseded (flag-only never drops)", r1.entries.filter(e => e.status === "superseded").length === 0);
check("incremental patch → no proof flagged", r1.resolutions.find(x => x.anchorKey === "J-1503010-09")?.proofFound === false);

// Positive: explicit full-replacement → FLAGGED as a hint, NOT dropped (completeness-first).
const replaceText = "Amendment 0011: Attachment J-1503010-09, Inventory, is deleted in its entirety and replaced with the attached revised version. All other provisions remain in full force and effect.";
const r2 = resolveAmendments(ledger, replaceText);
const res2 = r2.resolutions.find(x => x.anchorKey === "J-1503010-09");
check("full-replacement → FLAGGED not dropped: all versions still read (completeness-first)", r2.versionGroups === 1 && r2.entries.filter(e => e.status === "superseded").length === 0);
check("full-replacement → likelyOperative HINT = the Amendment 0011 file", (res2?.likelyOperative ?? "").includes("0011"));
check("full-replacement → 2 likelySuperseded HINTS (future LLM pass, not dropped)", (res2?.likelySuperseded.length ?? 0) === 2);
check("full-replacement → proof text recorded", (res2?.proof ?? "").includes("in its entirety"));

// Binding-content classifier: a wage determination must be full-read even if named like data.
check("wage determination → mustFullRead", classifyBindingContent("Attch 2 Wage Determination.pdf", null).mustFullRead === true);
check("plain inventory, no obligation text → summarize candidate", classifyBindingContent("J-1503010-09 Inventory.xlsx", "room count area sqft").mustFullRead === false);
check("inventory WITH frequency language → flips to full-read", classifyBindingContent("Inventory.xlsx", "restrooms cleaned daily").mustFullRead === true);

// ── MAP selection: unresolved versions are READ (safe); superseded/duplicate skipped
const selResolved = selectMapTargets(r2); // flag-only → no version is skipped
check("MAP reads ALL versions (flag-only never skips a version): 4 read, 0 skipped", selResolved.read.length === 4 && selResolved.skipped.length === 0);
const selPatch = selectMapTargets(r1);   // r1 = incremental patch, all versions kept
check("MAP reads ALL unresolved versions — SAFE (4 read, 0 skipped)", selPatch.read.length === 4 && selPatch.skipped.length === 0);
// byte-identical duplicate IS skipped — the ONLY safe skip path
const dupLedger = buildCoverageLedger([{ name: "X.pdf", bytes: buf("identical-bytes-xxxxx") }, { name: "X.pdf", bytes: buf("identical-bytes-xxxxx") }]);
check("byte-identical copies → 1 operative + 1 duplicate", dupLedger.identicalGroups === 1);
const dupSel = selectMapTargets(dupLedger);
check("MAP skips byte-identical duplicate (1 read, 1 skipped)", dupSel.read.length === 1 && dupSel.skipped.length === 1);

// ── MAP merge: dedup clauses by number, record provenance to first source
const exA: DocExtract = { docName: "Section I.pdf", clauses: [{ number: "52.204-7", title: "SAM", incorporated: "by_reference", effectiveDate: null, isTrap: false, trapReason: null }], clins: [], delivery: [], submissionRequirements: [], evaluationFactors: [], performanceRequirements: [], amendmentChanges: [], workStatementText: null, warnings: [], truncated: false };
const exB: DocExtract = { docName: "Section H.pdf", clauses: [{ number: "52.204-7", title: "SAM dup", incorporated: "by_reference", effectiveDate: null, isTrap: false, trapReason: null }, { number: "252.204-7012", title: "Safeguarding CUI", incorporated: "full_text", effectiveDate: null, isTrap: true, trapReason: "CUI" }], clins: [], delivery: [], submissionRequirements: [], evaluationFactors: [], performanceRequirements: [], amendmentChanges: [], workStatementText: null, warnings: [], truncated: false };
const merged = mergeExtracts([exA, exB]);
// Value-aware dedup: 52.204-7 collapses (same number+incorporation+trap, title-only
// diff), 252.204-7012 is distinct → 2 unique. Amendment-revised binding values would
// instead be kept (the dedup-drops-amendments fix).
check("MAP merge dedups clauses by binding identity (2 unique)", merged.clauses.length === 2);
check("MAP merge records provenance to first source doc", merged.provenance["clause:52.204-7"] === "Section I.pdf");

// ── MAP merge: workStatements append-ALL (was first-wins → dropped all but one SOW)
const sowA: DocExtract = { docName: "Section C base.pdf", clauses: [], clins: [], delivery: [], submissionRequirements: [], evaluationFactors: [], performanceRequirements: [{ text: "Clean all restrooms daily", category: "frequency", sourceSection: "C.3.2", isCritical: true }], amendmentChanges: [], workStatementText: "BASE SOW BODY", warnings: [], truncated: false };
const sowB: DocExtract = { docName: "Amendment 0005 Revised Section C.pdf", clauses: [], clins: [], delivery: [], submissionRequirements: [], evaluationFactors: [], performanceRequirements: [{ text: "clean all restrooms   daily", category: "frequency", sourceSection: "C.3.2", isCritical: true }, { text: "Respond to call-backs within 4 hours", category: "standard", sourceSection: "C.3.5", isCritical: true }], amendmentChanges: [{ amendmentNumber: "0005", change: "Restroom frequency changed 24h→4h", affectedSection: "C.3.2" }], workStatementText: "AMENDED SOW BODY", warnings: [], truncated: false };
const mergedSow = mergeExtracts([sowA, sowB]);
check("MAP merge keeps BOTH work statements (append-all, not first-wins)", mergedSow.workStatements.length === 2 && mergedSow.workStatements[1].docName.includes("0005"));
check("MAP merge dedups perfReqs by normalized text (1 dup collapses → 2 unique)", mergedSow.performanceRequirements.length === 2);
check("MAP merge collects amendment changes", mergedSow.amendmentChanges.length === 1 && mergedSow.amendmentChanges[0].amendmentNumber === "0005");

// compose joins all work statements WITH source-doc headers (no SOW silently dropped)
const sowFacts = composeExtractedFacts({}, mergedSow);
check("compose joins all SOW bodies with doc headers", !!sowFacts.workStatementText && sowFacts.workStatementText.includes("Section C base.pdf") && sowFacts.workStatementText.includes("Amendment 0005"));
check("compose threads performanceRequirements + amendmentChanges to facts", (sowFacts.performanceRequirements?.length ?? 0) === 2 && (sowFacts.amendmentChanges?.length ?? 0) === 1);

// ── orchestrator compose: scalars come from SAM (deterministic), arrays from MAP
const facts = composeExtractedFacts({ naicsCode: "561720", setAside: "SDVOSB", contractType: "FFP" }, merged);
check("compose: scalar facts from SAM (naics), never from model", facts.naicsCode === "561720" && facts.setAside === "SDVOSB");
check("compose: analysis arrays from MAP (2 deduped clauses)", facts.clauses.length === 2);

// ── orchestrator coverage gate: complete vs honestly-INCOMPLETE
const cov = { read: ["a.pdf", "b.pdf"], skipped: [{ name: "dup.pdf", reason: "byte-identical duplicate" }] };
const repComplete = buildCoverageReport(r2, cov, []);
check("coverage: complete when no read failures + says 'in full'", repComplete.complete === true && /in full/.test(repComplete.statement));
const repPartial = buildCoverageReport(r2, cov, ["unreadable.pdf"]);
check("coverage: read failure → flagged INCOMPLETE (never silent)", repPartial.complete === false && /INCOMPLETE/.test(repPartial.statement));

// ── executor wiring: SAM facts → scalars (deterministic; facts never from model)
const sc = scalarsFromSolicitation({ naicsCode: "561720", typeOfSetAside: "SDVOSBC", solicitationNumber: "N4008526R0065", responseDeadLine: "2026-07-01" }, "DEPT OF THE NAVY");
check("scalars: SAM facts mapped (naics/setAside/sol#/deadline/office)", sc.naicsCode === "561720" && sc.setAside === "SDVOSBC" && sc.solicitorNumber === "N4008526R0065" && sc.offerDueDate === "2026-07-01" && sc.issuingOffice === "DEPT OF THE NAVY");
check("scalars: contractType/PoP left null (analysis layer, not a SAM fact)", sc.contractType === null && sc.periodOfPerformance === null);
check("scalars: blank/whitespace SAM fields → null (no junk facts)", scalarsFromSolicitation({ naicsCode: "  ", typeOfSetAside: null }).naicsCode === null);

// ── amendment-number parser handles real SAM filename shapes (cleanup #6)
check("amendment# parses real SAM shapes (Amd_0001 / Amendment 0011 / Mod 0002)",
  parseAmendmentNumber("Sol_1232SA26R0020_Amd_0001.pdf") === 1 &&
  parseAmendmentNumber("Amendment 0011 Revised X.pdf") === 11 &&
  parseAmendmentNumber("Mod 0002.pdf") === 2 &&
  parseAmendmentNumber("J-1503010-09 Inventory.xlsx") === null);

// ── schema union-budget guard: catch the Anthropic 16-union 400 for FREE (was only
// discoverable by spending money on a live MAP that read 0 docs)
const unionCount = countSchemaUnions(DOC_EXTRACT_SCHEMA);
check(`DOC_EXTRACT_SCHEMA union params (${unionCount}) under Anthropic's 16 limit`, unionCount <= 16);

// ── STAGE 2: lens schema union-budget guards (same free pre-flight as the MAP) ──
for (const [name, schema] of [
  ["OVERVIEW_LENS_SCHEMA", OVERVIEW_LENS_SCHEMA],
  ["COMPLIANCE_LENS_SCHEMA", COMPLIANCE_LENS_SCHEMA],
  ["RISKS_LENS_SCHEMA", RISKS_LENS_SCHEMA],
  ["CROSSDOC_LENS_SCHEMA", CROSSDOC_LENS_SCHEMA],
] as const) {
  const u = countSchemaUnions(schema);
  check(`${name} union params (${u}) under Anthropic's 16 limit`, u <= 16);
}

// ── STAGE 2: buildCompactMatrix — deterministic, citation-bearing, bounded ──────
const matrixFacts = composeExtractedFacts(
  { naicsCode: "561720", setAside: "SDVOSB", contractType: "FFP", solicitorNumber: "N4008526R0065" },
  mergedSow
);
const m1 = buildCompactMatrix(matrixFacts, { provenance: merged.provenance, coverageStatement: "Audited 2 of 2 in full" });
const m2 = buildCompactMatrix(matrixFacts, { provenance: merged.provenance, coverageStatement: "Audited 2 of 2 in full" });
check("matrix: deterministic (same facts → byte-identical matrix)", m1 === m2);
check("matrix: carries SAM scalars (sol# + NAICS)", m1.includes("N4008526R0065") && m1.includes("561720"));
check("matrix: surfaces performance requirements (the most-missed category)", m1.includes("PERFORMANCE REQUIREMENTS") && m1.includes("restrooms"));
check("matrix: surfaces amendment deltas (SF-30 Item-14)", m1.includes("AMENDMENT CHANGES") && m1.includes("Amd 0005"));
check("matrix: includes the coverage statement", m1.includes("Audited 2 of 2 in full"));
// bounding: a pathological facts set is trimmed with a VISIBLE note, never silent
const bigPerf = Array.from({ length: 2000 }, (_, i) => ({ text: `obligation number ${i} `.repeat(20), category: "scope" as const, sourceSection: "C", isCritical: false }));
const bigMatrix = buildCompactMatrix({ ...matrixFacts, performanceRequirements: bigPerf }, { maxChars: 50_000 });
check("matrix: over-budget input is bounded + marked (never silent)", bigMatrix.length <= 50_400 && /TRUNCATED|trims/.test(bigMatrix));

// ── STAGE 2: selectBindingExcerpts — picks binding docs, bounded ────────────────
const bindingPick = selectBindingExcerpts([
  { name: "Attch 2 Wage Determination.pdf", text: "The contractor shall pay the prevailing wage rate of $24.18 per hour. ".repeat(50) },
  { name: "J-1503010-09 Inventory.xlsx", text: "room count area sqft ".repeat(50) }, // pure-data → skipped
  { name: "Section M Evaluation.pdf", text: "Proposals shall be evaluated on a best-value basis. ".repeat(50) },
], { perDocChars: 500, totalChars: 2_000 });
check("binding-excerpts: selects binding docs, skips pure-data inventory", bindingPick.selected.includes("Attch 2 Wage Determination.pdf") && bindingPick.selected.includes("Section M Evaluation.pdf") && !bindingPick.selected.includes("J-1503010-09 Inventory.xlsx"));
check("binding-excerpts: bounded to the total char budget", bindingPick.text.length <= 2_400);

// ── STAGE 3: vacuous-binding → read-failure (honest-fail ship-gate) ─────────────
// A BINDING doc (mustFullRead) that produced a zero-content extract is an extraction
// failure, NOT a "read in full"; a vacuous NON-binding (pure-data) doc is a legit empty.
const emptyExtract = (docName: string): DocExtract => ({
  docName, clauses: [], clins: [], delivery: [], submissionRequirements: [], evaluationFactors: [],
  performanceRequirements: [], amendmentChanges: [], workStatementText: null, warnings: [], truncated: false,
});
const richExtract: DocExtract = { ...emptyExtract("Section M Evaluation.pdf"), evaluationFactors: [{ factor: "Technical", weight: "most important", method: "best_value" }] };
const vacText = new Map<string, string>([
  ["Attch 2 Wage Determination.pdf", "the contractor shall pay the prevailing wage rate per hour"], // binding (obligation text)
  ["J-1503010-09 Inventory.xlsx", "room count area sqft "], // pure-data → NOT binding
  ["Section M Evaluation.pdf", "proposals evaluated on best value"],
]);
const partition = partitionVacuousBindings(
  [emptyExtract("Attch 2 Wage Determination.pdf"), emptyExtract("J-1503010-09 Inventory.xlsx"), richExtract],
  vacText
);
check("vacuous-binding: empty Wage Determination → demoted to read-failure", partition.vacuousBindingNames.includes("Attch 2 Wage Determination.pdf"));
check("vacuous-binding: empty pure-data inventory → kept as a legit empty read (not a failure)", partition.valid.some(e => e.docName === "J-1503010-09 Inventory.xlsx") && !partition.vacuousBindingNames.includes("J-1503010-09 Inventory.xlsx"));
check("vacuous-binding: non-vacuous binding (§M w/ a factor) → stays valid", partition.valid.some(e => e.docName === "Section M Evaluation.pdf") && partition.vacuousBindingNames.length === 1);
// FALSE-PARTIAL GUARD: a generically-named, legitimately-empty file (cover sheet / blank
// form) hits classifyBindingContent's conservative DEFAULT full-read — it must NOT be
// demoted, or a valid package would flip to PARTIAL/no-charge. Only POSITIVELY-binding
// (never-summarize type OR obligation text) vacuous docs are read-failures.
const genericPartition = partitionVacuousBindings(
  [emptyExtract("Attachment 7.pdf")],
  new Map([["Attachment 7.pdf", "cover page see attached enclosures"]]) // no obligation words, generic name → default full-read
);
check("vacuous-binding: generic legit-empty file (default full-read) → NOT demoted (valid stays complete)", genericPartition.vacuousBindingNames.length === 0 && genericPartition.valid.length === 1);
// the demoted name, fed to buildCoverageReport as a read-failure, flips coverage INCOMPLETE
const vacCoverage = buildCoverageReport(r2, { read: ["b.pdf"], skipped: [] }, partition.vacuousBindingNames);
check("vacuous-binding: demotion makes coverage report INCOMPLETE (no-charge)", vacCoverage.complete === false && /INCOMPLETE/.test(vacCoverage.statement));

// ── STAGE 3: honest ingestion-banner coverage chip — agentic partial is AUTHORITATIVE
const allDetected = new Set(["C", "L", "M"]);
const chipForcedWarn = decideCoverageChip({ detected: allDetected, allIngested: true, filesRead: 9, filesTotal: 9, agenticComplete: false });
check("banner: agentic INCOMPLETE overrides 'all read' → warn, never the false 'All sources read in full' claim", chipForcedWarn.covClass === "warn" && !/All sources read in full/.test(chipForcedWarn.covText) && /Partial/.test(chipForcedWarn.covText));
const chipNormalComplete = decideCoverageChip({ detected: new Set(), allIngested: true, filesRead: 5, filesTotal: 5, agenticComplete: null });
check("banner: non-agentic path unchanged — all ingested → 'All sources read in full'", chipNormalComplete.covClass === "ok" && /All sources read in full/.test(chipNormalComplete.covText));
const chipAgenticOk = decideCoverageChip({ detected: new Set(), allIngested: true, filesRead: 5, filesTotal: 5, agenticComplete: true });
check("banner: agentic COMPLETE does not force a false warn", chipAgenticOk.covClass === "ok");

// ── STAGE 4 scaffold: gold-set scorer — recall/precision + binding + planted-hard ──
const goldPkg: GoldSetPackage = {
  packageId: "FIXTURE-1",
  groundTruth: {
    clauses: [
      { number: "52.204-7", binding: true },
      { number: "252.204-7012", binding: true, plantedHard: true }, // the buried CMMC bid-loser
      { number: "52.222-50", binding: false },
    ],
    requirements: ["submit SF-1449", "past performance 3 refs"],
    evalFactors: ["Technical", "Price"],
    gates: ["CMMC L2"],
  },
};
const engineExtract: EngineExtraction = {
  clauses: ["52.204-7 ", "99.99-9"], // recovers 1 binding (normalized), 1 false positive; MISSES the planted 252.204-7012
  requirements: ["Submit SF-1449"],   // case/space variant → must still match
  evalFactors: ["Technical", "Price"],
  gates: [],                          // misses the CMMC gate
};
const gss = scoreGoldSet(engineExtract, goldPkg);
check("gold-score: clause recall counts normalized matches (1 of 3) + flags the false positive", gss.clauses.found === 1 && gss.clauses.total === 3 && gss.clauses.falsePositives === 1 && Math.abs(gss.clauses.precision - 0.5) < 1e-9);
check("gold-score: requirement match is whitespace/case-insensitive (1 of 2)", gss.requirements.found === 1 && gss.requirements.total === 2);
check("gold-score: bindingClauseRecall over binding subset only (0.5)", Math.abs(gss.bindingClauseRecall - 0.5) < 1e-9);
check("gold-score: plantedHardRecall = 0 when the seeded bid-loser is missed (the moat metric)", gss.plantedHardRecall === 0);
check("gold-score: missedBinding NAMES the bid-losers", gss.missedBinding.includes("252.204-7012") && !gss.missedBinding.includes("52.204-7"));
check("gold-score: missed gate → gate recall 0", gss.gates.recall === 0 && gss.evalFactors.recall === 1);

console.log(pass ? "\nALL PASS ✅" : "\nSOME FAILED ❌");
process.exit(pass ? 0 : 1);
