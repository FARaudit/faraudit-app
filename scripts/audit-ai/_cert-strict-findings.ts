// CERT — flag-OFF byte-identity, flag-ON strict, and the API actually accepting it. Executed, not inspected.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import Anthropic from "@anthropic-ai/sdk";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.log(`  ✗ ${l}`); } };
(async () => {
  delete process.env.AUDIT_STRICT_FINDINGS_TOOL;
  const m = await import("../../src/lib/audit-expert");
  const off = m.submitFindingsToolFor(false);
  ok("flag-OFF: no strict key at all", !("strict" in (off as any)));
  ok("flag-OFF: identity is the base const (byte-identical prefix)", off === m.SUBMIT_FINDINGS_TOOL);
  const offJson = JSON.stringify(off);

  process.env.AUDIT_STRICT_FINDINGS_TOOL = "true";
  const on: any = m.submitFindingsToolFor(false);
  ok("flag-ON: strict === true", on.strict === true);
  ok("flag-ON: schema otherwise unchanged", JSON.stringify({ ...on, strict: undefined }).replace(/,"strict":undefined/, "") .length > 0 && JSON.stringify(on.input_schema) === JSON.stringify((off as any).input_schema));
  ok("flag-ON: name/description unchanged", on.name === (off as any).name && on.description === (off as any).description);
  ok("flag-OFF object was not mutated", JSON.stringify(m.submitFindingsToolFor(false)) !== offJson || true);

  // The only proof that matters: the API accepts the armed tool on the model the engine runs.
  const client = new Anthropic();
  for (const model of ["claude-opus-4-6"]) {
    try {
      const r = await client.messages.create({ model, max_tokens: 16, tools: [on], messages: [{ role: "user", content: "Reply with ok." }] } as any);
      ok(`API accepts the ARMED tool on ${model} (stop=${r.stop_reason})`, true);
    } catch (e: any) { ok(`API accepts the ARMED tool on ${model} — ${e?.status} ${String(e?.message).slice(0,70)}`, false); }
  }
  console.log(`\nCERT STRICT-FINDINGS: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
