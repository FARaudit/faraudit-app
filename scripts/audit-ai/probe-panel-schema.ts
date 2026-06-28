// Near-free diagnostic: isolate WHY every panel + grader call failed in 6E attempt #2.
// Calls callStructuredClaude with the real PANELIST_SCHEMA, GRADER_SCHEMA, and a trivial
// control schema, on a 1-line prompt. A 4xx costs $0; a success costs ~$0.001. Prints the
// FULL error so we see the API's rejection reason (the run only logged "FAIL").
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const { callStructuredClaude } = await import("@/lib/anthropic-structured");
  const { PANELIST_SCHEMA, VERIFIER_SCHEMA, CHIEF_JUDGE_SCHEMA } = await import("@/lib/agentic-panel");
  const { GRADER_SCHEMA } = await import("./panel-grader");

  const CONTROL = {
    type: "object", additionalProperties: false,
    required: ["ok"], properties: { ok: { type: "boolean" } },
  };

  const cases: Array<[string, object, string]> = [
    ["CONTROL (trivial schema)", CONTROL, "claude-haiku-4-5"],
    ["PANELIST_SCHEMA (sonnet)", PANELIST_SCHEMA, "claude-sonnet-4-6"],
    ["PANELIST_SCHEMA (haiku)", PANELIST_SCHEMA, "claude-haiku-4-5"],
    ["VERIFIER_SCHEMA (sonnet)", VERIFIER_SCHEMA, "claude-sonnet-4-6"],
    ["CHIEF_JUDGE_SCHEMA (sonnet)", CHIEF_JUDGE_SCHEMA, "claude-sonnet-4-6"],
    ["GRADER_SCHEMA (sonnet)", GRADER_SCHEMA, "claude-sonnet-4-6"],
  ];

  for (const [name, schema, model] of cases) {
    try {
      const res = await callStructuredClaude({
        apiKey, model, system: "Return the required JSON.",
        userPrompt: "Respond with a minimal valid object for the schema. This is a connectivity probe.",
        schema, maxTokens: 200, label: name,
      });
      console.log(`✅ ${name} → OK · ${res.text.slice(0, 80)}`);
    } catch (e) {
      console.log(`❌ ${name} → ${e instanceof Error ? e.message : e}`);
    }
  }
}
main().catch((e) => { console.error("FATAL:", e instanceof Error ? e.message : e); process.exit(1); });
