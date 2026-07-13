// GAUNTLET for the table-aware OCR confirmation (Card #477 ruling 1b / arc-B, flag AUDIT_OCR_TABLE_CONFIRM).
// Run: npx tsx src/lib/ocr-table-gate.gauntlet.test.ts
//
// Adversarial rate-table fixtures modeled on the real FA8137 Wage Determination (General Decision OK20260049):
//   • peripheral 0→@ garble in the decision number + modification dates (the caught misreads that hard-fail the base gate)
//   • a plausible-but-wrong rate cell (format-valid transposition) that vision must catch
// Two invariants: (1) UNDER_ABSTAIN reduction — the base gate abstains the WHOLE doc on any caught misread (0 rows usable);
// arc-B trusts the vision-confirmed rate rows (>0). (2) WRONG_VERDICT = 0 — no trusted row ever carries a rate that differs
// from ground truth; a wrong OCR rate is abstained, never trusted.
import { gateRateTable, detectRateTable, type TableVisionConfirmer } from "./ocr-table-gate";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

// GROUND TRUTH — the correct wage rate per classification (from OK20260049).
const TRUTH: Record<string, string> = {
  "BRICKLAYER": "26.92",
  "MILLWRIGHT": "32.75",
  "CARPENTER (Form Work Only)": "27.79",
  "ELECTRICIAN": "41.40",
  "ELEVATOR MECHANIC": "53.40",
  "PLUMBER": "41.60",
};

// The real WD OCR read: CORRECT rates, but PERIPHERAL garble (decision number / dates 0→@). No rate cell is wrong here.
const OCR_WD = `
"General Decision Number: OK2@260049 01/23/2026
Superseded General Decision Number: OK20250049
State: Oklahoma  Construction Type: Building
Modification Number Publication Date
1 Q@1/23/2026
BRICKLAYER..................... $ 26.92 13.09
MILLWRIGHT..................... $ 32.75 11.91
CARPENTER (Form Work Only)..... $ 27.79 10.85
ELECTRICIAN.................... $ 41.40 17.25
ELEVATOR MECHANIC.............. $ 53.40 39.52
PLUMBER........................ $ 41.60 21.00
`;

// Adversarial: one rate cell is a FORMAT-VALID misread — PLUMBER read as 47.60 (truth 41.60), a digit transposition.
const OCR_WRONG_RATE = OCR_WD.replace("PLUMBER........................ $ 41.60", "PLUMBER........................ $ 47.60");

// A confirmer that reads the TRUE rate for each classification (vision is accurate).
const visionTruth: TableVisionConfirmer = async (rows) => rows.map((r) => ({ classification: r.classification, visionRate: TRUTH[r.classification] ?? null }));
// A confirmer that cannot read two rows (returns null).
const visionPartialNull: TableVisionConfirmer = async (rows) => rows.map((r, i) => ({ classification: r.classification, visionRate: i < 2 ? null : (TRUTH[r.classification] ?? null) }));

async function main() {
  console.log("── detect the rate table ──");
  const scan = detectRateTable(OCR_WD);
  assert(scan.isRateTable, "OCR_WD detected as a rate table");
  assert(scan.rows.length === 6, `6 rate rows parsed (got ${scan.rows.length})`);
  assert(scan.rows.some((r) => r.classification === "BRICKLAYER" && r.rate === "26.92"), "BRICKLAYER 26.92 parsed");
  assert(!scan.rows.some((r) => /General Decision|Modification/i.test(r.classification)), "peripheral garble lines (decision number, dates) are NOT rate rows");

  console.log("\n── the WD case: peripheral garble, correct rates, vision confirms → rate rows TRUSTED (UNDER_ABSTAIN reduced) ──");
  const wd = await gateRateTable(OCR_WD, { docName: "Wage Determination 5-8-26.pdf", visionConfirm: visionTruth });
  assert(wd.verdict === "trusted_all", `verdict trusted_all (got ${wd.verdict})`);
  assert(wd.metrics.trusted === 6, `all 6 rate rows trusted (got ${wd.metrics.trusted}) — base gate would abstain ALL (0) on the caught misreads`);
  assert(wd.metrics.trusted > 0, "UNDER_ABSTAIN reduction: >0 rows now usable vs 0 under the whole-doc hard-fail");
  assert(/BRICKLAYER.*26\.92/.test(wd.trustedText) && /ELECTRICIAN.*41\.40/.test(wd.trustedText), "trustedText carries the confirmed rate rows for analysis");
  assert(wd.metrics.wrongTrusted === 0, "WRONG_VERDICT = 0 on the clean-rate table");

  console.log("\n── adversarial: a plausible-but-wrong rate (PLUMBER 47.60 vs truth 41.60) → ABSTAINED, never trusted ──");
  const bad = await gateRateTable(OCR_WRONG_RATE, { docName: "WD", visionConfirm: visionTruth });
  const plumberTrusted = bad.trustedRows.find((r) => r.classification === "PLUMBER");
  assert(!plumberTrusted, "the wrong PLUMBER rate is NOT in trustedRows");
  assert(bad.abstained.some((a) => a.row.classification === "PLUMBER" && a.reason === "vision_disagreed"), "wrong PLUMBER rate abstained as vision_disagreed");
  assert(bad.verdict === "trusted_partial", `verdict trusted_partial — other 5 rows still trusted (got ${bad.verdict})`);
  assert(bad.metrics.trusted === 5 && bad.metrics.wrongTrusted === 0, "5 correct rows trusted, WRONG_VERDICT=0 (the wrong rate never entered analysis)");
  // Hard invariant: EVERY trusted row across this fixture matches ground truth.
  const anyWrong = bad.trustedRows.some((r) => TRUTH[r.classification] !== r.rate);
  assert(!anyWrong, "INVARIANT — every trusted row's rate == ground truth (no wrong rate trusted)");

  console.log("\n── vision cannot read a row (null) → that row abstained ──");
  const pn = await gateRateTable(OCR_WD, { docName: "WD", visionConfirm: visionPartialNull });
  assert(pn.metrics.trusted === 4 && pn.abstained.filter((a) => a.reason === "vision_null").length === 2, "2 unreadable rows abstained (vision_null), 4 trusted");
  assert(pn.metrics.wrongTrusted === 0, "WRONG_VERDICT=0 with partial-null vision");

  console.log("\n── not a rate table (prose w/ a stray $) → not_a_table (unchanged behavior) ──");
  const prose = await gateRateTable("The bid guarantee is a minimum of 20% and the fee is $ 26.92 per the clause.", { docName: "sol", visionConfirm: visionTruth });
  assert(prose.verdict === "not_a_table" && prose.trustedRows.length === 0, "prose is not treated as a rate table");

  console.log("\n── GLOBAL WRONG_VERDICT invariant across all fixtures ──");
  const allTrusted = [...wd.trustedRows, ...bad.trustedRows, ...pn.trustedRows];
  const globalWrong = allTrusted.filter((r) => TRUTH[r.classification] !== r.rate);
  assert(globalWrong.length === 0, `WRONG_VERDICT=0 globally — 0/${allTrusted.length} trusted rows carry a wrong rate`);

  console.log(`\n${failures === 0 ? "✅ ALL PASS" : "❌ " + failures + " FAIL"} — arc-B table-gate Gauntlet`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
