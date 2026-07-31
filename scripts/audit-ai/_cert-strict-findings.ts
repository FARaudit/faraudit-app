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
  // WAS A PLACEBO (fixed 2026-07-31). This read `JSON.stringify(...) !== offJson || true` — the trailing
  // `|| true` made it structurally unable to fail, and the comparison was inverted on top of that (a MUTATED
  // object is what makes the strings differ, so `!==` asserted the bug). What it means to assert: arming the
  // flag must not have mutated the shared base const, so with the flag removed again the definition is
  // byte-for-byte what it was before. Proven falsifiable by the planted mutation below, not assumed.
  delete process.env.AUDIT_STRICT_FINDINGS_TOOL;
  ok("flag-OFF object was not mutated by arming", JSON.stringify(m.submitFindingsToolFor(false)) === offJson);
  ok("the shared base const never grew a strict key", !("strict" in (m.SUBMIT_FINDINGS_TOOL as any)));
  // PLANTED POSITIVE — a cert leg that cannot go red certifies nothing. Mutate a throwaway copy the way a
  // leaking implementation would, and confirm the comparison above actually catches it.
  const planted = { ...(m.SUBMIT_FINDINGS_TOOL as any), strict: true };
  ok("…and that check is falsifiable (planted mutation is caught)", JSON.stringify(planted) !== offJson);

  // The only proof that matters: the API accepts the armed tool on the models the engine runs. Derived from
  // the registry, never hard-coded — this leg was pinned to claude-opus-4-6, which #385 routed away from.
  process.env.AUDIT_STRICT_FINDINGS_TOOL = "true";
  const { modelFor } = await import("../../src/lib/model-registry");
  const client = new Anthropic();
  for (const model of [...new Set([modelFor("lens"), modelFor("judge")])]) {
    try {
      const r = await client.messages.create({ model, max_tokens: 16, tools: [on], messages: [{ role: "user", content: "Reply with ok." }] } as any);
      ok(`API accepts the ARMED tool on ${model} (stop=${r.stop_reason})`, true);
    } catch (e: any) { ok(`API accepts the ARMED tool on ${model} — ${e?.status} ${String(e?.message).slice(0,70)}`, false); }
  }
  console.log(`\nCERT STRICT-FINDINGS: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
