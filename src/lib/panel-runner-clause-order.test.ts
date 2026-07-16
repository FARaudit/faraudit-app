// $0 PROOF — PANEL CLAUSE-CHECKER CONSTRUCTION ORDER (ultra #240 Finding A, card #544). Run:
//   npx tsx src/lib/panel-runner-clause-order.test.ts
//
// DOCTRINE (Brain ruling on card #544 — third proof-shape instance, after PR #200 render-path and the
// #539 ROOT-2 correction): PROOF HARNESSES MUST RUN THE PRODUCTION COMPOSITION. A direct-call harness
// (e.g. makeClauseSourceChecker fed a hand-populated string) proves the LEAF's mechanism but MASKS
// CALLER-ORDER DEFECTS — clause-source-checker.test.ts was green while the production caller sealed the
// checker's closure over an EMPTY source. This suite therefore drives runPanelJudge (the production
// caller) end-to-end, stubbing ONLY the leaf external (globalThis.fetch = the Anthropic API).
//
// The defect (pre-existing at d834d27; found by the ultra checkpoint on PR #240): the fabrication-
// suppression clause checker was CONSTRUCTED before Promise.allSettled(PANELISTS.map(runOne)) executed,
// but its OFF-path source ([...bundleByLens.values()].join("\n")) is populated INSIDE runOne — and
// makeClauseSourceChecker normalizes at construction. Result with AUDIT_CLAUSE_SOURCE_FULLTEXT off:
// the checker closed over "" and EVERY 52.xxx/252.xxx cite in every lens output was stripped as
// "[clause not in source — suppressed]" (total false-suppression on the prod default path).
import { runPanelJudge } from "./agentic-panel-runner";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

// ── the leaf-external stub: Anthropic API only. Everything else is the real production path. ──
const REAL_CLAUSE = "52.222-41";   // present in §I source below
const FAKE_CLAUSE = "52.999-99";   // absent from EVERY section — must still be suppressed post-fix
const I_SENTENCE = `The clause ${REAL_CLAUSE} Service Contract Act applies to this order.`;
const PANELIST_PAYLOAD = {
  lens: "stub", verdict: "BID", fit_score: 80, confidence: "high",
  named_hard_gates: [
    { gate: `SCA compliance under ${REAL_CLAUSE}`, met: true, citation: `FAR ${REAL_CLAUSE}`, excerpt: I_SENTENCE },
    { gate: `Fabricated-cite probe ${FAKE_CLAUSE}`, met: true, citation: `FAR ${FAKE_CLAUSE}`, excerpt: I_SENTENCE },
  ],
  risks: [], contrarian_finding: "none",
};
const envelope = (payload: unknown) => ({
  ok: true, status: 200,
  json: async () => ({ content: [{ type: "text", text: JSON.stringify(payload) }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }),
  text: async () => "",
});
const realFetch = globalThis.fetch;
globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
  const body = JSON.parse(init?.body ?? "{}") as { output_config?: { format?: { schema?: unknown } } };
  const schemaStr = JSON.stringify(body.output_config?.format?.schema ?? {});
  if (schemaStr.includes("named_hard_gates")) return envelope(PANELIST_PAYLOAD);           // lens call
  if (schemaStr.includes("claims")) return envelope({ claims: [] });                       // verifier call
  return envelope({ verdict: "BID_WITH_CAUTION", fit_score: 50, eligible: true, preserved_dissent: [], show_stoppers: [], rationale: "stub" }); // gatekeeper
}) as typeof fetch;

const SECTION_TEXT: Record<string, string> = {
  A: "SECTION A — SF1449 solicitation cover.", B: "SECTION B — supplies and prices, CLIN 0001.",
  C: "SECTION C — statement of work: recurring services.", H: "SECTION H — special contract requirements.",
  I: `SECTION I — CONTRACT CLAUSES\n${I_SENTENCE}`, J: "SECTION J — attachments list.",
  L: "SECTION L — instructions to offerors.", M: "SECTION M — evaluation: LPTA.",
};
const withFlag = async <T>(on: boolean, fn: () => Promise<T>): Promise<T> => {
  const prev = process.env.AUDIT_CLAUSE_SOURCE_FULLTEXT;
  if (on) process.env.AUDIT_CLAUSE_SOURCE_FULLTEXT = "true"; else delete process.env.AUDIT_CLAUSE_SOURCE_FULLTEXT;
  try { return await fn(); } finally { if (prev === undefined) delete process.env.AUDIT_CLAUSE_SOURCE_FULLTEXT; else process.env.AUDIT_CLAUSE_SOURCE_FULLTEXT = prev; }
};
const run = () => runPanelJudge({
  sectionText: SECTION_TEXT,
  detectedSections: new Set(Object.keys(SECTION_TEXT)),
  manifest: { ok: true, missing: [], statement: "All binding sections present — panel may evaluate." },
});

(async () => {
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-key-never-used-fetch-is-stubbed";

  // ── FLAG OFF (prod default) — the regression this suite exists for ──
  console.log("\n── flag OFF: checker must see the POPULATED bundle union (construction AFTER the lenses ran) ──");
  const off = await withFlag(false, run);
  const lensOff = off.panelists.find((p) => p.key === "proposal_compliance");
  const gOff = lensOff?.output?.named_hard_gates ?? [];
  assert(gOff.length === 2, `lens output has both gates [got ${gOff.length}]`);
  assert(gOff[0]?.citation.includes(REAL_CLAUSE) === true, `real clause ${REAL_CLAUSE} SURVIVES the scrub (pre-fix: stripped — checker source was empty)`);
  assert(gOff[0]?.excerpt.includes(REAL_CLAUSE) === true, "real clause survives in the excerpt too");
  assert(!gOff[0]!.citation.includes("suppressed"), "real-clause citation carries no suppression marker");
  assert(gOff[1]?.citation.includes("[clause not in source — suppressed]") === true, `fabricated ${FAKE_CLAUSE} still SUPPRESSED (anti-fabrication contract intact)`);
  assert(gOff[1]?.citation.includes(FAKE_CLAUSE) === false, "fabricated clause number is gone from the citation");
  // every lens's output flows through the same scrub — the union covers ALL lenses' bundles
  for (const p of off.panelists) {
    const g0 = p.output?.named_hard_gates?.[0];
    if (g0) assert(g0.citation.includes(REAL_CLAUSE), `lens ${p.key}: real clause survives`);
  }

  // ── FLAG ON — full-sectionText path (card #539) must behave identically on this specimen ──
  console.log("\n── flag ON: full-source checker — same outcome on this specimen ──");
  const on = await withFlag(true, run);
  const gOn = on.panelists.find((p) => p.key === "proposal_compliance")?.output?.named_hard_gates ?? [];
  assert(gOn[0]?.citation.includes(REAL_CLAUSE) === true, "flag ON: real clause survives");
  assert(gOn[1]?.citation.includes("[clause not in source — suppressed]") === true, "flag ON: fabricated clause suppressed");

  globalThis.fetch = realFetch;
  console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("❌ HARNESS THREW:", e); process.exit(1); });
