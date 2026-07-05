// Layer-4 (front-door notice-body parity) — $0 deterministic test with LOAD-BEARING NEGATIVES.
//   npx tsx scripts/audit-ai/test-layer4-frontdoor-parity.ts   ($0 — no model call, no network)
//
// Proves the door reads the SAME notice body the audit ingests (L1) and, crucially, that reading it
// deterministically is NOT authority to declare a narrative §L/§M "absent" — that is the cardinal-sin
// false-alarm the three-state design fights, and the notice-body-blind class (80NSSC). The door does
// NOT run the agentic L3 finder; narrative sections it cannot confirm stay "unverified" (the MAP/L3
// confirms), and only a content read with NO notice body in play may report "absent" (upload path,
// unchanged — no regression).
import {
  detectBodySections,
  sectionStateFor,
  NOTICE_BODY_MIN_CHARS,
  NOTICE_BODY_MAIN_CHARS,
} from "@/lib/resolve-coverage";

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}\n      got ${g}\n      want ${w}`); }
};
const ok = (name: string, cond: boolean) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

// ── A combined synopsis/solicitation body with EXPLICIT UCF section headers (multi-line). ──
const BODY_UCF_HEADERS =
  "This is a combined synopsis/solicitation for commercial items prepared in accordance with FAR Subpart 12.6.\n" +
  "SECTION C - STATEMENT OF WORK\nThe contractor shall furnish maintenance services as specified herein.\n" +
  "SECTION L - INSTRUCTIONS TO OFFERORS\nOfferors shall submit a technical and price quote by the response date.\n" +
  "SECTION M - EVALUATION FACTORS FOR AWARD\nAward will be made on a lowest-price technically-acceptable basis.";

// ── The SAME substance but WHITESPACE-COLLAPSED to one line (what resolveSamDescription returns). ──
const BODY_COLLAPSED_CLAUSES =
  "This is a combined synopsis/solicitation for commercial items. The provision at 52.212-1 Instructions to " +
  "Offerors—Commercial Products applies to this acquisition. Quotes are evaluated per 52.212-2 Evaluation—" +
  "Commercial Products; the basis for award is lowest price technically acceptable. Clauses at 52.212-4 and " +
  "52.212-5 apply. A Statement of Work for the required supplies is provided above.";

// ── A NARRATIVE body: §M substance in PROSE with NO heading and NO clause number. Must NOT detect §M. ──
const BODY_NARRATIVE_NO_HEADING =
  "The Government intends to award to the responsible quoter whose quote represents the best value. Quoters " +
  "should describe their approach and pricing. The agency will consider the technical merit and total price " +
  "of each quote when deciding the award, weighing capability against cost in the final determination.";

async function main() {
  console.log("── detectBodySections: EXPLICIT UCF headers detected (structural, reliable) ──");
  const h = detectBodySections(BODY_UCF_HEADERS);
  ok("§C detected from 'SECTION C - STATEMENT OF WORK'", h.C);
  ok("§L detected from 'SECTION L - INSTRUCTIONS TO OFFERORS'", h.L);
  ok("§M detected from 'SECTION M - EVALUATION FACTORS FOR AWARD'", h.M);

  console.log("── detectBodySections: COLLAPSED one-line body — FAR clause markers still light up §L/§M/§I ──");
  const c = detectBodySections(BODY_COLLAPSED_CLAUSES);
  ok("§L detected from '52.212-1 Instructions to Offerors' in a collapsed line", c.L);
  ok("§M detected from '52.212-2 Evaluation' in a collapsed line", c.M);
  ok("§I detected from '52.212-4/-5' clauses in a collapsed line", c.I);

  console.log("── LOAD-BEARING NEGATIVE: narrative §M with NO heading/clause is NOT falsely detected ──");
  const n = detectBodySections(BODY_NARRATIVE_NO_HEADING);
  ok("prose 'basis for award / best value' does NOT credit §M (no line-anchored heading)", !n.M);
  ok("prose does NOT credit §L", !n.L);

  console.log("── sectionStateFor: the CARDINAL-SIN guard — never 'absent' when a notice body is in play ──");
  // A narrative §M the door could not detect, but a notice body EXISTS ⇒ the audit's L3 will mine it.
  eq("undetected §M + body in play → UNVERIFIED (never absent)", sectionStateFor(false, "content", true), "unverified");
  eq("detected §M → PRESENT", sectionStateFor(true, "content", true), "present");
  // The door read a real government body → that is a content read, but absence stays unverifiable.
  eq("undetected §L + body in play (even on content basis) → UNVERIFIED", sectionStateFor(false, "content", true), "unverified");

  console.log("── NO REGRESSION: content read with NO notice body (upload/attachment path) still resolves 'absent' ──");
  eq("undetected §M + content read + NO body → ABSENT (upload path, unchanged)", sectionStateFor(false, "content", false), "absent");
  eq("undetected §M + name_only + NO body → UNVERIFIED (never read it)", sectionStateFor(false, "name_only", false), "unverified");

  console.log("── thresholds: detect floor < MAIN floor (a one-line synopsis stub must not flip MAIN) ──");
  ok("NOTICE_BODY_MIN_CHARS < NOTICE_BODY_MAIN_CHARS", NOTICE_BODY_MIN_CHARS < NOTICE_BODY_MAIN_CHARS);

  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAIL"} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main();
