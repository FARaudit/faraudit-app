// $0 NEGATIVE-first proof for Brain card 288 — the SF-1442 / part36 CONSTRUCTION decided-verdict carrier.
// Run: npx tsx src/lib/audit-construction-manifest.test.ts
//
// DOCTRINE UNDER TEST (Brain cards 287/288): a document-bounded construction solicitation with a resolvable offer
// structure (W9126 shape) reaches a DECIDED verdict via a construction binding-content carrier, WITHOUT weakening the
// completeness gate — the gate certifies against the SEALED FULL-TEXT manifest, NEVER the compressed digest. The :574
// completeness FORMULA is untouched; only the carrier populating `required` changes for part36. Every negative below is
// a false-COMPLETE / false-BID / gate-weakening interceptor and becomes a permanent regression test.

import {
  sweepConstructionManifest, constructionRequired, constructionCoreMissing, constructionCoverage,
  CONSTRUCTION_CORE, type ConstructionManifest,
} from "./audit-construction-manifest";
import { buildManifest, coreMissingFor, completenessOf, amendmentSupersessionUnresolved, runAgenticAudit } from "./audit-orchestrator";
import { procurementPart, type AuditToolContext } from "./audit-tools";
import { detectConstructionOutOfScope } from "./section-boundary-detector";
import type { TypedFinding } from "./audit-findings";
import type { CallModel } from "./audit-expert";

let pass = 0; let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : `  — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};
const ok = (label: string, cond: boolean) => eq(label, !!cond, true);

// ── A W9126-SHAPE construction package (SF-1442, bonding, wage det, submission, scope, set-aside). Multi-doc so the
//    primary + one binding attachment both carry construction content. ──
const PRIMARY = [
  "STANDARD FORM 1442 — SOLICITATION, OFFER AND AWARD (CONSTRUCTION, ALTERATION, OR REPAIR)",
  "Offers are due 2:00 PM local time. Bid schedule for all line items shall be completed.",
  "52.228-1 Bid Guarantee: each offer must be accompanied by a bid guarantee of 20 percent.",
  "Performance bond and payment bond required per 52.228-15 upon award.",
  "This acquisition is a HUBZone small business set-aside.",
].join("\n");
const ATTACH = [
  "Davis-Bacon wage determination WD 24-0012 applies to all construction labor on this project.",
  "STATEMENT OF WORK: the contractor shall repair the roof of Building 100 per the specifications.",
].join("\n");
const W9126_DOCS = [{ name: "primary solicitation", text: PRIMARY }, { name: "wage-det-attachment", text: ATTACH }];
const W9126_SRC = `==== DOCUMENT: primary solicitation ====\n\n${PRIMARY}\n\n==== DOCUMENT: wage-det-attachment ====\n\n${ATTACH}`;

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// DETERMINISTIC CORE — the sealed manifest + carrier
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
const m = sweepConstructionManifest(W9126_DOCS, "236220");
ok("sweep · isConstruction (NAICS-23 / SF-1442)", m.isConstruction);
const present = m.elements.filter((e) => e.present).map((e) => e.key).sort();
eq("sweep · all 5 elements PRESENT", present, ["bonding", "scope", "set_aside", "submission", "wage_determination"]);
ok("sweep · every PRESENT element carries an anchor + verbatim span + hash (Rule 64)",
   m.elements.filter((e) => e.present).every((e) => !!e.anchor && !!e.span && !!e.regionHash && !!e.sourceDoc));
ok("sweep · wage_determination grounded in the ATTACHMENT (per-doc provenance)",
   m.elements.find((e) => e.key === "wage_determination")?.sourceDoc === "wage-det-attachment");
eq("carrier · constructionRequired = present elements (required.length>0 satisfiable)",
   constructionRequired(m).sort(), ["bonding", "scope", "set_aside", "submission", "wage_determination"]);
eq("carrier · constructionCoreMissing = [] when all core present", constructionCoreMissing(m), []);
eq("core set is bonding/wage/submission (the §C/§L/§M analog)", CONSTRUCTION_CORE, ["bonding", "wage_determination", "submission"]);

// N3 — an UNREADABLE binding doc (image-only stub, no text): its core elements read ABSENT ⇒ coreMissing non-empty.
const noWageDocs = [{ name: "primary solicitation", text: PRIMARY }, { name: "scanned-attachment", text: "[image-only — no machine-readable text]" }];
const mNoWage = sweepConstructionManifest(noWageDocs, "236220");
ok("N3 · unreadable wage-det attachment → wage_determination ABSENT", !mNoWage.elements.find((e) => e.key === "wage_determination")?.present);
eq("N3 · construction CORE missing surfaces wage_determination ⇒ INCOMPLETE driver", constructionCoreMissing(mNoWage), ["wage_determination"]);

// N2 / N4 — COMPRESSOR-TRUST: an element sealed over FULL text whose span was DROPPED by the compressor (absent from
// the read source) must NOT certify covered — it is droppedByCompressor ⇒ missing ⇒ INCOMPLETE. The gate certifies
// against the sealed full-text span's SURVIVAL into fullSource, never the digest self-certifying.
const bondingSpan = m.elements.find((e) => e.key === "bonding")!.span!;
const digestMissingBonding = W9126_SRC.replace(/52\.228-1 Bid Guarantee[^\n]*/g, "").replace(/Performance bond and payment bond[^\n]*/g, "");
const covDropped = constructionCoverage(m, digestMissingBonding, [bondingSpan]);
ok("N2/N4 · bonding span absent from read source → droppedByCompressor", covDropped.droppedByCompressor.includes("bonding"));
ok("N2/N4 · dropped bonding is MISSING (not covered) ⇒ INCOMPLETE", covDropped.missing.includes("bonding") && !covDropped.covered.includes("bonding"));

// N8 — a PRESENT element in-source but with NO grounded finding analyzing it is present-but-UNANALYZED ⇒ missing.
const covUnanalyzed = constructionCoverage(m, W9126_SRC, [/* zero findings */]);
ok("N8 · present-but-unanalyzed bonding → missing (silence ≠ coverage)", covUnanalyzed.missing.includes("bonding"));
// …and WITH a grounded finding it is covered.
const covAnalyzed = constructionCoverage(m, W9126_SRC, m.elements.filter((e) => e.present).map((e) => e.span!));
eq("positive · every present element analyzed → covered, missing=[]", covAnalyzed.missing, []);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// CLASSIFICATION + FORMAT-AWARE MANIFEST (flag-gated; OFF ⇒ byte-identical)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
const ctxC: AuditToolContext = { fullSource: W9126_SRC, constructionManifest: m };

// N6 — flag OFF ⇒ procurementPart NEVER returns part36; buildManifest falls to the UCF header filter (byte-identical).
delete process.env.AUDIT_FORMAT_PART36;
ok("N6 · flag OFF → procurementPart NOT part36-construction", procurementPart(ctxC) !== "part36-construction");
// N7 — flag OFF ⇒ a non-UCF construction package yields the UCF-empty manifest ⇒ required=[] ⇒ INCOMPLETE (old behavior).
eq("N7 · flag OFF → buildManifest = [] (UCF header filter, non-UCF source) ⇒ INCOMPLETE preserved", buildManifest(ctxC), []);

process.env.AUDIT_FORMAT_PART36 = "true";
eq("flag ON → procurementPart = part36-construction", procurementPart(ctxC), "part36-construction");
eq("flag ON → buildManifest = construction required set (>0)", buildManifest(ctxC).sort(), ["bonding", "scope", "set_aside", "submission", "wage_determination"]);
eq("flag ON → coreMissingFor part36 = [] (all core present, solicitation-type)", coreMissingFor(ctxC, { requiresLM: true }), []);
eq("flag ON + non-solicitation (requiresLM=false) → free pass []", coreMissingFor(ctxC, { requiresLM: false }), []);

// N5 — a misclassified NON-construction blob marked isConstruction=true but with ZERO present elements → required=[]
//      ⇒ required.length>0 guard fails ⇒ INCOMPLETE, never a false BID (the guard is intact).
const emptyManifest: ConstructionManifest = { isConstruction: true, elements: CONSTRUCTION_CORE.concat(["scope", "set_aside"]).map((k) => ({ key: k as any, present: false, sourceDoc: null, anchor: null, span: null, regionHash: null })), docHashes: [], docAttestations: [] };
const ctxEmpty: AuditToolContext = { fullSource: "random non-construction text with no binding elements", constructionManifest: emptyManifest };
eq("N5 · isConstruction but zero present elements → buildManifest=[] ⇒ INCOMPLETE (guard intact)", buildManifest(ctxEmpty), []);
eq("N5 · zero-present coreMissing = all core absent (honest-fail)", coreMissingFor(ctxEmpty, { requiresLM: true }).sort(), ["bonding", "submission", "wage_determination"]);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// completenessOf part36 path (the gate)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
const mkFinding = (excerpt: string, kind: TypedFinding["kind"], ctrl: TypedFinding["controllability"]): TypedFinding =>
  ({ requirement: excerpt.slice(0, 30), citation: "§SF-1442", excerpt, kind, controllability: ctrl, grounded: true, lens: "judgment" });
const groundedFindings = m.elements.filter((e) => e.present).map((e) => mkFinding(e.span!, "other", "bidder_controls"));
const compAll = completenessOf(ctxC, buildManifest(ctxC), groundedFindings, new Set(buildManifest(ctxC)));
eq("gate · all elements grounded → missing=[] (coverageComplete satisfiable)", compAll.missing, []);
const compNone = completenessOf(ctxC, buildManifest(ctxC), [], new Set(buildManifest(ctxC)));
ok("gate · no findings → missing non-empty ⇒ INCOMPLETE", compNone.missing.length > 0);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// STEP 5 — narrowed detectConstructionOutOfScope (regression BOTH sides, Brain ruling 1)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// W9126-shape MUST NOT trip (has resolvable offer structure) → decided path.
eq("Step5 · W9126-shape (SF-1442 + bonding) → NOT out of scope (null)", detectConstructionOutOfScope({ naicsCode: "236220", fullText: W9126_SRC }), null);
// N10 — a drawings-only CSI design-build (≥3 CSI divisions, NO offer structure) MUST trip → OUT_OF_SCOPE.
const CSI_DESIGN_BUILD = [
  "SECTION 03 30 00 CAST-IN-PLACE CONCRETE",
  "SECTION 04 20 00 UNIT MASONRY",
  "SECTION 09 91 00 PAINTING",
  "Design-build drawings and specifications for the new facility. Davis-Bacon wage rates apply.",
].join("\n");
ok("N10 · CSI design-build, no offer structure → OUT_OF_SCOPE fires", detectConstructionOutOfScope({ naicsCode: "236220", fullText: CSI_DESIGN_BUILD })?.outOfScope === true);
// N1 — a services SOW with a stray drawing cut-line "SECTION A-A" and NAICS 541 must NOT classify construction.
const SERVICES_SOW = [
  "STATEMENT OF WORK — IT help desk services.",
  "See detail SECTION A-A of the rack diagram.",
  "The contractor shall provide tier-1 support.",
].join("\n");
const mServices = sweepConstructionManifest([{ name: "sow", text: SERVICES_SOW }], "541519");
ok("N1 · services SOW (no SF-1442, NAICS-54) → isConstruction=false", !mServices.isConstruction);
eq("N1 · services SOW → NOT out of scope", detectConstructionOutOfScope({ naicsCode: "541519", fullText: SERVICES_SOW }), null);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// STEP 4 — amendment supersession fail-safe (Brain ruling 2)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
eq("Step4 · no amendments → resolved (false)", amendmentSupersessionUnresolved(W9126_SRC), false);
ok("Step4 · single amendment, fully incorporated → resolved (proceeds)", amendmentSupersessionUnresolved("Amendment No. 0001 — see SF-30. The due date is extended.") === false);
// N9 — two conflicting amendments to the same clause with no resolution → unresolved ⇒ INCOMPLETE.
ok("N9 · two distinct amendments → unresolved supersession (INCOMPLETE)", amendmentSupersessionUnresolved("Amendment No. 0001 ... Amendment No. 0002 revises clause 52.228-1.") === true);
ok("N9 · explicit supersession language on an amended buy → unresolved", amendmentSupersessionUnresolved("Amendment 0001: Section C is deleted in its entirety and replaced.") === true);
// NEW#1 (Rule-69 re-review) — a MODIFICATION-only revising doc (no SF-30/"amendment" token) must still trip the
// fail-safe (detectAmendments alone would miss it → decide over superseded terms = catastrophic false-COMPLETE).
ok("NEW#1 · Modification-only revising doc → unresolved (gate/counter asymmetry closed)", amendmentSupersessionUnresolved("Modification No. 0002: Section C is revised to read as follows.") === true);
ok("NEW#1 · bare single mod, due-date extension only → resolved (proceeds)", amendmentSupersessionUnresolved("Modification No. 0001 extends the offer due date to Friday.") === false);
// NEW#2 (Rule-69 re-review) — an SF-1442 DESIGN-BUILD with NO submission mechanics must fall to OOS; the bare form
// token no longer vetoes (it is the classifier, not proof of biddability).
const SF1442_NO_BID = ["STANDARD FORM 1442 CONSTRUCTION", "SECTION 03 30 00 CONCRETE", "SECTION 04 20 00 MASONRY", "SECTION 09 91 00 PAINTING", "Design drawings only."].join("\n");
ok("NEW#2 · SF-1442 design-build, no bid schedule, CSI≥3 → OUT_OF_SCOPE (form token no longer vetoes)", detectConstructionOutOfScope({ naicsCode: "236220", fullText: SF1442_NO_BID })?.outOfScope === true);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ADVERSARIAL-REVIEW HARDENING (Rule 69, card 288) — the holes the hostile panel caught, now permanent regressions
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// HARD-1 — FORMAT AUTHORITY is PRIMARY-scoped (card 265 / feedback_ingest_no_format_authority): a stray "SF 1442"
//          reference in an ATTACHMENT must NOT flip a UCF/services buy to construction.
const strayDocs = [
  { name: "primary solicitation", text: "SECTION L INSTRUCTIONS. SECTION M EVALUATION. This is a UCF services RFP." },
  { name: "reference-attachment", text: "Unlike construction (which uses the SF 1442 form), this buy uses the UCF." },
];
ok("HARD-1 · stray SF-1442 in an ATTACHMENT does NOT flip a services buy (NAICS 541)", !sweepConstructionManifest(strayDocs, "541611").isConstruction);
ok("HARD-1 · SF-1442 header in the PRIMARY does classify construction", sweepConstructionManifest([{ name: "primary", text: "STANDARD FORM 1442 CONSTRUCTION" }], null).isConstruction);

// HARD-2 — the `submission` CORE is NOT a tautology of the SF-1442 classification token: an SF-1442 package with NO
//          real submission mechanics (no bid schedule / offers-due) → submission ABSENT → coreMissing ⇒ INCOMPLETE.
const noSubmitDocs = [{ name: "primary", text: "STANDARD FORM 1442 CONSTRUCTION. 52.228-1 bid guarantee. Davis-Bacon wage rates apply. Scope of work: repair." }];
const mNoSubmit = sweepConstructionManifest(noSubmitDocs, "236220");
ok("HARD-2 · SF-1442 present but no submission mechanics → submission ABSENT (not a tautology)", !mNoSubmit.elements.find((e) => e.key === "submission")?.present);
eq("HARD-2 · missing submission surfaces in construction core ⇒ INCOMPLETE", constructionCoreMissing(mNoSubmit), ["submission"]);

// HARD-3 — the `wage_determination` detector does NOT match SCA SERVICE wage determinations (a different, in-scope
//          case): a services buy citing an SCA "wage determination WD 2015-4567" must NOT read a construction wage.
const scaDocs = [{ name: "primary", text: "Service Contract Act applies. Wage Determination No. 2015-4567 (WD 15-4567) governs service employees." }];
ok("HARD-3 · SCA service wage determination does NOT satisfy construction wage_determination", !sweepConstructionManifest(scaDocs, "561720").elements.find((e) => e.key === "wage_determination")?.present);
ok("HARD-3 · Davis-Bacon construction wage DOES satisfy it", !!sweepConstructionManifest([{ name: "primary", text: "Davis-Bacon Act wage rates (52.222-6) apply." }], "236220").elements.find((e) => e.key === "wage_determination")?.present);

// HARD-4 — COMPRESSION-BOUNDARY: coverage keys on the compression-STABLE ANCHOR, not a 220-char verbatim window. A
//          finding whose excerpt is DIGEST-phrased (not a verbatim full-text window) but carries the anchor → analyzed.
const bondingAnchor = m.elements.find((e) => e.key === "bonding")!.anchor!;
const digestPhrasedFinding = `[extract] bidder must furnish ${bondingAnchor} per the clause list`; // NOT the sealed span
const covAnchor = constructionCoverage(m, W9126_SRC, [digestPhrasedFinding]);
ok("HARD-4 · digest-phrased finding carrying the anchor → bonding analyzed (survives compression boundary)", covAnchor.covered.includes("bonding"));

// HARD-5 — the `analyzed` test does NOT false-certify on coincidental overlap: a finding with NO anchor token, even if
//          it shares generic words with the span, must NOT mark the element covered (card-274 regression closed).
const covNoAnchor = constructionCoverage(m, W9126_SRC, ["the offeror shall submit its proposal by the stated date"]);
ok("HARD-5 · finding lacking the anchor token → bonding NOT covered (no coincidental false-COMPLETE)", !covNoAnchor.covered.includes("bonding"));

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// CARD 289 — per-doc ATTESTATION (card-285 Fix-2 generalized). Sealed full-text sweep records hasText + obligation count.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
const attDocs = [
  { name: "primary solicitation", text: PRIMARY },
  { name: "Attachment — drawings.pdf", text: "General notes. Grid lines and elevations. Sheet A-101. Details and dimensions only." }, // READ, obligation-FREE
];
const mAtt = sweepConstructionManifest(attDocs, "236220");
const drawAtt = mAtt.docAttestations.find((a) => a.name === "Attachment — drawings.pdf")!;
ok("289 · sealed attestation records hasText + obligation count", drawAtt.hasText === true && drawAtt.groundableObligations === 0 && !!drawAtt.fullTextHash);
ok("289 · a doc WITH obligations is NOT attested obligation-free", sweepConstructionManifest([{ name: "p", text: PRIMARY }, { name: "spec.pdf", text: "The contractor shall furnish all materials and must comply with the spec." }], "236220").docAttestations.find((a) => a.name === "spec.pdf")!.groundableObligations > 0);
// Rule-69 card-289 hole #1 (CATASTROPHIC) — CSI specs are IMPERATIVE mood; an imperative spec with NO shall/must must
// still count obligations (else attested obligation-free → zero analysis → false-BID). OBLIGATION_RE is a superset.
ok("289 · IMPERATIVE-mood spec (no shall/must) still counts obligations (CSI regression)", sweepConstructionManifest([{ name: "p", text: PRIMARY }, { name: "spec.pdf", text: "Furnish and install cast-in-place concrete. Provide formwork and shoring. Submit shop drawings for approval." }], "236220").docAttestations.find((a) => a.name === "spec.pdf")!.groundableObligations > 0);
// Rule-69 card-289 hole #2 (HIGH) — a failed-extraction marker must read hasText=false (never attestable), via hasEngineText.
ok("289 · [PDF_EXTRACTION_FAILED marker → hasText=false (never attestable)", sweepConstructionManifest([{ name: "p", text: PRIMARY }, { name: "x.pdf", text: "[PDF_EXTRACTION_FAILED: pdftotext returned nothing readable]" }], "236220").docAttestations.find((a) => a.name === "x.pdf")!.hasText === false);
// W9126 root fix — an ANNOTATION-HEAVY drawings doc (trips hasEngineText's garbled heuristic) but carrying real
// obligation verbs is READ, not unread: hasText=true (obl proves readable content), still needs its obligations grounded.
const drawGarble = "12 34 56 A-101 B/C 3'-6\" GRID Ø25 EL.+14.5 shall furnish and install per detail. 90° R2 TYP.";
ok("W9126 · annotation-heavy drawings WITH obligations → hasText=true (read, not unread)", sweepConstructionManifest([{ name: "p", text: PRIMARY }, { name: "dwg.pdf", text: drawGarble }], "236220").docAttestations.find((a) => a.name === "dwg.pdf")!.hasText === true);
// UNREAD / no-text attachment → hasText=false → HARD LINE (never attestable).
ok("289 · no-text (scanned) attachment → hasText=false (HARD LINE: never attestable)", sweepConstructionManifest([{ name: "p", text: PRIMARY }, { name: "scan.pdf", text: "[img]" }], "236220").docAttestations.find((a) => a.name === "scan.pdf")!.hasText === false);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR INTEGRATION — the seed (judgment-first rail) path reaches a DECIDED verdict on W9126-shape (criterion 5)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
const noExpertModel: CallModel = async () => ({ toolCalls: [], findings: [] });
(async () => {
  process.env.AUDIT_FORMAT_PART36 = "true";
  // A decided-shape seed: bonding + wage + submission + scope cautions (bidder_controls) + a set-aside eligibility bar.
  const seed: TypedFinding[] = [
    mkFinding(m.elements.find((e) => e.key === "bonding")!.span!, "submission", "bidder_controls"),
    mkFinding(m.elements.find((e) => e.key === "wage_determination")!.span!, "clause_flowdown", "bidder_controls"),
    mkFinding(m.elements.find((e) => e.key === "submission")!.span!, "submission", "bidder_controls"),
    mkFinding(m.elements.find((e) => e.key === "scope")!.span!, "technical_spec", "bidder_controls"),
    mkFinding(m.elements.find((e) => e.key === "set_aside")!.span!, "eligibility_bar", "already_satisfied"),
  ];
  const decided = await runAgenticAudit({ ctx: ctxC, experts: [], callModel: noExpertModel, seedFindings: seed, noticeType: "Solicitation", naics: "236220", setAside: "HUBZone Set-Aside" });
  ok(`integration · W9126-shape reaches a DECIDED verdict (criterion 5) — got ${decided.decision.verdict}`, decided.decision.verdict !== "INCOMPLETE" && decided.decision.verdict !== "NEEDS_HUMAN_REVIEW");

  // NEGATIVE — drop the bonding CORE element (unreadable) → construction core missing → INCOMPLETE honest-fail.
  const ctxNoBond: AuditToolContext = { fullSource: W9126_SRC.replace(/52\.228-1 Bid Guarantee[^\n]*/g, "").replace(/Performance bond and payment bond[^\n]*/g, ""), constructionManifest: sweepConstructionManifest([{ name: "primary solicitation", text: PRIMARY.replace(/52\.228-1 Bid Guarantee[^\n]*/g, "").replace(/Performance bond and payment bond[^\n]*/g, "") }, { name: "wage-det-attachment", text: ATTACH }], "236220") };
  const incomplete = await runAgenticAudit({ ctx: ctxNoBond, experts: [], callModel: noExpertModel, seedFindings: seed.filter((f) => !/bid guarantee|performance bond/i.test(f.excerpt)), noticeType: "Solicitation", naics: "236220" });
  ok(`integration · bonding core absent → INCOMPLETE honest-fail — got ${incomplete.decision.verdict}`, incomplete.decision.verdict === "INCOMPLETE");

  // CARD 289 attestation, BOTH SIDES (Brain regression requirement):
  const P2 = [PRIMARY, "Davis-Bacon wage determination WD 24-0012 applies.", "STATEMENT OF WORK: repair the roof of Building 100."].join("\n"); // all 5 elements inline in primary
  const DRAW = "General notes. Grid lines A-101. Elevations and dimensions only. Sheet index."; // READ, obligation-FREE
  const SRC2 = `==== DOCUMENT: primary ====\n\n${P2}\n\n==== DOCUMENT: drawings.pdf ====\n\n${DRAW}`;
  const m2 = sweepConstructionManifest([{ name: "primary", text: P2 }, { name: "drawings.pdf", text: DRAW }], "236220");
  const ctx2: AuditToolContext = { fullSource: SRC2, constructionManifest: m2 };
  const seed2 = m2.elements.filter((e) => e.present).map((e) => mkFinding(e.span!, "other", "bidder_controls"));
  // SIDE 1 — obligation-free drawings attachment READ (no finding needed) → ATTESTED → package DECIDES.
  const attested = await runAgenticAudit({ ctx: ctx2, experts: [], callModel: noExpertModel, seedFindings: seed2, noticeType: "Solicitation", naics: "236220" });
  ok(`289 · obligation-free READ attachment attested (no finding) → DECIDES — got ${attested.decision.verdict}`, attested.decision.verdict !== "INCOMPLETE" && attested.decision.verdict !== "NEEDS_HUMAN_REVIEW");
  // SIDE 2 — UNREAD / no-text attachment (HARD LINE) → NEVER attested → INCOMPLETE, even with all elements grounded.
  const SRC3 = `==== DOCUMENT: primary ====\n\n${P2}\n\n==== DOCUMENT: drawings.pdf ====\n\n[img]`;
  const m3 = sweepConstructionManifest([{ name: "primary", text: P2 }, { name: "drawings.pdf", text: "[img]" }], "236220");
  const ctx3: AuditToolContext = { fullSource: SRC3, constructionManifest: m3 };
  const unread = await runAgenticAudit({ ctx: ctx3, experts: [], callModel: noExpertModel, seedFindings: seed2, noticeType: "Solicitation", naics: "236220" });
  ok(`289 · UNREAD (no-text) attachment → INCOMPLETE (HARD LINE) — got ${unread.decision.verdict}`, unread.decision.verdict === "INCOMPLETE");

  console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();
