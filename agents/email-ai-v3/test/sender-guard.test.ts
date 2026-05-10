import assert from "node:assert";
import { isUnreplyable, isStale } from "../src/sender-guard";

let passed = 0;
let failed = 0;

function check(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${label}`);
  }
}

// ────────────────────────────────────────────────────────────
// Should be flagged as unreplyable (12 cases)
// ────────────────────────────────────────────────────────────
const flagged = [
  "notifications@vercel.com",
  "hello@notify.railway.app",
  "no-reply@accounts.google.com",
  "jobs-noreply@linkedin.com",
  "workspace-noreply@google.com",
  "payments-noreply@google.com",
  "mailer-daemon@googlemail.com",
  "forwarding-noreply@google.com",
  "team@m.ngrok.com",
  "reply@email.linkedin.com",
  "newsletter@news.substack.com",
  "bounce@mailer.example.com",
];
for (const e of flagged) {
  check(isUnreplyable(e), `should flag ${e}`);
}

// ────────────────────────────────────────────────────────────
// Should NOT be flagged — legit human or monitored helpdesk (8 cases)
// ────────────────────────────────────────────────────────────
const ok = [
  "jose@faraudit.com",
  "john.kratzert@snoe.com",
  "rachel.prevost@valmark.com",
  "atlas@stripe.com",
  "jose@bullrize.com",
  "support@usestable.com",
  "support@anthropic.com",
  "help@github.com",
];
for (const e of ok) {
  check(!isUnreplyable(e), `should NOT flag ${e}`);
}

// ────────────────────────────────────────────────────────────
// Stale check (2 cases)
// ────────────────────────────────────────────────────────────
const old = new Date(Date.now() - 5 * 86_400_000);
const fresh = new Date(Date.now() - 1 * 86_400_000);
check(isStale(old, 3), "should flag 5d old as stale");
check(!isStale(fresh, 3), "should NOT flag 1d old as stale");

// ────────────────────────────────────────────────────────────
// Defensive cases
// ────────────────────────────────────────────────────────────
check(isUnreplyable(""), "empty string should be flagged (defensive)");
check(isUnreplyable(null), "null should be flagged (defensive)");
check(isUnreplyable(undefined), "undefined should be flagged (defensive)");
check(!isStale(null, 3), "null lastMessageDate should NOT be stale");

if (failed === 0) {
  console.log(`All sender-guard tests passed (${passed}/${passed})`);
  process.exit(0);
} else {
  console.error(`${failed} test(s) failed (${passed} passed)`);
  // Use assert to set non-zero exit for CI
  assert.strictEqual(failed, 0, `${failed} test(s) failed`);
}
