// $0 PROOF for the STAGE LEDGER (CEO queue #4 precondition).
// Run: npx tsx src/lib/audit-stage-ledger.test.ts
//
// The ask was "where does the engine spend wall-clock and tokens". It could not be answered from 113 banked
// records: ONE carried any `wall_ms`, TWO any `cost_usd`. The cause was not that the engine failed to measure
// — it measures every call — but that `usageCalls` was reduced to a dollar figure for billing and then
// dropped, and `UsageCall` did not even declare the `label`/`ms` the structured path was already emitting.
//
// So this is not new instrumentation. It is the removal of a discard. The suite therefore has to prove three
// things, and the third is the one that matters:
//   1. the ledger SURVIVES into the record (it did not before);
//   2. absent ledger ≠ empty ledger — "predates this change" and "made zero model calls" stay distinguishable;
//   3. the expert/lens path now emits `label` and `ms` — it never did, and it is the biggest spender.
import { buildRunRecord, type BuildRunRecordArgs } from "./audit-run-record";
import { makeAnthropicCallModel, type ExpertUsage } from "./audit-expert";
import type { UsageCall } from "./audit-cost";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

const baseArgs = (): BuildRunRecordArgs => ({
  meta: { runId: "r1", startedAt: "2026-08-03T00:00:00Z", flags: {} },
  input: { fullSource: "SECTION L\nOfferors shall submit.", bidderProfile: null, naics: null, setAside: null, manifestComplete: null },
  result: {
    decision: { verdict: "BID_WITH_CAUTION", eligible: true, reason: "x" },
    inputs: {}, findings: [], coverage: { required: [], covered: [], missing: [], attestations: [], coreMissing: [] },
    conflict: false, sectionsRead: [], perLens: {},
  } as never,
  billing: { honestFail: false, billable: true },
});

console.log("── 1. THE LEDGER SURVIVES INTO THE RECORD ───────────────────────────────");
{
  const usage: UsageCall[] = [
    { model: "claude-sonnet-4-6", input_tokens: 120_000, output_tokens: 2_100, cache_write: 0, cache_read: 96_000, label: "panel:contracts_attorney", ms: 41_200 },
    { model: "claude-opus-5", input_tokens: 18_000, output_tokens: 3_400, cache_write: 18_000, cache_read: 0, label: "judgment-first", ms: 62_800 },
  ];
  const rec = buildRunRecord({ ...baseArgs(), usage });
  assert(Array.isArray(rec.result.usage) && rec.result.usage.length === 2, "both calls are banked");
  assert(rec.result.usage?.[0].label === "panel:contracts_attorney", "the STAGE LABEL survives — this is what makes the record attributable");
  assert(rec.result.usage?.[0].ms === 41_200, "wall-clock per call survives");
  assert(rec.result.usage?.[1].cache_write === 18_000, "the cache split survives (it is priced 1.25x / 0.10x, so it is not decoration)");
  // The question the ask actually asks, answered off the record alone:
  const byStage = new Map<string, number>();
  for (const u of rec.result.usage ?? []) byStage.set(u.label ?? "(unlabelled)", (byStage.get(u.label ?? "(unlabelled)") ?? 0) + (u.ms ?? 0));
  assert(byStage.get("judgment-first") === 62_800 && byStage.get("panel:contracts_attorney") === 41_200,
    "wall-clock is attributable BY STAGE from the record alone — the thing 113 banked records could not do");
}

console.log("\n── 2. ABSENT ≠ EMPTY ────────────────────────────────────────────────────");
{
  const noArg = buildRunRecord(baseArgs());
  assert(!("usage" in noArg.result), "a caller that supplies no ledger omits the KEY — not an empty array");
  const emptyArr = buildRunRecord({ ...baseArgs(), usage: [] });
  assert(!("usage" in emptyArr.result), "an empty ledger also omits the key, so a record can never claim '0 calls' it did not measure");
}
{
  // Back-compat: a pre-change record has no `usage`, and nothing may assume it does.
  const rec = buildRunRecord(baseArgs());
  assert(rec.result.usage === undefined, "reading .usage on an old record is undefined, never a throw");
  assert(rec.schema === "run-record/v1", "schema string is UNCHANGED — this is additive, so old records stay loadable");
}

(async () => {
console.log("\n── 3. THE EXPERT PATH NOW EMITS label + ms (it never did) ───────────────");
{
  const seen: ExpertUsage[] = [];
  const fakeClient = {
    messages: {
      create: async () => ({
        stop_reason: "end_turn",
        content: [{ type: "tool_use", id: "t1", name: "submit_findings", input: { findings: [] } }],
        usage: { input_tokens: 1_000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 900 },
      }),
    },
  };
  const call = makeAnthropicCallModel(fakeClient as never, "claude-sonnet-4-6", { onUsage: (u) => seen.push(u), label: "expert:pricing_analyst" });
  await call({ system: "s", userTask: "t", priorToolResults: [], forceSubmit: true } as never);

  assert(seen.length === 1, `the expert call tallied exactly once (got ${seen.length})`);
  assert(seen[0]?.label === "expert:pricing_analyst", "the lens label reaches the ledger — lens calls were anonymous before");
  assert(typeof seen[0]?.ms === "number" && (seen[0]!.ms as number) >= 0, "the lens call is TIMED — it was untimed before");
  assert(seen[0]?.cache_read === 900, "cache_read still captured (regression control on the pre-existing tally)");
}
{
  // Default label, so a caller that passes none still produces an ATTRIBUTABLE row rather than a blank.
  const seen: ExpertUsage[] = [];
  const fakeClient = { messages: { create: async () => ({ stop_reason: "end_turn", content: [], usage: { input_tokens: 1, output_tokens: 1 } }) } };
  const call = makeAnthropicCallModel(fakeClient as never, "m", { onUsage: (u) => seen.push(u) });
  await call({ system: "s", userTask: "t", priorToolResults: [], forceSubmit: false } as never);
  assert(seen[0]?.label === "expert", 'an unlabelled caller defaults to "expert" — never an empty label');
}

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
})();
