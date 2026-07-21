// $0 PROOF — card #612-(3)/(4e): PRODUCER PREFIX CACHE + ASYNC JUDGE-RATIONALE + STOPWATCH INSTRUMENTATION.
// Run: npx tsx src/lib/panel-runner-async-cache.test.ts
//
// DOCTRINE (card #544): a proof harness must run the PRODUCTION COMPOSITION. This drives runPanelJudge
// end-to-end, stubbing ONLY the leaf external (globalThis.fetch = the Anthropic API) and capturing every
// request's cached system prefix so the cache-sharing claim is checked structurally, not by inspection.
//
// PROVES:
//   (A) ASYNC-RATIONALE EQUIVALENCE — flag OFF vs ON produce IDENTICAL typedFindings AND identical (awaited)
//       floored judgment; OFF ⇒ judgment set + no promise; ON ⇒ judgment null on return + judgmentPromise
//       resolves to the same judgment. (verdict-inert: the judge is report-only.)
//   (B) ASYNC ROBUSTNESS — a judge FAILURE degrades async to judgment=null but PRESERVES typedFindings (the
//       verified facts still reach deriveVerdict); the sync path rethrows (today's panel-off degrade).
//   (C) PREFIX-CACHE SHARING — cache ON ⇒ all 5 lens calls carry the BYTE-IDENTICAL cached prefix (the shared
//       <solicitation-source>); cache OFF ⇒ per-lens <assigned-source ...> prefixes DIFFER. Flag OFF byte-identical.
//   (D) INSTRUMENTATION — summarizePanelUsage groups by stage; formatPanelInstrumentation renders; and
//       buildSharedSolicitationSource is deterministic (stable key order).
import { runPanelJudge, summarizePanelUsage, formatPanelInstrumentation, buildSharedSolicitationSource } from "./agentic-panel-runner";
import type { StructuredUsage } from "./anthropic-structured";
import { PANELIST_SCHEMA, VERIFIER_SCHEMA } from "./agentic-panel";
import { sanitizeSchema } from "./anthropic-structured";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

const PANELIST_PAYLOAD = {
  lens: "stub", verdict: "BID", fit_score: 80, confidence: "high",
  named_hard_gates: [{ gate: "SCA compliance", met: true, citation: "FAR 52.222-41", excerpt: "The clause 52.222-41 Service Contract Act applies to this order." }],
  risks: [], contrarian_finding: "none",
};
const JUDGE_PAYLOAD = { verdict: "BID_WITH_CAUTION", fit_score: 50, eligible: true, preserved_dissent: [], show_stoppers: [], rationale: "stub rationale" };
const envelope = (payload: unknown) => ({
  ok: true, status: 200,
  json: async () => ({ content: [{ type: "text", text: JSON.stringify(payload) }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 5 } }),
  text: async () => "",
});
const realFetch = globalThis.fetch;
const PANELIST_WIRE = JSON.stringify(sanitizeSchema(PANELIST_SCHEMA));
const VERIFIER_WIRE = JSON.stringify(sanitizeSchema(VERIFIER_SCHEMA));
// capture: every lens call's cached prefix (system[0].text) so the sharing claim is checked structurally.
let lensPrefixes: string[] = [];
let failJudge = false;
globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
  const body = JSON.parse(init?.body ?? "{}") as { system?: unknown; output_config?: { format?: { schema?: unknown } } };
  const schemaStr = JSON.stringify(body.output_config?.format?.schema ?? {});
  if (schemaStr === PANELIST_WIRE) {
    const sys = body.system;
    const cachedPrefix = Array.isArray(sys) ? String((sys[0] as { text?: string })?.text ?? "") : "";  // system[0] = the cache_control block
    lensPrefixes.push(cachedPrefix);
    return envelope(PANELIST_PAYLOAD);
  }
  if (schemaStr === VERIFIER_WIRE) return envelope({ claims: [{ ref: "proposal_compliance:G1", state: "VERIFIED", evidence: "sound" }] });
  if (schemaStr.includes("show_stoppers")) { if (failJudge) throw new Error("stub: gatekeeper down"); return envelope(JUDGE_PAYLOAD); }
  throw new Error(`stub: unrecognized schema: ${schemaStr.slice(0, 100)}`);
}) as typeof fetch;

const SECTION_TEXT: Record<string, string> = {
  A: "SECTION A — SF1449 cover.", B: "SECTION B — supplies and prices, CLIN 0001.",
  C: "SECTION C — statement of work.", H: "SECTION H — special contract requirements.",
  I: "SECTION I — CONTRACT CLAUSES\nThe clause 52.222-41 Service Contract Act applies to this order.",
  J: "SECTION J — attachments list.", L: "SECTION L — instructions.", M: "SECTION M — evaluation: LPTA.",
};
const envKeys = ["AUDIT_PANEL_ASYNC_RATIONALE", "AUDIT_PRODUCER_PREFIX_CACHE"] as const;
const withEnv = async <T>(set: Partial<Record<typeof envKeys[number], boolean>>, fn: () => Promise<T>): Promise<T> => {
  const prev: Record<string, string | undefined> = {};
  for (const k of envKeys) { prev[k] = process.env[k]; if (set[k]) process.env[k] = "true"; else delete process.env[k]; }
  try { return await fn(); } finally { for (const k of envKeys) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } }
};
const run = () => { lensPrefixes = []; return runPanelJudge({
  sectionText: SECTION_TEXT, detectedSections: new Set(Object.keys(SECTION_TEXT)),
  manifest: { ok: true, missing: [], statement: "All binding sections present." },
}); };

(async () => {
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-key-never-used-fetch-is-stubbed";

  // ── (A) ASYNC-RATIONALE EQUIVALENCE ──────────────────────────────────────────────
  console.log("\n── (A) async-rationale: OFF vs ON produce the same verdict facts + judgment ──");
  const off = await withEnv({}, run);
  const on = await withEnv({ AUDIT_PANEL_ASYNC_RATIONALE: true }, run);
  assert(off.judgment !== null && off.judgmentPromise === undefined, "OFF: judgment set synchronously, no promise");
  assert(on.judgment === null && typeof on.judgmentPromise?.then === "function", "ON: judgment null on return + judgmentPromise present");
  const onJudg = await on.judgmentPromise!;
  assert(JSON.stringify(off.judgment) === JSON.stringify(onJudg), "OFF judgment === awaited ON judgment (byte-identical floored output)");
  assert(JSON.stringify(off.typedFindings) === JSON.stringify(on.typedFindings), "typedFindings IDENTICAL OFF vs ON (verdict authority unaffected)");
  assert(off.typedFindings.length > 0, "typedFindings non-empty (the verified gate crossed the seam)");

  // ── (B) ASYNC ROBUSTNESS — judge failure preserves typedFindings ──────────────────
  console.log("\n── (B) judge failure: async degrades to null rationale but keeps verified findings; sync rethrows ──");
  failJudge = true;
  const onFail = await withEnv({ AUDIT_PANEL_ASYNC_RATIONALE: true }, run);
  const onFailJudg = await onFail.judgmentPromise!;
  assert(onFailJudg === null, "ON + judge-fail: judgmentPromise resolves null (report reason left unfolded)");
  assert(onFail.typedFindings.length > 0, "ON + judge-fail: typedFindings PRESERVED (verified facts still reach deriveVerdict)");
  let syncThrew = false;
  try { await withEnv({}, run); } catch { syncThrew = true; }
  assert(syncThrew, "OFF + judge-fail: sync path rethrows (today's panel-off degrade — unchanged)");
  failJudge = false;

  // ── (C) PREFIX-CACHE SHARING ──────────────────────────────────────────────────────
  console.log("\n── (C) prefix-cache: ON ⇒ one shared prefix across lenses; OFF ⇒ per-lens prefixes differ ──");
  await withEnv({}, run);
  const offPrefixes = [...lensPrefixes];
  assert(new Set(offPrefixes).size === offPrefixes.length, `OFF: each lens carries a DISTINCT assigned-source prefix (${offPrefixes.length} unique)`);
  assert(offPrefixes.every((p) => p.includes("<assigned-source")), "OFF: prefixes are the per-lens <assigned-source> blocks");
  await withEnv({ AUDIT_PRODUCER_PREFIX_CACHE: true }, run);
  const onPrefixes = [...lensPrefixes];
  assert(onPrefixes.length === 5 && new Set(onPrefixes).size === 1, `ON: all ${onPrefixes.length} lenses carry the BYTE-IDENTICAL shared prefix`);
  assert(onPrefixes[0].includes("<solicitation-source>"), "ON: the shared prefix is the full <solicitation-source> block");
  assert(onPrefixes[0].includes("## SECTION A") && onPrefixes[0].includes("## SECTION M"), "ON: shared prefix carries the full section set");

  // ── (D) INSTRUMENTATION (pure) ─────────────────────────────────────────────────────
  console.log("\n── (D) instrumentation: per-stage fold + render + deterministic shared source ──");
  const usage: StructuredUsage[] = [
    { label: "panel:capture_strategist", model: "s", input_tokens: 100, output_tokens: 50, cache_write: 0, cache_read: 0, ms: 8000 },
    { label: "panel:proposal_compliance", model: "s", input_tokens: 10, output_tokens: 40, cache_write: 0, cache_read: 90, ms: 6000 },
    { label: "panel:verifier#1/2", model: "o", input_tokens: 20, output_tokens: 30, cache_write: 0, cache_read: 0, ms: 5000 },
    { label: "panel:verifier#2/2", model: "o", input_tokens: 22, output_tokens: 33, cache_write: 0, cache_read: 0, ms: 5200 },
    { label: "panel:gatekeeper @12000", model: "s", input_tokens: 15, output_tokens: 60, cache_write: 0, cache_read: 0, ms: 4000 },
  ];
  const rows = summarizePanelUsage(usage);
  const verifierRow = rows.find((r) => r.stage === "verifier");
  assert(rows.some((r) => r.stage === "lens:capture_strategist"), "summarize: lens stage keyed by lens name");
  assert(verifierRow?.calls === 2, "summarize: both verifier batch calls fold into ONE verifier stage");
  assert(rows.some((r) => r.stage === "gatekeeper"), "summarize: retry '@12000' suffix stripped ⇒ gatekeeper stage");
  const rendered = formatPanelInstrumentation(rows, 22000);
  assert(rendered.includes("cache-hit=") && rendered.includes("Phase-A lenses parallel-max="), "format: renders cache-hit% + parallel-max wall-clock");
  const s1 = buildSharedSolicitationSource(SECTION_TEXT);
  const s2 = buildSharedSolicitationSource({ M: SECTION_TEXT.M, A: SECTION_TEXT.A, ...SECTION_TEXT });  // different insertion order
  assert(s1 === s2, "buildSharedSolicitationSource: deterministic (stable key order ⇒ identical cache key)");
  assert(s1.indexOf("## SECTION A") < s1.indexOf("## SECTION B"), "shared source is section-sorted");

  globalThis.fetch = realFetch;
  console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { globalThis.fetch = realFetch; console.error("❌ HARNESS THREW:", e); process.exit(1); });
