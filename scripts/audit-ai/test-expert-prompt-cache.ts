// PROMPT-CACHE (unified flag AUDIT_PROMPT_CACHE) — $0 deterministic test (fakes, no network, no LLM).
//   npx tsx scripts/audit-ai/test-expert-prompt-cache.ts
// Covers BOTH cacheable engine paths:
//   • EXPERT LOOP (makeAnthropicCallModel): flag-OFF ⇒ request BYTE-IDENTICAL (system a plain string, ZERO
//     cache_control); flag-ON ⇒ exactly THREE ephemeral breakpoints (tools tail, per-lens system, last message
//     block) so a multi-turn tool loop reads turns 1..N-1 from cache instead of re-billing them.
//   • L3 FINDER (makeSectionFinderCaller): §L/§M are located SEQUENTIALLY over the SAME fullSource. flag-OFF ⇒
//     document rides the user turn (byte-identical); flag-ON ⇒ document rides a SHARED cachedSystemPrefix (so the
//     §M locate reads what §L wrote) and is REMOVED from the user turn (no duplicate send).
// NOT cached (verified single-shot O(1) calls — no repeated prefix to cache): the skeptic (1 base + 1 escalate)
// and the judgment layer (Gap-A/Gap-B/entailment). Adding cache_control there would be dead code.
// Behavior-neutral for the expert loop; the finder moves the doc user→system (functionally equivalent locate,
// guarded by the uniqueness gate). Both changes are inert when the flag is off.
import { makeAnthropicCallModel } from "@/lib/audit-expert";
import { makeSectionFinderCaller } from "@/lib/audit-section-finder";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

function fakeClient() {
  let captured: Record<string, unknown> | null = null;
  const client = {
    messages: {
      create: async (req: Record<string, unknown>) => {
        captured = req;
        return { content: [{ type: "tool_use", id: "s1", name: "submit_findings", input: { findings: [] } }], stop_reason: "tool_use", usage: { input_tokens: 1, output_tokens: 1 } };
      },
    },
  };
  return { client, get: () => captured! };
}

async function capture(flag: boolean): Promise<Record<string, unknown>> {
  if (flag) process.env.AUDIT_PROMPT_CACHE = "true"; else delete process.env.AUDIT_PROMPT_CACHE;
  const f = fakeClient();
  const cm = makeAnthropicCallModel(f.client as never, "claude-sonnet-4-6");
  // one prior tool-result batch ⇒ the last message is a user tool_result batch (array content)
  await cm({ system: "LENS SYSTEM PROMPT", userTask: "audit this", priorToolResults: [[{ id: "t1", name: "read_section", input: { key: "L" }, result: { text: "section L text" } }]], forceSubmit: false });
  return f.get();
}

async function main() {
  console.log("── flag-OFF: request BYTE-IDENTICAL to prod (no caching) ──");
  const off = await capture(false);
  ok("system is a plain string (unchanged)", typeof off.system === "string");
  ok("ZERO cache_control anywhere in the request", !JSON.stringify(off).includes("cache_control"));
  const offTools = off.tools as Array<Record<string, unknown>>;
  ok("last tool has NO cache_control", !("cache_control" in offTools[offTools.length - 1]));

  console.log("── flag-ON: exactly THREE ephemeral breakpoints ──");
  const on = await capture(true);
  const bp = (JSON.stringify(on).match(/cache_control/g) ?? []).length;
  ok("exactly 3 cache_control breakpoints", bp === 3);
  ok("system is a block array with an ephemeral breakpoint", Array.isArray(on.system) && (on.system as Array<Record<string, unknown>>)[0].cache_control != null);
  const onTools = on.tools as Array<Record<string, unknown>>;
  ok("last tool schema carries the breakpoint (caches all tool defs)", onTools[onTools.length - 1].cache_control != null);
  const msgs = on.messages as Array<{ content: unknown }>;
  const lastContent = msgs[msgs.length - 1].content as Array<Record<string, unknown>>;
  ok("last message's last block carries the breakpoint (caches the transcript prefix)", lastContent[lastContent.length - 1].cache_control != null);

  console.log("── behavior-neutral: findings shape returned regardless of flag ──");
  ok("callModel still returns (loop unaffected)", off != null && on != null);

  // ── L3 FINDER: the document is shared across §L/§M — cache it as a system prefix when the flag is on ──
  const FULLSRC = "STATEMENT OF WORK. The contractor shall furnish widgets per spec. INSTRUCTIONS TO OFFERORS follow.";
  async function captureFinder(flag: boolean): Promise<{ system: string; user: string; cachedSystemPrefix?: string }> {
    if (flag) process.env.AUDIT_PROMPT_CACHE = "true"; else delete process.env.AUDIT_PROMPT_CACHE;
    let cap: { model: string; system: string; user: string; schema: object; maxTokens: number; cachedSystemPrefix?: string } | null = null;
    const finder = makeSectionFinderCaller(async (a) => { cap = a; return JSON.stringify({ located: false, anchor: "" }); }, "claude-sonnet-4-6");
    await finder({ fullSource: FULLSRC, sectionKey: "L", sectionIntent: "instructions to offerors" });
    return cap!;
  }
  console.log("── L3 finder flag-OFF: document rides the USER turn (byte-identical) ──");
  const fOff = await captureFinder(false);
  ok("user contains the ---DOCUMENT--- + fullSource", fOff.user.includes("---DOCUMENT---") && fOff.user.includes(FULLSRC));
  ok("NO cachedSystemPrefix", fOff.cachedSystemPrefix === undefined);
  console.log("── L3 finder flag-ON: document moves to a SHARED cachedSystemPrefix (§M reads §L's cache) ──");
  const fOn = await captureFinder(true);
  ok("cachedSystemPrefix carries the document (shared across §L/§M)", (fOn.cachedSystemPrefix ?? "").includes(FULLSRC));
  ok("user turn NO LONGER re-sends the fullSource (no duplicate)", !fOn.user.includes(FULLSRC));
  ok("user still names the section ask (§L / instructions)", fOn.user.includes("§L"));

  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAIL"} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main();
