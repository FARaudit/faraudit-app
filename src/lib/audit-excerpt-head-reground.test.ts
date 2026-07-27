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
const SRC_S2 =
  "Item Description FY26 Min FY26 BEQ FY27 Min FY27 BEQ FY28 Min FY28 BEQ FY29 Min FY29 BEQ FY30 Min FY30 BEQ Patriot ECU 10 50 12 60 14 70 16 80 18 90\n";
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

const S2_CLIPPED = "FY27 Min FY27 BEQ FY28 Min FY28 BEQ FY29 Min FY29 BEQ FY30 Min FY30 BEQ Patriot ECU 10 50 12 60 14 70 16 80 18 90";
check("S2 · detects the table row cropped past its FY26 head columns", isHeadClippedExcerpt(SRC_S2, S2_CLIPPED));
const s2 = findHeadRepairSpan(SRC_S2, S2_CLIPPED) ?? "";
check("S2 · repair restores the FY26 columns the span was derived without", /FY26 Min FY26 BEQ/.test(s2), `got: ${s2}`);
check("S2 · repaired span is verbatim in source", SRC_S2.includes(s2));

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
