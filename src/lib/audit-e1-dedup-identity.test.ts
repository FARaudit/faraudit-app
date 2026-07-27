// ARC #747 · E1 — DEDUP IDENTITY SURVIVES HEAD RE-GROUNDING.
// Run: npx tsx src/lib/audit-e1-dedup-identity.test.ts
//
// /code-review high finding #5 on PR #292: `dedupeByExcerpt` keys on the first 120 normalized chars of the
// excerpt — exactly the region the head pass rewrites. Two findings from one clause, previously distinct,
// widen back to the same clause start, collide, and the merge keeps the survivor's `cite` while DISCARDING
// the loser's requirement. An obligation leaves the customer's report. Same class as PR #293.
//
// This suite proves the whole chain, not the unit: TypedFinding → buildV3Payload/lite → mapFinding →
// dedupeByExcerpt. A first version of the fix keyed on a field `lite()` silently dropped, so `keyExcerpt`
// always equalled `excerpt` and the fix was INERT while every assertion passed. The chain is the test.
export {};
import { buildV3Payload } from "./audit-v3-report";
import { buildV4Data } from "./v4-report/build-data";
import type { Decision } from "./audit-decide";

// PRODUCTION FLAG STATE, not a convenient one. `dedupeByExcerpt` runs only when AUDIT_SEVERITY_HONEST is on
// (build-data.ts:179). Verified live on Vercel production 2026-07-27: AUDIT_SEVERITY_HONEST = true. The first
// run of this suite left it unset, the control case did not collapse, and the defect looked unreachable —
// a proof-shape that was not production-shaped. [[feedback_proof_shape_production_ctx]]
process.env.AUDIT_SEVERITY_HONEST = "true";

let failures = 0;
const check = (name: string, ok: boolean, extra?: string) => {
  console.log(`${ok ? "✅" : "❌"} ${name}${!ok && extra ? `\n     ${extra}` : ""}`);
  if (!ok) failures++;
};

// Two DISTINCT obligations from one clause. Their own excerpts differ; widened to the clause start they
// share their first 120 chars.
const CLAUSE_HEAD = "The Contractor shall submit, in accordance with the schedule set forth in Section F of this contract and the delivery terms stated therein, ";
const A_TAIL = "a monthly progress report describing work completed during the reporting period.";
const B_TAIL = "a quarterly cost report reconciling incurred cost against the negotiated baseline.";

const mk = (requirement: string, excerpt: string, preReground?: string) => ({
  requirement, citation: "Section F", excerpt, kind: "submission_mechanic",
  controllability: "bidder_controls", severity: "P1" as const,
  ...(preReground ? { excerptPreReground: preReground } : {}),
});

const decision = { verdict: "BID_WITH_CAUTION", eligible: true, reason: "r", dispositions: [], showStoppers: [] } as unknown as Decision;
const coverage = { required: [], covered: [], missing: [], coreMissing: [] };
const build = (findings: ReturnType<typeof mk>[]) =>
  buildV4Data({ compliance_json: { v3: buildV3Payload(decision, coverage, findings, "2026-07-27T00:00:00Z"), engine: "agentic_v3" } } as never);

const reqs = (d: ReturnType<typeof build>) =>
  [...(d.findings.p0 ?? []), ...(d.findings.p1 ?? []), ...(d.findings.p2 ?? []), ...(d.findings.unrated ?? [])].map((f) => f.req);

// ── 1. BEFORE widening: two distinct rows, as today ──
{
  const out = build([mk("Submit the monthly progress report.", A_TAIL), mk("Submit the quarterly cost report.", B_TAIL)]);
  const r = reqs(out);
  check("un-widened · both obligations render", r.length === 2, JSON.stringify(r));
}

// ── 2. WIDENED, with the analyzed span carried: still two rows ──
{
  const out = build([
    mk("Submit the monthly progress report.", CLAUSE_HEAD + A_TAIL, A_TAIL),
    mk("Submit the quarterly cost report.", CLAUSE_HEAD + B_TAIL, B_TAIL),
  ]);
  const r = reqs(out);
  check("widened · BOTH obligations still render (identity keyed on the analyzed span)", r.length === 2, JSON.stringify(r));
  check("widened · the quarterly-cost obligation is not the one that vanished", r.some((x) => /quarterly cost/i.test(x)), JSON.stringify(r));
}

// ── 3. THE REGRESSION ITSELF: widened WITHOUT the analyzed span → collision, an obligation is lost ──
// This asserts the defect the fix removes. If this ever stops collapsing, the dedup key changed and the
// fix above is no longer load-bearing — which is exactly when someone should re-read it.
{
  const out = build([
    mk("Submit the monthly progress report.", CLAUSE_HEAD + A_TAIL),
    mk("Submit the quarterly cost report.", CLAUSE_HEAD + B_TAIL),
  ]);
  const r = reqs(out);
  check("control · without the analyzed span the two DO collapse (this is the defect)", r.length === 1, JSON.stringify(r));
}

// ── 4. The field actually survives persistence — the check that would have caught the inert first fix ──
{
  const payload = buildV3Payload(decision, coverage, [mk("x", CLAUSE_HEAD + A_TAIL, A_TAIL)], "2026-07-27T00:00:00Z");
  check("lite() carries excerptPreReground into the persisted payload",
    (payload.findings[0] as { excerptPreReground?: string }).excerptPreReground === A_TAIL,
    JSON.stringify(payload.findings[0]));
  const clean = buildV3Payload(decision, coverage, [mk("x", A_TAIL)], "2026-07-27T00:00:00Z");
  check("…and OMITS the key entirely when the head pass did not widen (flag-OFF byte-identical)",
    !("excerptPreReground" in (clean.findings[0] as object)));
}

console.log(failures === 0 ? "\nPASS — dedup identity survives head re-grounding\n" : `\nFAIL — ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);
