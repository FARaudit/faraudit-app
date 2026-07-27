// ARC #747 · E1 — HEAD-SIDE RE-GROUNDING.
// Run: npx tsx src/lib/audit-excerpt-head-reground.test.ts
//
// Every SOURCE string below is verbatim from the stored `raw_pdf_text` of audit
// d0664ba2-bd51-4ce9-888a-bbcf6ff4499a (SPRRA2-26-R-0034) — the record gate 4 graded — and every clipped
// EXCERPT is the excerpt that record actually shipped. This suite is a reproduction, not an invention: the
// three positives are C1, S2 and S7 from `ceo/PANEL-d0664ba2-GATE4.md`, and the negatives are the four other
// excerpts from the same record that have preceding text on their line and must NOT be touched.
export {};
import { isHeadClippedExcerpt, findHeadRepairSpan, repairHeadClippedExcerpts } from "./audit-excerpt-repair";
import type { TypedFinding } from "./audit-findings";

let failures = 0;
const check = (name: string, ok: boolean, extra?: string) => {
  console.log(`${ok ? "✅" : "❌"} ${name}${!ok && extra ? `\n     ${extra}` : ""}`);
  if (!ok) failures++;
};

// ── REAL SOURCE LINES ────────────────────────────────────────────────────────────────────────────────
const SRC_C1 =
  "Cost/Price Supporting Documentation: Offerors shall submit cost or pricing data if applicable. Submission shall be in accordance with FAR 15.408, Table 15-2, Instructions for Submitting Cost/Price Proposals When Certified Cost or Pricing Data Are Required.\n";
const SRC_S7 =
  "Interested parties are requested to notify the Contracting Officer of their intent to respond to this RFP in writing within five (5) business days. It is requested that a negative response be accompanied by an explanation. Responses shall be submitted via email.\n";
// The FY table, VERBATIM line shape from raw_pdf_text L411–424. The first cut of this suite flattened it to
// one long line and then "proved" the repair restored the FY26 columns — a fixture the author invented, and
// a check that passed because of the invention. On the real record the extractor emits one COLUMN FRAGMENT
// per line (4–8 chars), the logical cell is FY-first, and the newline lands inside a cell. The adversarial
// seat caught it. [[feedback_battery_certifies_author_imagination]]
const SRC_S2 =
  "Amendment 0003_SPRRA2-26-R-0034_US IDIQ limited Spares Procurement.xls\n" +
  "=== SHEET: RTX C3+ INC2 Spares US ===\n" +
  "FY26\nMin FY26\nBEQ FY27\nMin FY27\nBEQ FY28\nMin FY28\nBEQ FY29\nMin FY29\nBEQ FY30\nMin FY30\n" +
  "BEQ Patriot Hardware Patriot Hardware ECP Description US PN Raytheon Comments\n" +
  "50 To be determined by RTX based on price breaks 50 To be determined by RTX\n";

// §L B.2.f, VERBATIM from L183–186 — a running sentence the extractor WRAPPED. The citation the finding
// needs sits on the line above the anchor, so a same-physical-line rule recovers only "Charges," — a
// dangling fragment, worse than the excerpt it replaced.
const SRC_WRAP =
  "-- 2 of 5 --\n\n" +
  "f. In accordance with FAR clause 52.215-22, Limitation on Pass-Through\n" +
  "Charges, if Raytheon intends to subcontract more than 70 percent of the total\n" +
  "cost of work to be performed under the resulting add-on, Raytheon shall provide notice.\n";
const SRC_BENIGN_SENTENCE =
  "Your response is requested as soon as possible. If you choose to submit a proposal, it shall be submitted before January 30, 2026.\n";
const SRC_BENIGN_ENUM =
  "1. ORDERING PERIODS UPDATE: THE ORDERING PERIODS FOR THE ADI TPX-57A(V)1 ARE HEREBY EXTENDED.\n";
const SRC_BENIGN_ENUM4 =
  "4. If the proposal exceeds the TINA threshold, it must be certified to the Contracting Officer.\n";

// ── THE THREE GATE-4 DEFECTS — must detect AND restore the dropped head ──────────────────────────────
const C1_CLIPPED = "15-2, Instructions for Submitting Cost/Price Proposals When Certified Cost or Pricing Data Are Required.";
check("C1 · detects the excerpt that starts inside 'Table 15-2'", isHeadClippedExcerpt(SRC_C1, C1_CLIPPED));
const c1 = findHeadRepairSpan(SRC_C1, C1_CLIPPED) ?? "";
check("C1 · repair restores the dropped CITATION ('FAR 15.408, Table')", /FAR 15\.408, Table 15-2/.test(c1), `got: ${c1}`);
check("C1 · repaired span is verbatim in source", SRC_C1.includes(c1));
check("C1 · repair starts at the clause, not the paragraph", c1.startsWith("Submission shall be in accordance"), `got: ${c1}`);

const S7_CLIPPED = "negative response be accompanied by an explanation. Responses shall be submitted via email.";
check("S7 · detects the excerpt starting one clause late", isHeadClippedExcerpt(SRC_S7, S7_CLIPPED));
const s7 = findHeadRepairSpan(SRC_S7, S7_CLIPPED) ?? "";
check("S7 · repair restores 'It is requested that a'", s7.startsWith("It is requested that a negative response"), `got: ${s7}`);
check("S7 · repaired span is verbatim in source", SRC_S7.includes(s7));

// S2 · TABULAR SOURCE ⇒ REFUSE. The excerpt anchors on the FY27 of the line "Min FY27"; the token before it
// is the qualifier of a DIFFERENT cell. Prepending it would read as "Minimum, FY27" and shift every column
// by one year — verbatim and still wrong. The FY26 columns this excerpt was cropped past cannot be recovered
// by re-grounding a span at all; they need the table reconstructed (E1 item 4).
const S2_CLIPPED = "FY27 BEQ FY28 Min FY28 BEQ FY29 Min FY29 BEQ FY30 Min FY30 BEQ Patriot Hardware";
check("S2 · a table column fragment is NOT treated as a clause", !isHeadClippedExcerpt(SRC_S2, S2_CLIPPED));
check("S2 · and is never repaired (no wrong-column glue)", findHeadRepairSpan(SRC_S2, S2_CLIPPED) === null,
  `got: ${findHeadRepairSpan(SRC_S2, S2_CLIPPED)}`);

// WRAP · the same defect shape as C1, but the citation is on the line ABOVE the anchor.
const WRAP_CLIPPED = "if Raytheon intends to subcontract more than 70 percent of the total cost of work to be performed under the resulting add-on, Raytheon shall provide notice.";
check("wrap · detects an excerpt clipped across an extractor line-wrap", isHeadClippedExcerpt(SRC_WRAP, WRAP_CLIPPED));
const wrap = findHeadRepairSpan(SRC_WRAP, WRAP_CLIPPED) ?? "";
check("wrap · restores the CITATION from the previous line", /52\.215-22, Limitation on Pass-Through/.test(wrap), `got: ${wrap}`);
check("wrap · starts at the clause, not at the 'f.' enumerator label", wrap.startsWith("In accordance with FAR clause"), `got: ${wrap}`);
check("wrap · does not restore the bare fragment 'Charges,'", !/^Charges,/.test(wrap));
check("wrap · repaired span is verbatim in source", SRC_WRAP.includes(wrap));

// ── THE FOUR NEGATIVES FROM THE SAME RECORD — preceding text, but a clean start ──────────────────────
const BENIGN_SENTENCE = "If you choose to submit a proposal, it shall be submitted before January 30, 2026.";
check("negative · prior sentence ended — not clipped", !isHeadClippedExcerpt(SRC_BENIGN_SENTENCE, BENIGN_SENTENCE));
check("negative · and therefore no repair span", findHeadRepairSpan(SRC_BENIGN_SENTENCE, BENIGN_SENTENCE) === null);

const BENIGN_ENUM = "ORDERING PERIODS UPDATE: THE ORDERING PERIODS FOR THE ADI TPX-57A(V)1 ARE HEREBY EXTENDED.";
check("negative · list enumerator '1.' introduces it — not clipped", !isHeadClippedExcerpt(SRC_BENIGN_ENUM, BENIGN_ENUM));

const BENIGN_ENUM4 = "If the proposal exceeds the TINA threshold, it must be certified to the Contracting Officer.";
check("negative · list enumerator '4.' introduces it — not clipped", !isHeadClippedExcerpt(SRC_BENIGN_ENUM4, BENIGN_ENUM4));

const AT_LINE_START = "Cost/Price Supporting Documentation: Offerors shall submit cost or pricing data if applicable.";
check("negative · excerpt starts the line — nothing was dropped", !isHeadClippedExcerpt(SRC_C1, AT_LINE_START));

// ── REFUSALS — the pass must decline rather than guess ───────────────────────────────────────────────
check("refuses · excerpt not verbatim in source", !isHeadClippedExcerpt(SRC_C1, "an authorized distributor at fixed transfer pricing"));
const AMBIG_SRC = "See the note. It is requested that a response be filed.\nAlso: It is requested that a response be filed.\n";
check("refuses · ambiguous excerpt (>1 occurrence) is never relocated",
  findHeadRepairSpan(AMBIG_SRC, "a response be filed.") === null);
check("refuses · too short to anchor", !isHeadClippedExcerpt(SRC_S7, "an explanation."));
check("refuses · empty source", !isHeadClippedExcerpt("", C1_CLIPPED));
const FAR_BACK = `A ${"filler word ".repeat(60)}and then the tail clause follows here plainly.\n`;
check("refuses · backward reach beyond one clause (>400 chars)",
  findHeadRepairSpan(FAR_BACK, "and then the tail clause follows here plainly.") === null);

// YIELD FLOOR — a bare row number or a scrap of punctuation is not evidence; an excerpt left clean beats an
// excerpt with a fragment bolted on. Real §J shape from audit 496a9a21.
const SRC_ATTACH = "Section J Attachment List\n01 ATT10_260007_SOW Statement of Work 08 May 2026\n";
check("floor · a bare attachment number is not restored",
  findHeadRepairSpan(SRC_ATTACH, "ATT10_260007_SOW Statement of Work 08 May 2026") === null);

// LIST ROWS — the failure the wrap rule created before it was tightened. In a §I/§K clause-incorporation
// list the extractor wraps each row, so the TAIL of one row lands on the line above the next row's clause
// number. Structurally identical to a wrapped sentence; prepending it glues one clause's effective date onto
// a different clause. Real shape from audit 496a9a21.
const SRC_CLAUSE_LIST =
  "52.204-13 System for Award Management-Maintenance. (Deviation 2026-O0038)\nFeb 2026\n" +
  "252.204-7012 Safeguarding Covered Defense Information and Cyber Incident Reporting.\nDec 2022\n" +
  "52.240-90 Security Prohibitions and Exclusions Representation.\nSep 2024\n";
check("list · a clause row is not glued to the previous row's date",
  findHeadRepairSpan(SRC_CLAUSE_LIST, "252.204-7012 Safeguarding Covered Defense Information and Cyber Incident Reporting.") === null,
  `got: ${findHeadRepairSpan(SRC_CLAUSE_LIST, "252.204-7012 Safeguarding Covered Defense Information and Cyber Incident Reporting.")}`);
check("list · a bare effective date is not a clause head",
  findHeadRepairSpan(SRC_CLAUSE_LIST, "52.240-90 Security Prohibitions and Exclusions Representation.") === null);

// A paragraph break stops the backward walk — a wrap is a continuation, a blank line is a new thought.
const SRC_PARA = "The Government intends to award without discussions\n\nOfferors shall submit a complete proposal package by the stated time.\n";
check("refuses · never walks backward across a blank line",
  findHeadRepairSpan(SRC_PARA, "shall submit a complete proposal package by the stated time.")?.startsWith("Offerors") !== false);

// A guarded period must not be read as a clause end: the head before the excerpt ends "$1,204.50 per" —
// mid-clause — and the decimal point is not a terminator.
const GUARDED = "The unit price shall not exceed $1,204.50 per each unit delivered under this order.\n";
check("guard · a decimal point is not a clause boundary",
  isHeadClippedExcerpt(GUARDED, "each unit delivered under this order."));

// ── IN-PLACE PASS + FLAG DISCIPLINE ─────────────────────────────────────────────────────────────────
const mk = (excerpt: string, lens: string): TypedFinding => ({
  id: `f-${lens}`, lens, kind: "requirement", severity: "P1", citation: "RFP §B",
  requirement: "…", excerpt, grounded: true, disposition: "informational", controllability: "controllable",
} as unknown as TypedFinding);

delete process.env.AUDIT_EXCERPT_HEAD_REGROUND;
{
  const findings = [mk(C1_CLIPPED, "cost_price")];
  const res = repairHeadClippedExcerpts(findings, SRC_C1);
  check("flag OFF · nothing repaired", res.repaired === 0 && res.changes.length === 0);
  check("flag OFF · excerpt byte-identical", findings[0].excerpt === C1_CLIPPED);
}

process.env.AUDIT_EXCERPT_HEAD_REGROUND = "true";
{
  const findings = [mk(C1_CLIPPED, "cost_price"), mk(BENIGN_SENTENCE, "schedule")];
  const res = repairHeadClippedExcerpts(findings, SRC_C1 + SRC_BENIGN_SENTENCE);
  check("flag ON · repairs the clipped one only", res.repaired === 1, `repaired=${res.repaired}`);
  check("flag ON · clipped finding now carries the citation", /FAR 15\.408, Table/.test(findings[0].excerpt));
  check("flag ON · benign finding untouched", findings[1].excerpt === BENIGN_SENTENCE);
}
{
  // Deterministic producers slice at clause boundaries by construction and stay out of scope, so a
  // pre-existing record cannot shift under this pass.
  const findings = [mk(C1_CLIPPED, "procedural_coverage")];
  const res = repairHeadClippedExcerpts(findings, SRC_C1);
  check("flag ON · deterministic lens excluded", res.repaired === 0 && findings[0].excerpt === C1_CLIPPED);
}
{
  // Idempotence: running the pass twice must not walk the span further backward each time.
  const findings = [mk(C1_CLIPPED, "cost_price")];
  repairHeadClippedExcerpts(findings, SRC_C1);
  const once = findings[0].excerpt;
  const second = repairHeadClippedExcerpts(findings, SRC_C1);
  check("flag ON · idempotent (second pass is a no-op)", second.repaired === 0 && findings[0].excerpt === once);
}
delete process.env.AUDIT_EXCERPT_HEAD_REGROUND;

console.log(failures === 0 ? "\nPASS — head-side re-grounding\n" : `\nFAIL — ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);
