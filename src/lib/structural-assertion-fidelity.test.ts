// PHASE 3 UNIT 4 — STRUCTURAL-ASSERTION FIDELITY GATE ($0 suite, Brain #551 Unit-3/Unit-4 boundary, flag
// AUDIT_STRUCTURAL_ASSERTION_FIDELITY). Driver: the seq-2 dccce793 commercial SF1449 RFQ ingested source has ONLY
// Sections G/L/M, yet 8 findings cite "Section I …", 5 cite "Section B …", 1 cites "Section C …" — grounded excerpts
// decorated with an INVENTED UCF location. Fix (mirror Unit 3 design C): NON-DESTRUCTIVE + VERDICT-INERT — append an
// honest structural-provenance correction and mark it, KEEPING kind/controllability/severity/excerpt. Fail-toward-keep.
// Run: npx tsx src/lib/structural-assertion-fidelity.test.ts
import { applyStructuralAssertionFidelity, detectSetAsideConflict } from "./audit-decide";
import type { TypedFinding } from "./audit-findings";
import { readFileSync } from "fs";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };
const withFlag = <T>(on: boolean, fn: () => T): T => {
  const prev = process.env.AUDIT_STRUCTURAL_ASSERTION_FIDELITY;
  if (on) process.env.AUDIT_STRUCTURAL_ASSERTION_FIDELITY = "true"; else delete process.env.AUDIT_STRUCTURAL_ASSERTION_FIDELITY;
  try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_STRUCTURAL_ASSERTION_FIDELITY; else process.env.AUDIT_STRUCTURAL_ASSERTION_FIDELITY = prev; }
};
const base = (o: Partial<TypedFinding>): TypedFinding => ({
  requirement: "x", citation: "x", excerpt: "x", kind: "other", controllability: "bidder_controls", grounded: true, lens: "test", ...o,
});
const isCorrected = (f: TypedFinding) => f.structuralAssertionCorrected === true && /structural-assertion correction/.test(f.citation) && /not present in the ingested solicitation/.test(f.citation);
// A faithful slice: the seq-2 source only ever names Sections G, L, M (as page references in the Q&A). No B/C/I.
// COMMERCIAL/simplified RFQ (SF1449 + request for quote) — mirrors the live seq-2 doc class, so the R5 document-class
// gate is ACTIVE. On this class the UCF Sections A–M do not exist, so a "Section B/C/I" clause-location is fabricated.
const SRC = [
  "Standard Form 1449 — Solicitation/Contract/Order for Commercial Products and Commercial Services. Request for Quote (RFQ).",
  "Please refer to attachment, Section L on page 20 and Section M on page 21 for the requirements of the solicitation.",
  "Section G - Contract Administration Data",
  "This acquisition will be made as a 100% woman owned small business set-aside.",
  "The period of service is one base year and four option years.",
].join("\n");

console.log("── present-section detection (positive-shape) ──");
withFlag(true, () => {
  // A finding that cites ONLY a present section (M) is left byte-identical.
  const present = [base({ citation: "Section M – Evaluation Criteria, Item 1 (Price)", requirement: "LPTA award basis." })];
  const out = applyStructuralAssertionFidelity(present, SRC, { enabled: true });
  assert(out === present && out[0] === present[0], "cites present Section M only → byte-identical (nothing fabricated)");
});

console.log("\n── DIRECTION 1 — fabricated Section I (the live #49-#56 shape) ⇒ CORRECTED, obligation KEPT ──");
withFlag(true, () => {
  const f = base({ citation: "Section I, 5352.242-9001(a)", requirement: "Contractors shall ensure CACs are obtained by all contract personnel.", kind: "submission", controllability: "bidder_controls", severity: "P2", excerpt: "contractors shall ensure Common Access Cards (CACs) are obtained" });
  const out = applyStructuralAssertionFidelity([f], SRC, { enabled: true });
  assert(isCorrected(out[0]), "Section I absent from source → structural-assertion correction appended + marked");
  assert(/Section I is not present/.test(out[0].citation), "names the fabricated section (I)");
  assert(/sections found: G, L, M/.test(out[0].citation), "states the true present-section set (G, L, M)");
  assert(out[0].kind === "submission" && out[0].controllability === "bidder_controls" && out[0].severity === "P2", "VERDICT-INERT: kind/controllability/severity UNTOUCHED");
  assert(out[0].excerpt === f.excerpt && out[0].requirement === f.requirement, "obligation (excerpt + requirement) KEPT intact");
  assert(/5352\.242-9001\(a\)/.test(out[0].citation), "APPEND not replace: original citation text preserved (downstream provenance keys intact)");
});

console.log("\n── DIRECTION 2 — fabricated Section B/C also corrected ──");
withFlag(true, () => {
  const fb = base({ citation: "Section B, Continuation of SF1449, CLIN 0001", requirement: "Pricing schedule." });
  const fc = base({ citation: "Section C – Description/Specifications/Statement of Work", requirement: "SOW conformance." });
  const out = applyStructuralAssertionFidelity([fb, fc], SRC, { enabled: true });
  assert(isCorrected(out[0]) && /Section B is not present/.test(out[0].citation), "Section B (absent) corrected");
  assert(isCorrected(out[1]) && /Section C is not present/.test(out[1].citation), "Section C (absent) corrected");
});

console.log("\n── DIRECTION 3 — a finding citing a PRESENT section (L or M) is never touched ──");
withFlag(true, () => {
  const inp = [
    base({ citation: "Section L – Instructions to Offerors", requirement: "WOSB set-aside." }),
    base({ citation: "Section G - Contract Administration Data", requirement: "Payment admin." }),
  ];
  const out = applyStructuralAssertionFidelity(inp, SRC, { enabled: true });
  assert(out === inp, "all-present-section findings → byte-identical array (touched=false short-circuit)");
});

console.log("\n── DIRECTION 4 — MIXED cite (present M + absent I) ⇒ corrected, names ONLY the fabricated one ──");
withFlag(true, () => {
  const f = base({ citation: "Section M – Evaluation Criteria; cross-ref Section I clause list", requirement: "LPTA + clauses." });
  const out = applyStructuralAssertionFidelity([f], SRC, { enabled: true });
  assert(isCorrected(out[0]), "mixed cite with an absent section → corrected");
  assert(/Section I is not present/.test(out[0].citation) && !/Section M is not present/.test(out[0].citation), "names ONLY the fabricated Section I, not the present Section M");
});

console.log("\n── FAIL-TOWARD-KEEP — flag OFF ⇒ byte-identical ──");
{
  const f = base({ citation: "Section I, 5352.242-9001(a)", requirement: "x" });
  const out = applyStructuralAssertionFidelity([f], SRC, { enabled: false });
  assert(out[0] === f && out[0].structuralAssertionCorrected === undefined, "flag OFF: no correction, byte-identical (Rule 61)");
}

console.log("\n── FAIL-TOWARD-KEEP — source with NO detectable sections ⇒ byte-identical (cannot prove UCF-sectioned) ──");
withFlag(true, () => {
  const noSecSrc = "A commercial quote request with no UCF section headings at all. LPTA, WOSB set-aside, five pages.";
  const f = base({ citation: "Section I, some clause", requirement: "x" });
  const inp = [f];
  const out = applyStructuralAssertionFidelity(inp, noSecSrc, { enabled: true });
  assert(out === inp && out[0] === f && out[0].structuralAssertionCorrected === undefined, "empty present-set → fail-toward-keep (a detection failure must not strip every citation)");
});

console.log("\n── NO OVER-FIRE — 'Section 508', clause numbers, and 'section is' do not false-match ──");
withFlag(true, () => {
  const f1 = base({ citation: "Section 508 accessibility conformance per 36 CFR 1194", requirement: "508 compliance." });
  const f2 = base({ citation: "FAR 52.212-4(section is incorporated)", requirement: "commercial terms." });
  const inp = [f1, f2];
  const out = applyStructuralAssertionFidelity(inp, SRC, { enabled: true });
  assert(out === inp && out[0] === f1 && out[1] === f2, "digit-section (508) and 'section is' are not UCF-section letters → byte-identical");
});

// ── LIVE-RECORD REPLAY — the REAL seq-2 dccce793 record (falls back to a NOTE if the cache is absent) ──
console.log("\n── LIVE-RECORD REPLAY — /tmp/runrec-8d137350.json (real 74 findings) ──");
withFlag(true, () => {
  let rec: any;
  try { rec = JSON.parse(readFileSync("/tmp/runrec-8d137350.json", "utf8")); } catch { console.log("⚠︎ SKIP: /tmp/runrec-8d137350.json absent — re-pull with scripts/audit-ai/_pull-8d137350-rec.ts to replay live"); return; }
  const full: string = rec.input.fullSource;
  const findings: TypedFinding[] = rec.result.inputs.findings;
  const out = applyStructuralAssertionFidelity(findings, full, { enabled: true });
  const corrected = out.filter((f) => f.structuralAssertionCorrected);
  const citedAbsent = findings.filter((f) => /\bsection\s+[BCI]\b/i.test(f.citation)).length;
  console.log(`   present sections in source: ${[...new Set([...full.matchAll(/\bsection\s+([A-M])\b/gi)].map((m) => m[1].toUpperCase()))].sort().join(", ")}`);
  console.log(`   findings citing absent Section B/C/I: ${citedAbsent} · corrected by gate: ${corrected.length}`);
  assert(corrected.length === citedAbsent && corrected.length >= 10, `every fabricated-section finding corrected (${corrected.length}), none missed`);
  // index-aligned (the gate maps in place) — verdict-driving fields must be byte-identical to the input.
  assert(out.every((f, i) => f.severity === findings[i].severity && f.kind === findings[i].kind && f.controllability === findings[i].controllability && f.excerpt === findings[i].excerpt), "live replay: severity/kind/controllability/excerpt UNCHANGED for every finding (verdict-inert)");
  // A finding citing a present section (Section M) in the live record is untouched.
  const untouched = out.filter((f) => !f.structuralAssertionCorrected);
  assert(untouched.every((f) => !/\bsection\s+[BCI]\b/i.test(f.citation)), "no fabricated-section finding left uncorrected");
});

// ── CROSS-GATE NON-CONTAMINATION (Unit 3 R2 lesson) — the citation APPEND must not perturb detectSetAsideConflict,
//    which runs AFTER this gate and reads finding citations. The correction text carries NO set-aside vocabulary
//    (no 52.219-x, no "incorporated by reference", no "set aside for"/"100%"), so a by-reference finding stays
//    by-reference and the conflict result is byte-identical before vs after correction. ──
console.log("\n── CROSS-GATE NON-CONTAMINATION — detectSetAsideConflict identical before/after correction ──");
withFlag(true, () => {
  // A by-reference 52.219-6 finding fabricating "Section I" — the exact card #534 leak shape.
  const byref = base({
    citation: "Section I – FAR Clauses Incorporated by Reference: 52.219-6 Notice of Total Small Business Set-Aside",
    requirement: "FAR 52.219-6 incorporated by reference.",
    excerpt: "52.219-6 Notice of Total Small Business Set-Aside (incorporated by reference)",
    kind: "clause_flowdown", controllability: "bidder_controls",
  });
  const before = detectSetAsideConflict("WOSB", [byref], SRC);
  const corrected = applyStructuralAssertionFidelity([byref], SRC, { enabled: true });
  const after = detectSetAsideConflict("WOSB", corrected, SRC);
  assert(corrected[0].structuralAssertionCorrected === true, "by-ref finding with fabricated Section I was corrected");
  assert(JSON.stringify(before) === JSON.stringify(after), "detectSetAsideConflict result BYTE-IDENTICAL before vs after correction (no cross-gate contamination — append carries no set-aside vocab)");
});

// ── R1 REMEDIATION (Gauntlet round 1, P0 over-fire) — a REAL section the SOURCE abbreviates/wraps must NOT let a
//    true grounded citation be defamed. Source-side present-set is WIDE; citation-side stays STRICT. Each probe:
//    source references section I in a variant form → a finding citing "Section I" must be LEFT INTACT (I is present). ──
console.log("\n── R1 P0 CLOSED — abbreviated / spaced / page-wrapped / § source headings mark the section PRESENT ──");
withFlag(true, () => {
  const variants: Array<[string, string]> = [
    ["abbrev 'Sec.'", "Section L Instructions. Section M Evaluation. Sec. I Contract Clauses: 52.204-7 SAM registration."],
    ["abbrev 'Sec'",  "Section G admin. Sec I clauses: 52.204-7. Section M evaluation."],
    ["hyphen page-wrap", "Section L page 20. Section M page 21. Section-\nI Contract Clauses 52.204-7."],
    ["plain line-wrap", "Section G. Section L. Section\nI Contract Clauses 52.204-7. Section M."],
    ["§ glyph", "Section L. Section M. § I Contract Clauses 52.204-7."],
    ["NBSP separator", "Section L. Section M. Section I Contract Clauses 52.204-7."],
    ["UCF 'PART I' heading", "PART I - THE SCHEDULE ... Section B Supplies ... PART II - Section I Contract Clauses 52.204-7."],
    ["letter-spaced OCR 'S E C T I O N I'", "S E C T I O N   I   CONTRACT CLAUSES 52.204-7  Section L Instructions"],
    // R2 forms (Gauntlet round 2, P0):
    ["Windows CRLF page-wrap 'Section\\r\\nI'", "SECTION L. SECTION M. SECTION\r\nI - CONTRACT CLAUSES 52.204-7"],
    ["blank-line wrap 'Section\\n\\nI'", "Section L. Section M. Section\n\nI Contract Clauses 52.204-7"],
    ["ARTICLE heading", "Section L. Section M. ARTICLE I - CONTRACT CLAUSES 52.204-7"],
    ["'Sect.' abbreviation", "Sect L. Sect M. Sect. I - Contract Clauses 52.204-7"],
    ["parenthesized 'Section(I)'", "The clauses (Section I) are incorporated. Section M. 52.204-7"],
    ["OCR comma 'Section, I'", "Sect L. Sect M. Section, I - Contract Clauses. 52.204-7 SAM."],
    ["TOC table-row 'I  Contract Clauses'", "Section L. Section M.\nSection:\tSubject\nI\tContract Clauses 52.204-7"],
    // R3 forms (Gauntlet round 3, P0) — bare ALL-CAPS / single-word / letter-dot UCF headers (no 'Section' token):
    ["ALL-CAPS bare header 'I   CONTRACT CLAUSES'", "SECTION L - INSTRUCTIONS\nSECTION M - EVALUATION\nI   CONTRACT CLAUSES\n52.204-7 SAM"],
    ["single-word 'I  Clauses'", "Section L. Section M.\nI  Clauses per FAR 52.204-7"],
    ["letter-dot 'I. Contract Clauses'", "Section L. Section M.\nI. Contract Clauses\n52.204-7"],
  ];
  for (const [label, src] of variants) {
    const f = base({ citation: "Section I, 52.204-7", requirement: "SAM registration required.", excerpt: "52.204-7 SAM registration", severity: "P2" });
    const out = applyStructuralAssertionFidelity([f], src, { enabled: true });
    assert(out[0] === f && out[0].structuralAssertionCorrected === undefined, `${label}: Section I present in source variant → true grounded citation NOT defamed (over-fire closed)`);
  }
  // ALL-CAPS bare Section B header (cite Section B) — its own canonical UCF title matches.
  const bSrc = "SECTION L. SECTION M.\nB   SUPPLIES OR SERVICES AND PRICES\nCLIN 0001 pricing";
  const fb = base({ citation: "Section B, CLIN 0001", requirement: "pricing schedule." });
  const outB = applyStructuralAssertionFidelity([fb], bSrc, { enabled: true });
  assert(outB[0] === fb && outB[0].structuralAssertionCorrected === undefined, "ALL-CAPS bare header 'B  SUPPLIES OR SERVICES AND PRICES' → Section B present → not defamed");
});

console.log("\n── R1 regression — the WIDE source parser must NOT spuriously mark B/C/I present (gate keeps working) ──");
withFlag(true, () => {
  // 'second', 'Section 5.2 item M', prose with no real B/C/I → a genuine 'Section B' fabrication still fires.
  const noisy = "RFQ / SF1449 commercial. The second quarter. Section G admin. Section L page 20. Section M – Evaluation Criteria, item 5.2. Please reference Section L.";
  const f = base({ citation: "Section B, CLIN 0001 pricing schedule", requirement: "pricing." });
  const out = applyStructuralAssertionFidelity([f], noisy, { enabled: true });
  assert(isCorrected(out[0]) && /Section B is not present/.test(out[0].citation), "noise ('second', 'item 5.2') does NOT mark B present → genuine Section B fabrication still corrected");
});

// ── R4 remediation (Gauntlet round 4) — PARAPHRASED / DECORATED bare UCF headers must mark the section present
//    (P0 over-fire closed by widened titles + header-shape gate), and a broad title keyword buried in a PROSE SENTENCE
//    must NOT (P1 prose-poison closed by the short-line header-shape gate). ──
console.log("\n── R4 P0 CLOSED — paraphrased + decorated bare UCF headers mark the section PRESENT (no defamation) ──");
withFlag(true, () => {
  const paraphrase: Array<[string, string, string]> = [
    ["M 'BASIS FOR AWARD'", "Section L. Section M-neighbor.\nM   BASIS FOR AWARD\nLPTA applies", "Section M, LPTA basis"],
    ["L 'INSTRUCTIONS TO QUOTERS'", "Section G admin.\nL   INSTRUCTIONS TO QUOTERS\nsubmit by email", "Section L instructions"],
    ["C 'SCOPE OF WORK'", "Section L. Section M.\nC   SCOPE OF WORK\nchapel music", "Section C, scope"],
    ["F bare 'DELIVERY'", "Section L. Section M.\nF   DELIVERY\nperiod of performance one year", "Section F delivery"],
    ["J bare 'ATTACHMENTS'", "Section L. Section M.\nJ   ATTACHMENTS\nAttachment 1 SOW", "Section J, attachment 1"],
    ["page-number-prefixed '21  I  CONTRACT CLAUSES'", "SECTION L. SECTION M.\n21  I  CONTRACT CLAUSES\n52.204-7", "Section I, 52.204-7"],
    ["bullet '* I CONTRACT CLAUSES'", "SECTION L. SECTION M.\n* I CONTRACT CLAUSES\n52.204-7", "Section I, 52.204-7"],
    ["next-line title 'I\\nCONTRACT CLAUSES'", "SECTION L. SECTION M.\nI\nCONTRACT CLAUSES\n52.204-7", "Section I, 52.204-7"],
    ["long ALL-CAPS K banner (>55 chars)", "SECTION L. SECTION M.\nK   REPRESENTATIONS, CERTIFICATIONS, AND OTHER STATEMENTS OF OFFERORS\n52.212-3", "Section K, 52.212-3"],
  ];
  for (const [label, src, cite] of paraphrase) {
    const f = base({ citation: cite, requirement: "req", excerpt: "grounded", severity: "P2" });
    const out = applyStructuralAssertionFidelity([f], src, { enabled: true });
    assert(out[0] === f && out[0].structuralAssertionCorrected === undefined, `${label}: real bare header => section present => true citation NOT defamed`);
  }
});

console.log("\n── R4 P1 CLOSED — a broad title keyword inside a PROSE SENTENCE does NOT mark the section present ──");
withFlag(true, () => {
  const modLine = "I  Clauses incorporated by reference remain unchanged by this modification.";
  const src = "Request for Quote (RFQ) — SF1449 commercial.\n" + modLine + "\nSection L Instructions. Section M Evaluation.";
  const f = base({ citation: "Section I, 5352.242-9001", requirement: "CAC", excerpt: "CAC obtained" });
  const out = applyStructuralAssertionFidelity([f], src, { enabled: true });
  assert(isCorrected(out[0]) && /Section I is not present/.test(out[0].citation), "SF30 mod prose 'I Clauses incorporated...' is a long sentence => NOT a header => Section I fabrication STILL corrected (P1 gate-defeat closed)");
});

// ── R2 ReDoS guard (Gauntlet round 2, P1) — the WIDE source parser must be LINEAR, not quadratic. A long separator
//    run after a heading token with no terminating [A-M] (a flattened-form/OCR ingest) must not backtrack. ──
console.log("\n── R2 P1 CLOSED — WIDE parser is linear on a pathological separator run (no ReDoS) ──");
withFlag(true, () => {
  const evil = "Section" + " .:_-".repeat(20000);                                 // 100k separators, no [A-M] → old double-star was O(L^2)
  const f = base({ citation: "Section B, CLIN 0001", requirement: "x" });
  const t0 = Date.now();
  applyStructuralAssertionFidelity([f], evil + "\nSection L Instructions", { enabled: true });
  const ms = Date.now() - t0;
  assert(ms < 200, `100k-separator source parsed in ${ms}ms (<200ms) — single linear separator run, ReDoS closed`);
});

// ── R2 SANCTIONED RESIDUAL (P2, safe under-fire direction) — 'part'/'§' are KEPT in the present-set (dropping them to
//    stop prose-poisoning would RE-OPEN the cardinal over-fire on UCF-'PART I'/§-headed docs). So a bare "Part I"/"§ C"
//    in incidental prose marks that letter present ⇒ a genuine fabrication of THAT section rides through UNCORRECTED.
//    This is the doctrinally-correct trade (never defame a real citation > catch every fabrication). Documented, not a bug. ──
console.log("\n── R2 sanctioned residual — 'Part I' prose marks I present ⇒ a Section I fabrication is (safely) missed ──");
withFlag(true, () => {
  const prose = "Section L Instructions. Section M Evaluation. Complete Part I of the pricing worksheet.";
  const f = base({ citation: "Section I clause list", requirement: "x" });
  const out = applyStructuralAssertionFidelity([f], prose, { enabled: true });
  assert(out[0] === f && out[0].structuralAssertionCorrected === undefined, "SANCTIONED: 'Part I' prose ⇒ I present ⇒ under-fire (safe direction); no defamation, verdict-inert");
});

// ── R5 DOCUMENT-CLASS PIVOT — the gate fires ONLY on a positively commercial/simplified RFQ (no UCF A–M structure);
//    it SUPPRESSES on a UCF/negotiated doc (A–M are real → defaming them is structurally impossible) and on any
//    non-commercial doc. This closes the entire R1–R5 header-parsing over-fire/prose-poison treadmill at its root. ──
console.log("\n── R5 P0 KILLER — a UCF/negotiated doc (SF33 / 'uniform contract format') is SUPPRESSED (real A–M never defamed) ──");
withFlag(true, () => {
  const ucfSrc = "SOLICITATION, OFFER AND AWARD (Standard Form 33). This solicitation follows the Uniform Contract Format.\nSECTION L - INSTRUCTIONS\nSECTION M - EVALUATION\nI   CONTRACT CLAUSES\n52.204-7 SAM";
  const f = base({ citation: "Section I, 52.204-7", requirement: "SAM", excerpt: "52.204-7" });
  const out = applyStructuralAssertionFidelity([f], ucfSrc, { enabled: true });
  assert(out[0] === f && out[0].structuralAssertionCorrected === undefined, "UCF doc (SF33/UCF marker) ⇒ gate suppressed ⇒ Section I citation NOT defamed (P0 impossible by construction)");
});

console.log("\n── R5 F1 — a UCF-ish doc with PARAPHRASED bare headers (no commercial marker) is SUPPRESSED (not defamed) ──");
withFlag(true, () => {
  // The exact R5-F1 P0 shapes (DELIVERABLES / QUALITY ASSURANCE / PERFORMANCE WORK STATEMENT) — no commercial marker ⇒ suppressed.
  const src = "A - COVER SHEET\nB - SUPPLIES\nC   PERFORMANCE WORK STATEMENT\nD   DELIVERABLES\nE   QUALITY ASSURANCE\nSECTION L. SECTION M.";
  const f = base({ citation: "Section C, PWS para C.2", requirement: "PWS", excerpt: "C.2 grounded" });
  const out = applyStructuralAssertionFidelity([f], src, { enabled: true });
  assert(out[0] === f && out[0].structuralAssertionCorrected === undefined, "paraphrased bare UCF headers on a non-commercial doc ⇒ suppressed ⇒ real Section C citation NOT defamed (R5-F1 P0 closed)");
});

console.log("\n── R5 F2 — on a COMMERCIAL doc, prose 'I. Clauses apply as written.' does NOT mark I present (bare-header detector removed) ──");
withFlag(true, () => {
  const src = "Request for Quote (RFQ) — SF1449 commercial products.\nI. Clauses apply as written.\nSection L Instructions. Section M Evaluation.";
  const f = base({ citation: "Section I, 5352.242-9001", requirement: "CAC", excerpt: "CAC obtained" });
  const out = applyStructuralAssertionFidelity([f], src, { enabled: true });
  assert(isCorrected(out[0]) && /Section I is not present/.test(out[0].citation), "commercial doc + short prose 'I. Clauses…' ⇒ I NOT marked present ⇒ Section I fabrication STILL corrected (R5-F2 driver-defeat closed)");
});

console.log("\n── R5 — a non-commercial, non-UCF doc is SUPPRESSED (fail-toward-keep) ──");
withFlag(true, () => {
  const src = "Interagency agreement. Section L instructions. Section M evaluation. Task order under an existing IDIQ.";
  const f = base({ citation: "Section I, some clause", requirement: "x" });
  const inp = [f];
  const out = applyStructuralAssertionFidelity(inp, src, { enabled: true });
  assert(out === inp && out[0] === f, "not positively commercial + no UCF marker ⇒ suppressed byte-identical (fail-toward-keep)");
});

console.log("\n── R6 — full-spelled UCF banners + Oxford comma + structural A/B signal are recognized ⇒ suppressed ──");
withFlag(true, () => {
  const cases: Array<[string, string]> = [
    ["full 'STANDARD FORM 1442' (construction UCF) + FAR 12 cross-ref", "STANDARD FORM 1442 — SOLICITATION, OFFER, AND AWARD (Construction). Contains a FAR 12 commercial supply CLIN. Request for quotations. I  CONTRACT CLAUSES 52.204-7"],
    ["Oxford-comma 'SOLICITATION, OFFER, AND AWARD' (SF33) + RFQ boilerplate", "SOLICITATION, OFFER, AND AWARD. RFQ responses accepted. C   PERFORMANCE WORK STATEMENT 52.204-7"],
    ["SF-1447 negotiated + commercial cross-ref", "STANDARD FORM 1447. Commercial services referenced. Request for Quote. B   SUPPLIES 52.204-7"],
    ["structural: inline Section A + Section B present (banner-less UCF RFP) + RFQ", "Request for Quote. Section A Cover. Section B Supplies. Section C SOW. Section I Contract Clauses referenced elsewhere."],
  ];
  for (const [label, src] of cases) {
    const f = base({ citation: "Section I, 52.204-7", requirement: "SAM", excerpt: "52.204-7" });
    const out = applyStructuralAssertionFidelity([f], src, { enabled: true });
    assert(out[0] === f && out[0].structuralAssertionCorrected === undefined, `${label}: recognized as UCF ⇒ suppressed ⇒ Section I citation NOT defamed (R6 P0 closed)`);
  }
});

console.log("\n── R7 — dotted-SF / FAR-15 / negotiated / 'Sections A–M' / ≥2 early sections ⇒ recognized UCF ⇒ suppressed ──");
withFlag(true, () => {
  const cases: Array<[string, string]> = [
    ["dotted 'S.F. 33'", "S.F. 33 solicitation. Request for quotations accepted. I  CONTRACT CLAUSES 52.204-7"],
    ["FAR Part 15 negotiated RFP", "REQUEST FOR PROPOSAL under FAR Part 15. RFQ questions by email. SECTION L. SECTION M. I CONTRACT CLAUSES 52.204-7"],
    ["'negotiated procurement'", "This negotiated procurement is conducted under FAR 15. Commercial items may be included. I CONTRACT CLAUSES 52.204-7"],
    ["'Sections A through M'", "This solicitation uses Sections A through M. RFQ. I CONTRACT CLAUSES 52.204-7"],
    ["≥2 early sections inline (banner-less UCF)", "Request for Quote. Section C Statement of Work. Section D Deliverables. Section I clauses referenced."],
  ];
  for (const [label, src] of cases) {
    const f = base({ citation: "Section I, 52.204-7", requirement: "SAM", excerpt: "52.204-7" });
    const out = applyStructuralAssertionFidelity([f], src, { enabled: true });
    assert(out[0] === f && out[0].structuralAssertionCorrected === undefined, `${label}: recognized UCF/negotiated ⇒ suppressed ⇒ Section I NOT defamed (R7 P0 closed)`);
  }
});

console.log("\n── R7 — bare 'commercial services' in FAR-15 scope prose is NOT a commercial trigger (no ambiguous over-fire) ──");
withFlag(true, () => {
  const src = "Task order RFP under an existing IDIQ. The contractor shall provide commercial services in support of the mission. SECTION L. SECTION M. H SPECIAL CONTRACT REQUIREMENTS 52.217-9";
  const f = base({ citation: "Section H, 52.217-9", requirement: "option", excerpt: "52.217-9" });
  const out = applyStructuralAssertionFidelity([f], src, { enabled: true });
  assert(out[0] === f && out[0].structuralAssertionCorrected === undefined, "bare 'commercial services' scope prose ⇒ not commercial-classified ⇒ suppressed (ambiguous over-fire avoided)");
});

console.log("\n── R8 — genuine sealed-bid IFB (FAR 14 tells) ⇒ UCF ⇒ suppressed; SF1449 IFB/RFP checkbox boilerplate does NOT suppress ──");
withFlag(true, () => {
  // A genuine sealed-bid IFB carries the real tells → suppressed (real A–M never defamed).
  const ifb = "INVITATION FOR BIDS — Sealed Bid Acquisition under FAR Part 14. Bids will be publicly opened. Commercial items CLIN. SECTION L. SECTION M. B SUPPLIES 52.211-10";
  const f1 = base({ citation: "Section B, 52.211-10", requirement: "bid schedule", excerpt: "52.211-10" });
  assert(applyStructuralAssertionFidelity([f1], ifb, { enabled: true })[0].structuralAssertionCorrected === undefined, "genuine sealed-bid IFB (FAR 14 / publicly opened) ⇒ UCF ⇒ suppressed (R8 P0 closed)");
  // CRITICAL: the commercial SF1449 form prints all three type checkboxes; those labels must NOT trigger UCF suppression.
  const sf1449 = "STANDARD FORM 1449. TYPE OF SOLICITATION: [x] REQUEST FOR QUOTE (RFQ) [ ] INVITATION FOR BID (IFB) [ ] REQUEST FOR PROPOSAL (RFP). Commercial products and commercial services. Section L. Section M.";
  const f2 = base({ citation: "Section I, 52.204-7", requirement: "SAM", excerpt: "52.204-7" });
  assert(applyStructuralAssertionFidelity([f2], sf1449, { enabled: true })[0].structuralAssertionCorrected === true, "SF1449 with '(IFB)'/'(RFP)' checkbox boilerplate STILL fires (the labels are form options, not a UCF signal — the mistake that would have suppressed the live gate)");
});

console.log("\n── R5 — a doc carrying BOTH commercial and UCF markers ⇒ UCF wins ⇒ suppressed ──");
withFlag(true, () => {
  const src = "Request for Quote (RFQ). NOTE: this order also references the Uniform Contract Format. Section L. Section M.";
  const f = base({ citation: "Section I, x", requirement: "x" });
  const inp = [f];
  const out = applyStructuralAssertionFidelity(inp, src, { enabled: true });
  assert(out === inp && out[0] === f, "UCF marker present ⇒ suppressed even with a commercial marker (never defame a possibly-real UCF section)");
});

console.log(`\n${failures === 0 ? "✅ UNIT-4 SUITE PASS" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
