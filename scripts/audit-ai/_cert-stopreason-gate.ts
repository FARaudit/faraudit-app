// Current-arc acceptance — the stop_reason HARD-GATE on the skeptic path (already in code; card #596/Brain).
// Proves parseSkepticResponse REFUSES a truncated (max_tokens) skeptic response by throwing — so a truncation
// becomes a hard, diagnosable skeptic_throw (→ R1 ledger throwMessage) instead of a silently-parsed partial
// verdict set that would leave anonymous residue. Chains with _cert-r1-verifier-ledger.ts (skeptic_throw case).
import { parseSkepticResponse } from "../../src/lib/audit-package";
let fail = 0; const ok = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fail++; };

// (1) max_tokens truncation → THROW (refuse partial), message names the cause → carried into R1 ledger.throwMessage
try {
  parseSkepticResponse({ text: '{"verdicts":[{"index":0,"upheld":true,"reason":"ok"}', stopReason: "max_tokens" }, "test-model");
  ok(false, "max_tokens skeptic response should THROW (it did not)");
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  ok(/max_tokens|truncat/i.test(msg), `max_tokens → throw with a truncation-named message (got: "${msg.slice(0, 70)}")`);
}

// (2) clean end_turn response → parses normally (no false throw)
try {
  const r = parseSkepticResponse({ text: '{"verdicts":[{"index":0,"upheld":true,"reason":"ok"}]}', stopReason: "end_turn" }, "test-model");
  ok(Array.isArray(r.verdicts) && r.verdicts.length === 1, "clean end_turn → parses 1 verdict (no false gate)");
} catch (e) { ok(false, `clean response should NOT throw (got: ${e instanceof Error ? e.message : e})`); }

// (3) missing verdicts[] → THROW (no empty-swallow)
try { parseSkepticResponse({ text: "{}", stopReason: "end_turn" }, "test-model"); ok(false, "missing verdicts[] should THROW"); }
catch { ok(true, "missing verdicts[] → throw (no empty-swallow)"); }

console.log(fail ? `\n❌ ${fail} FAILURE(S)` : "\n✅ STOP-REASON GATE CERT PASS — truncation is a hard, diagnosable failure");
process.exit(fail ? 1 : 0);
