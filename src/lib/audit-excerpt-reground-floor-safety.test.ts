// ARC #747 · E1 — WIDENING A QUOTE MUST NOT RETIRE A FLOOR.
// Run: npx tsx src/lib/audit-excerpt-reground-floor-safety.test.ts
//
// The blocking finding from the adversarial seat. `noticeBodyEligibilityUngrounded` decides whether an
// eligibility bar was ANALYZED by asking which findings' excerpt spans overlap it. Head re-grounding widens
// an excerpt backward across the extractor's line wraps — so a finding about the questions deadline, once
// widened, could overlap a Top Secret facility-clearance bar sitting on the line above and mark it covered.
// The floor stops firing. The bar never reaches the customer.
//
// It is not a shape problem — a legitimate prose wrap is the feature — so no refusal rule can close it. The
// fix separates the two questions an excerpt answers: what the reader SEES (widened) and what the analysis
// EXAMINED (original). Attribution reads the second, via `analyzedExcerptOf`.
export {};
import { repairHeadClippedExcerpts, analyzedExcerptOf } from "./audit-excerpt-repair";
import { noticeBodyEligibilityUngrounded } from "./audit-orchestrator";
import type { TypedFinding } from "./audit-findings";

let failures = 0;
const check = (name: string, ok: boolean, extra?: string) => {
  console.log(`${ok ? "✅" : "❌"} ${name}${!ok && extra ? `\n     ${extra}` : ""}`);
  if (!ok) failures++;
};

// The seat's repro: extractor-wrapped prose, no terminator at the line ends, an eligibility bar directly
// above the passage the finding actually quotes.
const NOTICE =
  "Offerors must possess a Top Secret facility clearance at time of proposal\n" +
  "submission questions shall be submitted in writing no later than five\n" +
  "business days prior to the closing date and time\n";

const mk = (excerpt: string): TypedFinding => ({
  id: "f-deadline", lens: "proposal_manager", kind: "requirement", severity: "P2",
  citation: "Notice body", requirement: "Questions are due five business days before closing",
  excerpt, grounded: true, disposition: "informational", controllability: "controllable",
} as unknown as TypedFinding);

const CLIPPED = "questions shall be submitted in writing no later than five business days prior to the closing date and time";

// Baseline — before any repair the bar is ungrounded and the floor fires. If this is false the test proves
// nothing afterwards, so it is asserted rather than assumed.
{
  const f = mk(CLIPPED);
  check("baseline · the clearance bar is ungrounded and the floor fires",
    noticeBodyEligibilityUngrounded(NOTICE, [f], NOTICE) === true);
}

// THE ATTACK — repair widens the excerpt across the wrap, and the widened span covers the bar.
{
  const f = mk(CLIPPED);
  process.env.AUDIT_EXCERPT_HEAD_REGROUND = "true";
  const res = repairHeadClippedExcerpts([f], NOTICE);
  delete process.env.AUDIT_EXCERPT_HEAD_REGROUND;

  check("attack · the repair does widen this excerpt (else the test is inert)", res.repaired === 1,
    `repaired=${res.repaired} excerpt=${f.excerpt.slice(0, 60)}`);
  check("attack · and the widened span really does reach the clearance bar",
    /Top Secret facility clearance/.test(f.excerpt), `got: ${f.excerpt.slice(0, 90)}`);
  check("FLOOR HOLDS · the bar is still ungrounded and still fires",
    noticeBodyEligibilityUngrounded(NOTICE, [f], NOTICE) === true,
    "a quote widened for readability silenced an eligibility floor");
  check("attack · the analysed span is the model's original, not the widened one",
    analyzedExcerptOf(f) === CLIPPED, `got: ${analyzedExcerptOf(f).slice(0, 60)}`);
  check("attack · the customer still sees the widened, verbatim quote", NOTICE.includes(f.excerpt.trim()));
}

// A finding that GENUINELY analysed the bar must still cover it — the fix must not break the floor's
// negative case, or it would fire on everything and mean nothing.
{
  const f = mk("Offerors must possess a Top Secret facility clearance at time of proposal submission");
  check("negative · a finding that really quotes the bar still covers it",
    noticeBodyEligibilityUngrounded(NOTICE, [f], NOTICE) === false);
}

// Idempotence of the record: a second pass must not overwrite the true original with the widened span.
{
  const f = mk(CLIPPED);
  process.env.AUDIT_EXCERPT_HEAD_REGROUND = "true";
  repairHeadClippedExcerpts([f], NOTICE);
  repairHeadClippedExcerpts([f], NOTICE);
  delete process.env.AUDIT_EXCERPT_HEAD_REGROUND;
  check("record · the pre-reground span survives a second pass", analyzedExcerptOf(f) === CLIPPED);
}

// Flag OFF: nothing is stamped, and attribution is byte-identical to before this change.
{
  const f = mk(CLIPPED);
  delete process.env.AUDIT_EXCERPT_HEAD_REGROUND;
  repairHeadClippedExcerpts([f], NOTICE);
  check("flag OFF · no pre-reground field is written", f.excerptPreReground === undefined);
  check("flag OFF · analyzedExcerptOf falls through to the excerpt itself", analyzedExcerptOf(f) === CLIPPED);
}

console.log(failures === 0 ? "\nPASS — widening a quote cannot retire a floor\n" : `\nFAIL — ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);
