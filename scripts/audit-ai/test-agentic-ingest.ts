// Offline functional test of the REAL agentic-ingest exports (no LLM, no API).
// Proves: (1) coverage ledger flags version groups; (2) amendment-resolution
// supersedes ONLY on proven full-replacement, KEEPS all on incremental-patch text.
import { buildCoverageLedger, resolveAmendments, classifyBindingContent, parseAmendmentNumber } from "../../src/lib/agentic-ingest";
import { selectMapTargets, mergeExtracts, countSchemaUnions, DOC_EXTRACT_SCHEMA, type DocExtract } from "../../src/lib/agentic-map";
import { composeExtractedFacts, buildCoverageReport } from "../../src/lib/agentic-orchestrator";
import { scalarsFromSolicitation } from "../../src/lib/agentic-executor";

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

console.log(pass ? "\nALL PASS ✅" : "\nSOME FAILED ❌");
process.exit(pass ? 0 : 1);
