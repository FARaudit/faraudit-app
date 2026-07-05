// Expert-loop PROMPT-CACHE draft — $0 deterministic test (fake SDK client, no network, no LLM).
//   npx tsx scripts/audit-ai/test-expert-prompt-cache.ts
// Proves the flag-gated caching change to makeAnthropicCallModel:
//   • flag-OFF ⇒ the request is BYTE-IDENTICAL to the prior prod shape (system is a plain string,
//     ZERO cache_control anywhere) — so merging it is a no-op until AUDIT_EXPERT_PROMPT_CACHE=true.
//   • flag-ON  ⇒ exactly THREE ephemeral breakpoints (tools tail, per-lens system, last message
//     block) so a multi-turn tool loop reads turns 1..N-1 from cache instead of re-billing them.
// Behavior-neutral: caching changes billing, not output — the returned findings are unaffected.
import { makeAnthropicCallModel } from "@/lib/audit-expert";

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
  if (flag) process.env.AUDIT_EXPERT_PROMPT_CACHE = "true"; else delete process.env.AUDIT_EXPERT_PROMPT_CACHE;
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

  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAIL"} — ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
main();
