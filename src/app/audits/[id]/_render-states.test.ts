// FAILED-PAGE ERROR CLASSIFICATION — Brain card #612-(2).
// A stall / infra failure must render the retry-forward failed page, NEVER a
// verdict-style surface and NEVER the alarming generic "hit an unexpected error"
// default. The overall-budget stall message (audit-executor.ts withBudget) is the
// canonical case: it previously matched no classifyError branch and fell to the
// default. This suite pins every stall/infra message to the transient-timeout
// class and guards the other branches against regression.
// Run: npx tsx src/app/audit/[id]/_render-states.test.ts
import { classifyError } from "./_render-states";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

// ── the canonical stall message (audit-executor.ts:281) ──────────────────────
for (const budget of [270, 360]) {
  const msg = `agentic V3 primary overall budget (${budget}s) exceeded — engine stalled`;
  const c = classifyError(msg);
  assert(/ran out of time/i.test(c.headline), `stall(${budget}s): retry-forward headline, not the generic default`);
  assert(!/unexpected error/i.test(c.headline + c.explainer), `stall(${budget}s): never the alarming "unexpected error" copy`);
  assert(/retrying the audit usually succeeds/i.test(c.explainer), `stall(${budget}s): explainer is retry-forward`);
  assert(/nothing below is a result|no verdict was scored/i.test(c.explainer), `stall(${budget}s): explainer says nothing rendered is a verdict`);
  assert(c.ledeRetrievalAccurate === false, `stall(${budget}s): lede not retrieval-accurate (stopped mid-analysis, not pre-retrieval)`);
  assert(c.failedStage === "02 — Engine analysis", `stall(${budget}s): stage = engine analysis`);
}

// ── infra 5xx / socket / network that slipped past the engine-call branch ──
// 5xx tokens are HTTP-anchored or phrase-anchored (NOT a bare number) so a
// permanent failure carrying a 50x as DATA is not mis-routed here.
for (const msg of [
  "upstream returned HTTP 502",
  "HTTP503 from gateway",
  "502 Bad Gateway",
  "503 Service Unavailable",
  "504 Gateway Timeout",     // caught by the "timeout" token
  "read ECONNRESET",
  "socket hang up",
  "network error while contacting the model",
  "run aborted",
  "operation timed out",
]) {
  const c = classifyError(msg);
  assert(/ran out of time/i.test(c.headline), `infra "${msg}" → transient stall class`);
}

// ── a bare, delimited 50x that is DATA in a permanent failure must NOT route to
// the retry-forward stall page (the tightened-regex guard) ──
for (const msg of [
  "assertion failed: expected 504 findings, got 502",
  "invalid magnitude $503,000 in CLIN 0001",
  "SPRS score 502 is below the required floor",
]) {
  const c = classifyError(msg);
  assert(!/ran out of time/i.test(c.headline), `data-50x "${msg}" → NOT mis-routed to stall class`);
}

// ── SAM-side fetch stall (its own time budget) → RETRIEVAL branch, stage 01 ──
for (const msg of [
  "SAM PDF fetch exceeded its total time budget",
  "SAM fetch exceeded its total time budget",
]) {
  const c = classifyError(msg);
  assert(/could not be retrieved from SAM\.gov/i.test(c.headline), `SAM stall "${msg}" → retrieval branch (stage 01)`);
  assert(c.ledeRetrievalAccurate === true, `SAM stall "${msg}" → retrieval-accurate lede`);
}

// ── the specific branches must still win (ordering / precedence guards) ──────
{
  const c = classifyError("[call:compliance] Claude API 400: prompt is too long — 1,140,674 tokens > 1,000,000 max");
  assert(/too large/i.test(c.headline), "prompt-too-long: size branch wins over the stall/infra branch (contains no stall tokens)");
  assert(/not a transient error/i.test(c.explainer), "prompt-too-long: honestly NOT transient (retry hits the same wall)");
}
{
  const c = classifyError("[call:risks] Claude API 529: model overloaded");
  assert(/transient error during analysis/i.test(c.headline), "engine-call 529: transient engine branch (checked before stall)");
}
{
  const c = classifyError("SAM.gov returned HTTP 403 for the attachment download");
  assert(/could not be retrieved from SAM\.gov/i.test(c.headline), "SAM 403: retrieval branch");
  assert(c.ledeRetrievalAccurate === true, "SAM 403: lede IS retrieval-accurate");
}
{
  const c = classifyError("TypeError: cannot read properties of undefined");
  assert(/stopped before a verdict was produced/i.test(c.headline), "unknown error: generic default (no stall/infra tokens)");
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
