// $0 unit proofs for Brain card 221 — AI-lens truncation fix.
// Run: npx tsx src/lib/audit-excerpt-repair.test.ts
//
// Covers: STEP 3 gate FP fix (isTruncatedExcerpt), STEP 2 repair (boundary classes · negative · unrepairable ·
// lens scope · ambiguous-head refusal), STEP 1 retry-on-max_tokens in the live expert call path.
import { isTruncatedExcerpt, findRepairSpan, repairClippedExcerpts } from "./audit-excerpt-repair";
import { makeAnthropicCallModel } from "./audit-expert";
import type { TypedFinding } from "./audit-findings";

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

// ── STEP 3 · gate false-positive fix ────────────────────────────────────────────
// The over-broad `(?:at|to|via)\s+[a-z0-9]+\.$` pattern flagged clean sentences. Colon now required.
check("FP · '…advantageous to Government.' NOT truncated", isTruncatedExcerpt("Award to responsible offeror whose conforming offer is most advantageous to Government.") === false);
check("FP · '…conforming to solicitation.' NOT truncated", isTruncatedExcerpt("Award to lowest-priced technically acceptable or best value offer conforming to solicitation.") === false);
check("FP · '…report to the KO.' NOT truncated", isTruncatedExcerpt("The contractor shall report to the KO.") === false);
// genuine truncations STILL flagged (no loss of recall)
check("TP · address cut 'via email at: michael.' truncated", isTruncatedExcerpt("Quotes must be submitted electronically via email at: michael.") === true);
check("TP · decimal split '($1.' truncated", isTruncatedExcerpt("Quotes must be submitted in whole cents ($1.") === true);
check("TP · dangling 'Proposed for' truncated", isTruncatedExcerpt("Protecting the Government's Interest When Subcontracting With Contractors Debarred, Suspended, Proposed for") === true);
check("TP · dangling '…date specified for' truncated", isTruncatedExcerpt("Delivery shall be made no later than the date specified for") === true);
check("edge · terminated excerpt NOT truncated", isTruncatedExcerpt("Pricing Arrangement: Firm Fixed Price.") === false);

// ── STEP 2 · repair boundary classes ────────────────────────────────────────────
{
  const source = "SECTION M. The Government will award to the responsible offeror whose conforming offer is most advantageous to the Government, price and technical considered equally. Other terms apply.";
  const clipped = "The Government will award to the responsible offeror whose conforming offer is most advantageous to";
  const span = findRepairSpan(source, clipped);
  check("repair · extends clipped span to sentence boundary", span === "The Government will award to the responsible offeror whose conforming offer is most advantageous to the Government, price and technical considered equally.", JSON.stringify(span));
  check("repair · result is verbatim in source", !!span && source.includes(span));
}
{
  // decimal guard: the boundary must NOT stop at "$1.04"
  const source = "SECTION L. Quotes must be submitted in whole cents ($1.04 rounding is not permitted). Submit by email.";
  const clipped = "Quotes must be submitted in whole cents ($1.";
  const span = findRepairSpan(source, clipped);
  check("repair · decimal guard — boundary past '$1.04'", span === "Quotes must be submitted in whole cents ($1.04 rounding is not permitted).", JSON.stringify(span));
}
{
  // list-item boundary: a numbered obligation cut mid-item extends to the item terminator
  const source = "Evaluation factors:\n(1) Price is the most important factor to the Government.\n(2) Technical acceptability is required.";
  const clipped = "Price is the most important factor to";
  const span = findRepairSpan(source, clipped);
  check("repair · extends to list-item sentence end", span === "Price is the most important factor to the Government.", JSON.stringify(span));
}

// ── STEP 2 · negatives / safety ─────────────────────────────────────────────────
{
  // a clean (terminated) finding is never a candidate → untouched (byte-stable)
  const findings: TypedFinding[] = [
    { requirement: "FFP", citation: "§B", excerpt: "Pricing Arrangement: Firm Fixed Price.", kind: "pricing", controllability: "bidder_controls", grounded: true, lens: "pricing_analyst", id: "pricing_analyst#0" },
  ];
  const before = JSON.stringify(findings);
  const r = repairClippedExcerpts(findings, "Pricing Arrangement: Firm Fixed Price. Other text.");
  check("negative · clean finding untouched", r.repaired === 0 && JSON.stringify(findings) === before);
}
{
  // procedural_coverage clip is OUT OF SCOPE (Fork-A owns it) → skipped even though truncated
  const findings: TypedFinding[] = [
    { requirement: "obl", citation: "§L", excerpt: "Quotes must be submitted in whole cents ($1.", kind: "procedural_obligation", controllability: "bidder_controls", grounded: true, lens: "procedural_coverage", id: "procedural_coverage#3" },
  ];
  const before = JSON.stringify(findings);
  const r = repairClippedExcerpts(findings, "Quotes must be submitted in whole cents ($1.04 rounding). More.");
  check("scope · procedural_coverage clip skipped (byte-stable)", r.repaired === 0 && JSON.stringify(findings) === before);
}
{
  // unrepairable: clipped excerpt whose head is NOT in source → left clipped (gate still fails)
  const findings: TypedFinding[] = [
    { requirement: "x", citation: "§C", excerpt: "Some requirement text that does not appear anywhere in", kind: "other", controllability: "bidder_controls", grounded: false, lens: "capture_strategist", id: "capture_strategist#9" },
  ];
  const r = repairClippedExcerpts(findings, "Entirely unrelated source document with no overlap.");
  check("unrepairable · no head match → left clipped", r.repaired === 0 && r.unrepairable === 1 && findings[0].excerpt === "Some requirement text that does not appear anywhere in");
}
{
  // ambiguous head (>1 occurrence) → refuse to mislocate
  const source = "The contractor shall submit the plan for review. Later: The contractor shall submit the plan for approval.";
  const span = findRepairSpan(source, "The contractor shall submit the plan for");
  check("ambiguous · duplicate head refused (null)", span === null, JSON.stringify(span));
}

// ── STEP 1 · retry-on-max_tokens (live expert call path) ─────────────────────────
(async () => {
  const submitBlock = (excerpt: string) => ({ type: "tool_use", id: "s1", name: "submit_findings", input: { findings: [{ requirement: "r", citation: "§B", excerpt, kind: "other", controllability: "bidder_controls" }] } });
  // attempt 1 truncates (valid JSON, clipped excerpt); attempt 2 returns the full excerpt
  let calls = 0;
  const clientTrunc = { messages: { create: async () => { calls++; return calls === 1 ? { content: [submitBlock("clipped excerpt for")], stop_reason: "max_tokens", usage: { output_tokens: 10 } } : { content: [submitBlock("clipped excerpt for debarment complete.")], stop_reason: "end_turn", usage: { output_tokens: 20 } }; } } };
  const cmTrunc = makeAnthropicCallModel(clientTrunc as never, "claude-x", { maxTokens: 4096 });
  const outT = await cmTrunc({ system: "s", userTask: "u", priorToolResults: [], forceSubmit: true });
  check("retry · max_tokens → 2 model calls", calls === 2, `calls=${calls}`);
  check("retry · returned findings from attempt 2 (full excerpt)", outT.findings?.[0].excerpt === "clipped excerpt for debarment complete.", JSON.stringify(outT.findings));

  // no truncation → single call, no retry
  let calls2 = 0;
  const clientOk = { messages: { create: async () => { calls2++; return { content: [submitBlock("complete excerpt.")], stop_reason: "end_turn", usage: { output_tokens: 5 } }; } } };
  const cmOk = makeAnthropicCallModel(clientOk as never, "claude-x", { maxTokens: 4096 });
  await cmOk({ system: "s", userTask: "u", priorToolResults: [], forceSubmit: true });
  check("retry · non-truncated → exactly 1 model call", calls2 === 1, `calls=${calls2}`);

  console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();
