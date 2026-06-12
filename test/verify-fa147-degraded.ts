// FA-147 gate — no silently degraded runs on Anthropic 5xx.
// Run: set -a && source <(grep -E "^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SAM_API_KEY|ANTHROPIC_API_KEY)=" .env.local) && set +a && npx tsx test/verify-fa147-degraded.ts
//
// Layers:
//   T1 — withAnthropicRetry: simulated 503 → 3 attempts with backoff → typed
//        AnthropicTransientError; transient-then-ok recovers; non-transient
//        throws immediately (no retry burn on real errors).
//   T2 — classifier: every real-world signature routes as transient, incl.
//        the literal a794ca3b incident message and the engine's labeled
//        "[call:risks] Claude API 503" format.
//   T3 — shape gate: thin payload (collapsed call output) refused; the REAL
//        stored audit 8aa2bab9 (FA460026Q0047, full three-call shape) passes.
//   T4 — worker failure routing: transient/degraded → release, generic → fail.

process.env.WORKER_SOURCE = "fa147_test"; // worker module import safety — no claims made in this suite

import { withAnthropicRetry, isAnthropicTransient, AnthropicTransientError } from "../src/lib/anthropic-files";
import { assertMinimumAuditShape, DegradedRunError } from "../src/lib/audit-executor";

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  console.log(`${cond ? "PASS" : "FAIL"} · ${name}${cond ? "" : " — " + detail}`);
  if (!cond) failures++;
}

async function main(): Promise<void> {
  // ── T1 · retry mechanics (backoff stubbed to 1ms for test speed) ───────────
  let calls = 0;
  const backoffs: number[] = [];
  const fakeBackoff = (a: number) => { backoffs.push(a); return 1; };

  calls = 0;
  let caught: unknown = null;
  try {
    await withAnthropicRetry(async () => { calls++; throw Object.assign(new Error("File storage is temporarily unavailable"), { status: 503 }); }, "t1-exhaust", fakeBackoff);
  } catch (e) { caught = e; }
  check("T1a 503 exhaust → 3 attempts", calls === 3, `calls=${calls}`);
  check("T1b backoff fired between attempts (1,2)", backoffs.join(",") === "1,2", backoffs.join(","));
  check("T1c typed AnthropicTransientError thrown", caught instanceof AnthropicTransientError, String(caught));
  check("T1d exhaust message carries label + cause", String((caught as Error).message).includes("t1-exhaust") && /temporarily unavailable/i.test(String((caught as Error).message)));

  calls = 0;
  const ok = await withAnthropicRetry(async () => { calls++; if (calls === 1) throw Object.assign(new Error("overloaded_error"), { status: 529 }); return "recovered"; }, "t1-recover", fakeBackoff);
  check("T1e transient-then-ok recovers on attempt 2", ok === "recovered" && calls === 2, `calls=${calls}`);

  calls = 0;
  caught = null;
  try {
    await withAnthropicRetry(async () => { calls++; throw new Error("400 invalid_request_error: file too large"); }, "t1-nontransient", fakeBackoff);
  } catch (e) { caught = e; }
  check("T1f non-transient throws immediately, no retry", calls === 1 && !(caught instanceof AnthropicTransientError), `calls=${calls}`);

  // ── T2 · classifier signatures ─────────────────────────────────────────────
  check("T2a a794ca3b incident message", isAnthropicTransient(new Error("503 File storage is temporarily unavailable (req_011CbxWBdybSbfPpWgKyis46)")));
  check("T2b engine raw-fetch format", isAnthropicTransient(new Error("Claude API 503: upstream connect error")));
  check("T2c labeled engine format", isAnthropicTransient(new Error("[call:risks] Claude API 529: overloaded")));
  check("T2d SDK status field", isAnthropicTransient(Object.assign(new Error("Service unavailable"), { status: 529 })));
  check("T2e typed error", isAnthropicTransient(new AnthropicTransientError("x")));
  check("T2f overloaded_error type", isAnthropicTransient(new Error('{"type":"overloaded_error","message":"Overloaded"}')));
  check("T2g SAM 404 is NOT transient", !isAnthropicTransient(new Error("SAM fetch failed: 404 Not Found")));
  check("T2h generic engine error is NOT transient", !isAnthropicTransient(new Error("[call:overview] Claude API 400: invalid request")));

  // ── T3 · shape gate: thin refused, real audit passes ───────────────────────
  let thin: unknown = null;
  try { assertMinimumAuditShape({ overview: { json: { a: 1 } }, compliance: { json: { b: 2 } }, risks: { json: {} } }); } catch (e) { thin = e; }
  check("T3a collapsed risks output refused", thin instanceof DegradedRunError && /\brisks\b/.test(String((thin as Error).message)), String(thin));
  thin = null;
  try { assertMinimumAuditShape({ overview: { json: null }, compliance: { json: null }, risks: { json: null } }); } catch (e) { thin = e; }
  check("T3b fully collapsed run lists all three calls", thin instanceof DegradedRunError && ["overview", "compliance", "risks"].every((c) => String((thin as Error).message).includes(c)));

  const h = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` };
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/audits?id=eq.8aa2bab9-485b-4abb-ad4e-70681380bdf0&select=overview_json,compliance_json,risks_json`, { headers: h });
  const [real] = await r.json();
  let realErr: unknown = null;
  try {
    assertMinimumAuditShape({ overview: { json: real.overview_json }, compliance: { json: real.compliance_json }, risks: { json: real.risks_json } });
  } catch (e) { realErr = e; }
  check("T3c real stored audit 8aa2bab9 passes the floor", realErr === null, String(realErr));

  // ── T4 · worker failure routing ────────────────────────────────────────────
  const worker = await import("../agents/audit-worker/worker");
  check("T4a DegradedRunError → release", worker.decideRunFailureMode(new DegradedRunError("degraded_run_shape: x")) === "release");
  check("T4b AnthropicTransientError → release", worker.decideRunFailureMode(new AnthropicTransientError("y")) === "release");
  check("T4c labeled engine 503 → release", worker.decideRunFailureMode(new Error("[call:compliance] Claude API 503: dip")) === "release");
  check("T4d generic error → fail", worker.decideRunFailureMode(new Error("missing audit_id attribution")) === "fail");
  check("T4e SAM 404 → fail", worker.decideRunFailureMode(new Error("SAM fetch failed: 404")) === "fail");

  console.log(failures === 0 ? "\nFA-147 gate: ALL PASS" : `\nFA-147 gate: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("FA-147 gate crashed:", e.message); process.exit(2); });
