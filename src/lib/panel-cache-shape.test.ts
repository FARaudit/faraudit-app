// GATE — the panel does not pay a cache breakpoint on a prefix nothing can read, and the source still ships.
//
// THE DEFECT (adversarial audit 2026-08-06, confirmed on live paid run 3b5bba30). `lensPrefix`
// (agentic-panel-runner.ts:443) interpolates the lens key and the pass's section list into the cached bytes, and
// assembleLensPasses hands every pass a DISJOINT slice — so no two requests in a run can produce byte-identical
// prefix bytes. A cache_control breakpoint therefore has exactly ONE possible reader: panelCall's own max_tokens
// retry. The ledger measured that shape exactly — 67 panel calls, 52 wrote cache and read zero, all 7 reads were
// retries — so every first-attempt panel call paid 1.25× instead of 1.0× and got nothing back.
//
// THE LEG THAT MATTERS IS LEG 2, NOT LEG 1. Turning caching off is trivial; the risk is turning it off by
// DELETING the prefix, because the prefix is how a lens receives its assigned source. That would blind the panel
// while showing a cost win. Leg 2 asserts the source text is still present byte-for-byte with caching disabled.
//
// PLANTED-POSITIVE PROOF — three plants, each restored, each turning its named leg red:
//   A  drop `cachePrefix: false` at the call site        → leg 1 (the breakpoint returns)
//   B  omit the prefix block entirely when uncached      → leg 2 (the lens goes blind — the dangerous fix)
//   C  make cachePrefix default false in the transport   → leg 3 (every other caller silently loses caching)
//
//   npx tsx src/lib/panel-cache-shape.test.ts

import { callStructuredClaude } from "./anthropic-structured";

let failures = 0;
const fail = (leg: string, msg: string) => { failures++; console.error(`  ✗ ${leg} — ${msg}`); };
const pass = (leg: string, msg: string) => console.log(`  ✓ ${leg} — ${msg}`);

const PREFIX = "SECURITY\n\n<assigned-source lens=\"capture_strategist\" sections=\"L,M\">\nTHE ASSIGNED SOURCE TEXT\n</assigned-source>";

/** Capture the request body the transport would POST, without sending it. */
async function bodyFor(opts: { cachePrefix?: boolean }): Promise<Record<string, unknown>> {
  const realFetch = globalThis.fetch;
  let captured: Record<string, unknown> = {};
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    captured = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "{}" }], stop_reason: "end_turn", usage: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callStructuredClaude({
      apiKey: "sk-test", model: "claude-sonnet-4-6", system: "ROLE BLOCK",
      userPrompt: "task", schema: { type: "object" }, maxTokens: 100,
      cachedSystemPrefix: PREFIX, ...(opts.cachePrefix !== undefined ? { cachePrefix: opts.cachePrefix } : {}),
    });
  } catch { /* transport shape is what we're asserting, not the response */ }
  finally { globalThis.fetch = realFetch; }
  return captured;
}

const blocks = (b: Record<string, unknown>) => (Array.isArray(b.system) ? b.system as Array<Record<string, unknown>> : []);

async function main() {
  console.log("GATE — panel prefix: send the source, skip the breakpoint\n");

  // ── LEG 1 · cachePrefix:false ⇒ NO cache_control anywhere in the system field ──
  {
    const b = await bodyFor({ cachePrefix: false });
    const bs = blocks(b);
    if (bs.length !== 2) fail("1 no-breakpoint", `expected a 2-block system field, got ${bs.length}`);
    else if (bs.some((x) => "cache_control" in x)) fail("1 no-breakpoint", "A BREAKPOINT IS STILL SENT — every first-attempt panel call keeps paying 1.25× for a prefix nothing reads");
    else pass("1 no-breakpoint", "two system blocks, zero cache_control — tokens price at 1.0×");
  }

  // ── LEG 2 · THE DANGEROUS ONE — the source must still be there ──
  // A "fix" that drops the prefix would show the same cost win and blind the lens.
  {
    const b = await bodyFor({ cachePrefix: false });
    const bs = blocks(b);
    const joined = bs.map((x) => String(x.text ?? "")).join("");
    if (!joined.includes("THE ASSIGNED SOURCE TEXT")) fail("2 source-intact", "THE LENS WOULD BE BLIND — the assigned source is not in the request at all");
    else if (bs[0]?.text !== PREFIX) fail("2 source-intact", "the prefix block was altered, not merely uncached");
    else if (bs[1]?.text !== "ROLE BLOCK") fail("2 source-intact", "the role block was disturbed");
    else pass("2 source-intact", "prefix byte-identical and still block[0]; only the metadata differs");
  }

  // ── LEG 3 · DEFAULT UNCHANGED — every other caller keeps its cache ──
  {
    const dflt = await bodyFor({});
    const explicit = await bodyFor({ cachePrefix: true });
    const hasCC = (b: Record<string, unknown>) => blocks(b).some((x) => "cache_control" in x);
    if (!hasCC(dflt)) fail("3 default-on", "OMITTING cachePrefix DROPPED the breakpoint — every existing caller silently loses caching");
    else if (!hasCC(explicit)) fail("3 default-on", "cachePrefix:true did not produce a breakpoint");
    else pass("3 default-on", "omitted and true both cache — existing callers byte-identical");
  }

  // ── LEG 4 · the prompt the MODEL reads is identical either way ──
  // If this ever diverges, a cost comparison is measuring two changes at once.
  {
    const on = await bodyFor({ cachePrefix: true });
    const off = await bodyFor({ cachePrefix: false });
    const strip = (b: Record<string, unknown>) => JSON.stringify({ ...b, system: blocks(b).map((x) => x.text) });
    if (strip(on) !== strip(off)) fail("4 content-identical", "the request differs beyond cache_control — caching and content are entangled");
    else pass("4 content-identical", "every field except cache_control is identical — one variable, price only");
  }

  // ── LEG 5 · THE CALL SITE ACTUALLY USES IT ──
  // Legs 1-4 exercise the transport. They stayed GREEN when the panel's own `cachePrefix: false` was deleted,
  // because nothing here reached the call site — a capability shipped with no caller. Driving runPanelJudge for
  // real needs an API key and a whole panel, so this asserts the source: the lens call must pass the flag, and
  // the verifier/gatekeeper calls (which send no prefix at all) must not have acquired one.
  {
    const fs = await import("node:fs");
    const raw = fs.readFileSync(new URL("./agentic-panel-runner.ts", import.meta.url), "utf8");
    // Strip line comments first. The verifier's call carries the literal note "// no cachedSystemPrefix — the
    // verifier reads claim+excerpt pairs", and matching raw text flagged that COMMENT as the defect it denies.
    // A recognizer that reads prose as code is the same class of bug this gate exists to catch.
    const src = raw.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    const lensCall = /cachedSystemPrefix:\s*lensPrefix\s*,\s*cachePrefix:\s*false/.test(src);
    const strayPrefix = /VERIFIER\.system[^\n]*cachedSystemPrefix/.test(src);
    if (!lensCall) fail("5 call-site", "THE PANEL LENS CALL NO LONGER PASSES cachePrefix:false — the transport supports it and nothing uses it");
    else if (strayPrefix) fail("5 call-site", "the verifier acquired a cachedSystemPrefix — it reads claim/excerpt pairs and should send none");
    else pass("5 call-site", "the lens call passes cachePrefix:false; verifier/gatekeeper still send no prefix");
  }

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
