// Cache-proof — the "cents test". Proves the prompt-cache MECHANISM the Stage-1
// fix relies on: an IDENTICAL system + a cache_control'd doc block, sent twice
// with only the trailing userPrompt changing, must produce cache_read>0 on call 2.
// Runs 2 tiny Haiku calls (fractions of a cent), NO audit, NO Opus. This is the
// principle behind the engine fix; the engine's own cache_read>0 is confirmed on a
// real worker run afterward.
//
// Run: npx tsx scripts/audit-ai/cache-proof.mjs
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error("ANTHROPIC_API_KEY not set"); process.exit(1); }
const MODEL = "claude-haiku-4-5-20251001";

// A stable ~8k-token "document" (well above any cache minimum). Identical across calls.
const DOC = ("--- SAMPLE SOLICITATION (cache-proof filler) ---\n" +
  "Section L instructions. Section M evaluation factors. FAR 52.212-4. DFARS 252.204-7012. "
  .repeat(1500));

// IDENTICAL system across both calls (the engine's SHARED_AUDIT_SYSTEM principle).
const SYSTEM = "You are a federal-contracting analyst. Reply with one short JSON object {\"ok\":true}.";

async function call(userPrompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 50,
      system: SYSTEM,
      messages: [{ role: "user", content: [
        // cached prefix: the doc block carries the breakpoint (identical both calls)
        { type: "text", text: DOC, cache_control: { type: "ephemeral" } },
        // volatile tail: differs per call (after the breakpoint) — mirrors the engine
        { type: "text", text: userPrompt },
      ]}],
    }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const u = (await res.json()).usage ?? {};
  return { write: u.cache_creation_input_tokens ?? 0, read: u.cache_read_input_tokens ?? 0, input: u.input_tokens ?? 0 };
}

console.log("Cache-proof on", MODEL, "(2 tiny calls, ~fractions of a cent)\n");
const c1 = await call("Question 1: confirm.");
console.log(`call 1 (primes cache): cache_write=${c1.write} cache_read=${c1.read} input=${c1.input}`);
const c2 = await call("Question 2: a different trailing prompt.");
console.log(`call 2 (should READ):  cache_write=${c2.write} cache_read=${c2.read} input=${c2.input}`);
console.log("");
if (c2.read > 0) {
  console.log(`✅ PASS — call 2 read ${c2.read} tokens from cache. The identical-prefix + cache_control mechanism works.`);
  console.log("   This is the principle the engine fix uses. Real proof = cache_read>0 in worker logs on a live audit.");
} else {
  console.log("❌ FAIL — call 2 cache_read=0. Prefix not cached (check min-cacheable size / prefix identity).");
  process.exit(2);
}
