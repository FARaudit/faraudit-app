// LENS EFFORT — CI gate (src/lib/*.test.ts is the glob CI actually runs).
// Run: npx tsx src/lib/lens-effort.test.ts
//
// THE DEFECT: the expert request in audit-expert.ts carried no `output_config`, so every lens call ran at the
// API default of `high` — not as a decision, but because the parameter was never passed. On live run e5f177aa
// that stage was 40 of 46 sonnet calls and ~90% of the run's cost.
//
// WHAT IS ASSERTED: `AUDIT_LENS_EFFORT` reaches the wire when set to a known level; the request is byte-identical
// to today when the env is absent OR unrecognized (a typo must degrade to production, never to a 400 on an
// unknown enum); and setting it changes NOTHING else about the request.
//
// This drives the REAL makeAnthropicCallModel and stubs only the leaf external (the SDK client), so the request
// it asserts on is the one production builds — not a mirror of it.

import assert from "node:assert";
import { makeAnthropicCallModel } from "./audit-expert";

let passed = 0;
const ok = (label: string, cond: boolean) => { assert.ok(cond, `FAIL — ${label}`); console.log(`  ✓ ${label}`); passed++; };

type Req = Record<string, unknown>;

/** Captures the request the production code builds, then returns a minimal well-formed response. */
function captureRequest(): { seen: Req[]; client: unknown } {
  const seen: Req[] = [];
  const client = {
    messages: {
      create: async (req: Req) => {
        seen.push(req);
        return { content: [], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };
      },
    },
  };
  return { seen, client };
}

async function requestUnder(env: string | undefined): Promise<Req> {
  const prior = process.env.AUDIT_LENS_EFFORT;
  if (env === undefined) delete process.env.AUDIT_LENS_EFFORT;
  else process.env.AUDIT_LENS_EFFORT = env;
  try {
    const { seen, client } = captureRequest();
    const callModel = makeAnthropicCallModel(client as never, "claude-sonnet-4-6");
    await callModel({ system: "you are a lens", userTask: "audit this", priorToolResults: [], forceSubmit: false });
    assert.ok(seen.length === 1, `expected exactly one request, got ${seen.length}`);
    return seen[0];
  } finally {
    if (prior === undefined) delete process.env.AUDIT_LENS_EFFORT;
    else process.env.AUDIT_LENS_EFFORT = prior;
  }
}

// Wrapped in main() — this file is transformed to CJS, where top-level await is unavailable.
async function main() {
console.log("── lens effort ──");

// ── THE CORE ASSERTION: a known level reaches the wire ────────────────────────────────────────
for (const level of ["low", "medium", "high", "xhigh", "max"]) {
  const req = await requestUnder(level);
  ok(`AUDIT_LENS_EFFORT="${level}" reaches the request as output_config.effort`,
    JSON.stringify(req.output_config) === JSON.stringify({ effort: level }));
}

// ── DEFAULT UNCHANGED — the whole point of shipping this dark ─────────────────────────────────
const bare = await requestUnder(undefined);
ok("env ABSENT ⇒ no output_config key at all (byte-identical to production today)",
  !("output_config" in bare));

// ── A TYPO MUST DEGRADE TO TODAY, NOT TO A 400 ────────────────────────────────────────────────
// An unknown enum value is an API error, so passing the env through unvalidated would turn a typo
// into a dead audit. Every one of these must fall back to omitting the field.
for (const bad of ["Medium", "MEDIUM", "med", "", " ", "hgih", "0", "true", "low ", "highest"]) {
  const req = await requestUnder(bad);
  ok(`AUDIT_LENS_EFFORT=${JSON.stringify(bad)} is REJECTED → field omitted (a typo must not 400 the audit)`,
    !("output_config" in req));
}

// ── SETTING EFFORT CHANGES NOTHING ELSE ───────────────────────────────────────────────────────
// If the effort branch perturbed any other field, a cost comparison would be measuring two changes.
const withEffort = await requestUnder("medium");
const withoutEffort = await requestUnder(undefined);
const strip = (r: Req) => { const c = { ...r }; delete c.output_config; return JSON.stringify(c); };
ok("every OTHER request field is identical with and without effort (the comparison measures one variable)",
  strip(withEffort) === strip(withoutEffort));

// The fields the engine depends on must survive untouched — named individually so a regression
// says WHICH one moved rather than just "something changed".
ok("temperature is still pinned to 0 (card #596 determinism)", withEffort.temperature === 0);
ok("max_tokens is still the 4096 default", withEffort.max_tokens === 4096);
ok("model is unchanged", withEffort.model === "claude-sonnet-4-6");
ok("tools are still present", Array.isArray(withEffort.tools) && (withEffort.tools as unknown[]).length > 0);

console.log(`\n✓ ${passed}/${passed} passed — lens effort`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
