// ARC #747 · E1 — A WIDENING THAT CHANGES CLASSIFICATION IS REFUSED.
// Run: npx tsx src/lib/audit-e1-classifier-invariance.test.ts
//
// Closes `/code-review high` findings #2 and #3 on PR #292, which are the same defect wearing two shapes:
//   #3 a TITLE-CASE heading is crossed by the walk and `isPositiveSetAside` flips false→true;
//   #2 a widened quote absorbs a NEIGHBOURING obligation ("Top Secret facility clearance…") so the excerpt
//      corroborates a requirement it does not belong to.
// No shape rule catches either — the extractor emits no terminator between the clauses, and the branch had
// recorded #3 as a KNOWN GAP precisely because enumerating shapes had already been one short four times.
//
// The guard is semantic instead: if the restored head changes what the span would be CLASSIFIED as, the
// repair is a rewrite and is refused. Refusal is always the safe direction — the customer keeps the excerpt
// the model emitted.
export {};
import { repairHeadClippedExcerpts, findHeadRepairSpan } from "./audit-excerpt-repair";
import { isPositiveSetAside, isInquiryDeadlineBenign, hasOperativeEligibilityLanguage } from "./audit-decide";
import type { TypedFinding } from "./audit-findings";

let failures = 0;
const check = (n: string, ok: boolean, extra?: string) => { console.log(`${ok ? "✅" : "❌"} ${n}${!ok && extra ? `\n     ${extra}` : ""}`); if (!ok) failures++; };

// The SAME signature the orchestrator installs (audit-orchestrator.ts, post-verdict block).
const sig = (f: TypedFinding) => [
  isPositiveSetAside(f), isInquiryDeadlineBenign(f), hasOperativeEligibilityLanguage(f.excerpt ?? ""),
].join("|");
const guard = { rejectIfClassificationMoves: (b: TypedFinding, a: TypedFinding) => sig(b) !== sig(a) };

const mk = (excerpt: string, requirement: string): TypedFinding => ({
  requirement, citation: "Section L", excerpt, kind: "submission_mechanic",
  controllability: "bidder_controls", grounded: true, lens: "proposal_manager", severity: "P2",
} as unknown as TypedFinding);

const DEADLINE_REQ = "Questions must be submitted in writing no later than five business days prior to closing.";
const EX = "business days prior to the closing date and time of this solicitation";

process.env.AUDIT_EXCERPT_HEAD_REGROUND = "true";

// ── #3 · TITLE-CASE HEADING — closed by DEFENCE IN DEPTH, and it matters which layer fires ────────────
// Two independent rules stand between this fixture and the harm, and the tests below name which one acts.
// The first draft of this suite asserted the raw walk still crossed the heading; after the own-obligation
// rule landed it no longer reaches the heading at all, so those assertions were stale expectations of my own
// older code, not evidence of a regression.
{
  const SRC = "Section K - Representations and Certifications, Total Small Business Set-Aside\n" +
    "The Offeror shall submit all questions in writing no later than five\n" + EX + "\n";
  const f = mk(EX, DEADLINE_REQ);
  const res = repairHeadClippedExcerpts([f], SRC, guard);
  check("no widening happens — the walk stops at the intervening obligation line", f.excerpt === EX, f.excerpt);
  check("the heading never reaches the excerpt", !/Section K/.test(f.excerpt ?? ""));
  check("nothing is stamped, so attribution is untouched", f.excerptPreReground === undefined);
  check("repaired count is 0", res.repaired === 0);
}

// ── #3b · THE GUARD ITSELF — a heading the walk DOES reach, so only the classifier check can refuse it ──
{
  // No intervening obligation line: the walk reaches the heading, produces a span, and the ONLY thing that
  // can stop it is the classification comparison.
  const TAIL = "shall be submitted in writing no later than five business days prior to closing";
  const SRC = "Section K - Representations and Certifications, Total Small Business Set-Aside\n" +
    "questions " + TAIL + "\n";
  const EX2 = TAIL;
  const raw = findHeadRepairSpan(SRC, EX2);
  check("the walk DOES reach the heading here (so the guard is the only defence)", !!raw && /Set-Aside/.test(raw), JSON.stringify(raw));
  if (raw) {
    check("…and crossing it WOULD flip isPositiveSetAside",
      isPositiveSetAside(mk(EX2, DEADLINE_REQ)) === false && isPositiveSetAside(mk(raw, DEADLINE_REQ)) === true);
  }
  const f = mk(EX2, DEADLINE_REQ);
  const res = repairHeadClippedExcerpts([f], SRC, guard);
  check("the guard REFUSES it", res.repaired === 0 && f.excerpt === EX2);
  check("and the refusal is recorded, not silent",
    res.skipped.some((s) => /would change how the span classifies/.test(s.reason)), JSON.stringify(res.skipped));

  // WITHOUT the guard the same repair goes through — proving the guard, not something else, is what refused.
  const g = mk(EX2, DEADLINE_REQ);
  repairHeadClippedExcerpts([g], SRC);
  check("without the guard the same widening IS applied (the guard is what acted)", /Set-Aside/.test(g.excerpt ?? ""), g.excerpt);
}

// ── #2 · A NEIGHBOURING OBLIGATION ABSORBED ─────────────────────────────────────────────────────────────
// NOT closed by the classifier guard — I probed every exported audit-decide predicate against both spans and
// NONE moves, because the finding stays a benign submission mechanic either way. The floor holds; the READER
// is what is harmed. So this is refused by the own-obligation line rule instead.
{
  const SRC = "Offerors must possess a Top Secret facility clearance at time of proposal submission\n" +
    "questions shall be submitted in writing no later than five\n" + EX + "\n";
  const f = mk(EX, DEADLINE_REQ);
  repairHeadClippedExcerpts([f], SRC, guard);
  check("a widened quote may not absorb a foreign eligibility bar", !/Top Secret/.test(f.excerpt ?? ""), f.excerpt);
  // The walk DOES still cross the intervening line — "questions shall be submitted in writing no later than
  // five" is the excerpt's own sentence, and restoring it is exactly what E1 is for. The rule stops one line
  // further up, at the clearance bar. An earlier version of this assertion demanded the excerpt be untouched,
  // which would have been the wrong fix: it would have thrown away a correct repair to avoid an incorrect one.
  check("…while the excerpt's OWN sentence continuation is still restored",
    /questions shall be submitted/.test(f.excerpt ?? ""), f.excerpt);
  check("the analyzed span still records what the model emitted", f.excerptPreReground === EX);
}

// ── THE GUARD MUST NOT BLOCK THE REPAIRS E1 EXISTS FOR ──────────────────────────────────────────────────
// The C1 case: a genuine extractor wrap where the restored head is the CITATION, and nothing reclassifies.
{
  const SRC = "Cost/Price Supporting Documentation: Offerors shall submit cost or pricing data if applicable. " +
    "Submission shall be in accordance with FAR 15.408, Table 15-2, Instructions for Submitting Cost/Price " +
    "Proposals When Certified Cost or Pricing Data Are Required.\n";
  const CLIPPED = "15-2, Instructions for Submitting Cost/Price Proposals When Certified Cost or Pricing Data Are Required.";
  const f = mk(CLIPPED, "Proposal must include cost/price supporting documentation.");
  const res = repairHeadClippedExcerpts([f], SRC, guard);
  check("C1 · the real repair still happens under the guard", res.repaired === 1, JSON.stringify(res.skipped));
  check("C1 · and it restores the dropped FAR citation", /FAR 15\.408/.test(f.excerpt ?? ""), f.excerpt);
  check("C1 · the analyzed span is still recorded", f.excerptPreReground === CLIPPED);
}

delete process.env.AUDIT_EXCERPT_HEAD_REGROUND;

console.log(failures === 0 ? "\nPASS — a widening that changes classification is refused\n" : `\nFAIL — ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);
