/** $0 regression harness for the two NON-doctrine run-blockers from the 2026-07-05 9-stage engine audit.
 *  RB#1 (audit-expert.ts): a text-only model turn must NOT push an empty tool batch → the transcript rebuild
 *        would emit an assistant/user message with content:[] → Anthropic 400 → the whole paid audit rejects.
 *  RB#2 (audit-orchestrator.ts manifestComplete): a §L/§M proposal page LIMIT ("shall not exceed 40 pages")
 *        must NOT be counted as an attachment page-count → false-INCOMPLETE cap on a biddable audit.
 *  Run: npx tsx scripts/audit-ai/test-run-blockers-2026-07-05.ts   (deterministic, no model calls, $0). */
import { runAgenticExpert, makeAnthropicCallModel, type ExpertSpec } from "../../src/lib/audit-expert";
import { manifestComplete } from "../../src/lib/audit-orchestrator";
import type { AuditToolContext } from "../../src/lib/audit-tools";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "  ✓" : "✗ FAIL"}  ${name}${cond || !detail ? "" : `  — ${detail}`}`);
  cond ? pass++ : fail++;
};

// ─────────────────────────────────────────────────────────────────────────────
// RB#2 — manifestComplete: proposal page LIMITs are excluded; genuine over-size attachments still cap.
// ─────────────────────────────────────────────────────────────────────────────
console.log("RB#2 — manifestComplete page-limit exclusion");
const ctxOf = (fullSource: string): AuditToolContext => ({ fullSource });
const small = "x".repeat(5000); // 5k-char source: any 6+ "N pages" >5 would cap under the old regex

check("§L 'shall not exceed 40 pages' in a 5k source → COMPLETE (not capped)",
  manifestComplete(ctxOf(small + " Volume I shall not exceed 40 pages. ")) === true,
  "proposal limit falsely counted as a 40-page attachment → false-INCOMPLETE");
check("'not to exceed 50 pages' → COMPLETE", manifestComplete(ctxOf(small + " Technical proposal not to exceed 50 pages.")) === true);
check("'limited to 30 pages' → COMPLETE", manifestComplete(ctxOf(small + " The narrative is limited to 30 pages.")) === true);
check("'no more than 25 pages' → COMPLETE", manifestComplete(ctxOf(small + " Submit no more than 25 pages total.")) === true);
check("no page phrasing at all → COMPLETE", manifestComplete(ctxOf(small)) === true);
// Genuine cap PRESERVED: a named attachment far larger than the whole assembled source ⇒ it can't be present.
check("'Technical Specification (459 pages)' in a 10k source → INCOMPLETE (genuine cap preserved)",
  manifestComplete(ctxOf("x".repeat(10000) + " Attachment 3: Technical Specification (459 pages).")) === false,
  "genuine over-size attachment detection was lost");
check("bare '600 pages' (no limit phrase) in a 10k source → INCOMPLETE (still caps)",
  manifestComplete(ctxOf("x".repeat(10000) + " See the 600 pages of drawings.")) === false);

// ─────────────────────────────────────────────────────────────────────────────
// RB#1 — a text-only turn must not poison the rebuilt transcript with content:[].
// Stub SdkClient: turn 1 = TEXT ONLY (no tool_use); turn 2 = submit_findings. Capture every messages[] the
// client receives; assert none carries an empty content array (the Anthropic-400 signature).
// ─────────────────────────────────────────────────────────────────────────────
async function rb1() {
  console.log("\nRB#1 — expert empty-batch (text-only turn) does not emit content:[]");
  const seenMessages: Array<Array<{ role: string; content: unknown }>> = [];
  let call = 0;
  const stub = {
    messages: {
      create: async (a: Record<string, unknown>) => {
        seenMessages.push(a.messages as Array<{ role: string; content: unknown }>);
        call++;
        if (call === 1) return { content: [{ type: "text", text: "Let me think before I read anything." }], stop_reason: "end_turn" };
        return { content: [{ type: "tool_use", id: "s1", name: "submit_findings", input: { findings: [] } }], stop_reason: "tool_use" };
      },
    },
  };
  const spec: ExpertSpec = { key: "test", system: "You are a test lens." };
  const ctx: AuditToolContext = { fullSource: "SECTION L — Instructions. Volume I shall not exceed 40 pages." };
  const callModel = makeAnthropicCallModel(stub as unknown as Parameters<typeof makeAnthropicCallModel>[0], "claude-test");
  const res = await runAgenticExpert(spec, ctx, { callModel, maxTurns: 4 });

  const emptyContent = seenMessages.flat().find((m) => Array.isArray(m.content) && (m.content as unknown[]).length === 0);
  check("no message sent to the API has content:[] after a text-only turn", emptyContent === undefined,
    emptyContent ? `found empty-content ${(emptyContent as { role: string }).role} message → would 400` : "");
  check("expert converged to a clean findings return (no crash)", res.converged === true && Array.isArray(res.findings));
  check("the API was actually called twice (text turn then submit turn)", call === 2, `call=${call}`);
}

rb1().then(() => {
  console.log(`\n${fail === 0 ? "✅ ALL GREEN" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
});
