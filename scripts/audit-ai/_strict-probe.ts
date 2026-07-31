// Does the API accept strict:true on the REAL submit_findings schema, on the model the engine runs?
// Minimal call (max_tokens 16) — a capability probe, not an audit run.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import Anthropic from "@anthropic-ai/sdk";
import { SUBMIT_FINDINGS_TOOL } from "../../src/lib/audit-expert";
const client = new Anthropic();
(async () => {
  for (const model of ["claude-opus-4-6", "claude-opus-5"]) {
    for (const strict of [false, true]) {
      const tool: any = strict ? { ...SUBMIT_FINDINGS_TOOL, strict: true } : { ...SUBMIT_FINDINGS_TOOL };
      try {
        const r = await client.messages.create({
          model, max_tokens: 16, tools: [tool],
          messages: [{ role: "user", content: "Reply with the word ok." }],
        } as any);
        console.log(`  ${model.padEnd(16)} strict=${String(strict).padEnd(5)} ACCEPTED (stop=${r.stop_reason})`);
      } catch (e: any) {
        console.log(`  ${model.padEnd(16)} strict=${String(strict).padEnd(5)} REJECTED ${e?.status} ${String(e?.message).slice(0, 90)}`);
      }
    }
  }
})();
