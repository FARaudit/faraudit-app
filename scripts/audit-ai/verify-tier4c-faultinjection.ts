// Tier 4C — FAULT-INJECTION harness for the 4 edge-path fixes a clean run won't trip.
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/verify-tier4c-faultinjection.ts
//
// A happy-path audit never exercises these degraded conditions, so the Tier-0/1 gates
// couldn't observe them under fault. This harness INJECTS the fault into the REAL engine
// functions and asserts the fix fires:
//   T0-3  max_tokens clip on attempt-1 (with valid submit_findings) + attempt-2 narrates
//         → attempt-1 findings are KEPT, not discarded (real makeAnthropicCallModel + mock SDK).
//   T0-4  TOTAL skeptic outage on a >12 all-informational set → run NOT sound → NHR
//         (real makeBatchedSkeptic → makeAgenticVerifier; the fix rethrows on !anySucceeded).
//   T0-5  an UNVERIFIED informational finding is EXCLUDED from the claim/verdict set
//         (real excludeUnverifiedInformational).
//   T1-8  passed-deadline NO-BID softening — a PURE PROMPT fix; not deterministically
//         fault-injectable (needs a live model to type the finding). Covered by its $0 prompt
//         gate (verify-tier1-lenses) + rides the real docx run. Reported as SKIP here, honestly.

import { makeAnthropicCallModel } from "@/lib/audit-expert";
import { makeAgenticVerifier, makeBatchedSkeptic, type SkepticFn } from "@/lib/audit-verifier";
import { excludeUnverifiedInformational } from "@/lib/audit-orchestrator";
import type { AuditToolContext } from "@/lib/audit-tools";
import type { TypedFinding } from "@/lib/audit-findings";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { cond ? pass++ : fails.push(label); };
const eq = (label: string, got: unknown, exp: unknown) => { JSON.stringify(got) === JSON.stringify(exp) ? pass++ : fails.push(`${label}: got ${JSON.stringify(got)} exp ${JSON.stringify(exp)}`); };

(async () => {
  // ── T0-3 · max_tokens clip keeps attempt-1 findings (real callModel + fault-injected SDK) ──
  const A1_FINDINGS = [{ requirement: "R", citation: "§C", excerpt: "x", kind: "technical_spec", controllability: "bidder_controls" }];
  let call = 0;
  const faultSDK = { messages: { create: async (req: Record<string, unknown>) => {
    call++;
    // attempt-1: valid submit_findings BUT clipped (max_tokens). attempt-2 (retry@8k): narrates, NO submit.
    return call === 1
      ? { content: [{ type: "tool_use", id: "t1", name: "submit_findings", input: { findings: A1_FINDINGS } }], stop_reason: "max_tokens", usage: { input_tokens: 1, output_tokens: 1 } }
      : { content: [{ type: "text", text: "Let me reconsider…" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };
  } } };
  const cm = makeAnthropicCallModel(faultSDK as never, "m", { maxTokens: 4096 });
  const out = await cm({ system: "s", userTask: "u", priorToolResults: [], forceSubmit: true });
  ok("T0-3 R1: the retry ran (attempt-1 max_tokens → attempt-2)", call === 2);
  eq("T0-3 R2: attempt-1's clipped-but-valid findings are KEPT (not discarded for the narrating retry)", out.findings?.length, 1);
  eq("T0-3 R3: the kept finding is attempt-1's", (out.findings?.[0] as { requirement?: string })?.requirement, "R");

  // ── T0-4 · total skeptic outage on a >12 all-informational set → NOT sound (real verifier) ──
  const SRC = Array.from({ length: 13 }, (_, i) => `boilerplate clause ${i} text here`).join("\n");
  const ctx = { fullSource: SRC } as AuditToolContext;
  const informational: TypedFinding[] = Array.from({ length: 13 }, (_, i) => ({
    requirement: `bp ${i}`, citation: "§I", excerpt: `boilerplate clause ${i} text here`,
    kind: "boilerplate", controllability: "bidder_controls", grounded: true, lens: "contracts_attorney", id: `f${i}`,
  }));
  const throwingBase: SkepticFn = async () => { throw new Error("skeptic API 503 — total outage"); };
  const prevBatch = process.env.AUDIT_VERIFIER_BATCHING; process.env.AUDIT_VERIFIER_BATCHING = "true"; // residue doctrine ON (the fail-open surface)
  try {
    const verify = makeAgenticVerifier(makeBatchedSkeptic(throwingBase, { batchSize: 12, retries: 1 }));
    const res = await verify(ctx, informational, { bidderProfile: null });
    ok("T0-4 R4: grounded set is >12 (batched path)", informational.length > 12);
    eq("T0-4 R5: a TOTAL skeptic outage on a >12 all-informational set → NOT sound (was fail-open sound=true)", res.sound, false);
  } finally { if (prevBatch === undefined) delete process.env.AUDIT_VERIFIER_BATCHING; else process.env.AUDIT_VERIFIER_BATCHING = prevBatch; }

  // control: a PARTIAL outage (base succeeds) must NOT be forced unsound by the T0-4 rethrow
  const upholdAll: SkepticFn = async (_c, fs) => fs.map((_f, i) => ({ index: i, upheld: true, reason: "ok" }));
  const okRes = await makeAgenticVerifier(makeBatchedSkeptic(upholdAll, { batchSize: 12 }))(ctx, informational, { bidderProfile: null });
  eq("T0-4 R6: a fully-ruled >12 set stays sound (rethrow only fires on TOTAL outage)", okRes.sound, true);

  // ── T0-5 · an unverified informational finding is excluded from the claim/verdict set ──
  const verified: TypedFinding = { requirement: "kept", citation: "§C", excerpt: "y", kind: "technical_spec", controllability: "bidder_controls", grounded: true, lens: "capture_strategist", id: "v1" };
  const unver: TypedFinding = { requirement: "residue", citation: "§I", excerpt: "z", kind: "boilerplate", controllability: "bidder_controls", grounded: true, lens: "contracts_attorney", id: "u1", unverified: true };
  const part = excludeUnverifiedInformational([verified, unver]);
  eq("T0-5 R7: the unverified finding is EXCLUDED from claims", part.kept.map((f) => f.id), ["v1"]);
  eq("T0-5 R8: it is RETAINED in `excluded` for telemetry (not silently vanished)", part.excluded.map((f) => f.id), ["u1"]);
  eq("T0-5 R9: with no unverified findings, the set is returned untouched", excludeUnverifiedInformational([verified]).kept.map((f) => f.id), ["v1"]);

  console.log(`\nTier4C fault-injection (T0-3 · T0-4 · T0-5): ${pass}/${pass + fails.length} PASS`);
  console.log("→ T1-8 (passed-deadline NO-BID) = SKIP here: pure prompt fix, not deterministically injectable; covered by verify-tier1-lenses + the real docx run.");
  if (fails.length) { console.error("FAILS:\n" + fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
})();
