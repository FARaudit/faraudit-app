// Plain-assert tests (consistent with sender-guard.test.ts pattern).
// Run via: npx ts-node test/deterministic.test.ts

import assert from "node:assert";
import { classifyDeterministic } from "../src/deterministic";
import type { EmailMeta } from "../src/types";

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

function meta(o: Partial<EmailMeta>): EmailMeta {
  return {
    threadId: "t1",
    senderEmail: "test@example.com",
    senderName: "Test",
    recipient: "jose@faraudit.com",
    subject: "test",
    snippet: "test",
    date: new Date().toISOString(),
    ageDays: 0,
    hasReply: false,
    ...o,
  };
}

// ─── Step A — self-forward ───
{
  const r = classifyDeterministic(meta({
    senderEmail: "jose@bullrize.com",
    recipient: "jose@faraudit.com",
  }));
  check(r?.urgency === "REFERENCE", "Step A: self-domain → self-domain → REFERENCE");
  check(r?.domain === "ATLAS_LEGAL", "Step A: self-forward gets ATLAS_LEGAL domain");
  check(r?.rule_matched === "step_a_self_forward", "Step A: rule_matched correct");
}
{
  const r = classifyDeterministic(meta({
    senderEmail: "jose@faraudit.com",
    recipient: "external@example.com",
  }));
  check(r?.urgency === "ARCHIVE", "Step A: self → external → ARCHIVE");
  check(r?.rule_matched === "step_a_outbound", "Step A: outbound rule matched");
}

// ─── Step B — personal Gmail ───
{
  const r = classifyDeterministic(meta({
    senderEmail: "jar3006@gmail.com",
    subject: "Test Email",
    snippet: "Hey Jose, can we sync on Frank Burch tomorrow afternoon?",
  }));
  check(r?.urgency === "ARCHIVE", "Step B: jar3006@gmail.com → ARCHIVE (Frank Burch test)");
  check(r?.rule_matched === "step_b_personal", "Step B: rule_matched=step_b_personal");
  check(r?.draft_recommended === false, "Step B: no draft for personal");
}

// ─── Step C — negative prospects ───
{
  const r = classifyDeterministic(meta({ senderEmail: "fsandin@every.io" }));
  check(r?.urgency === "ARCHIVE", "Step C: every.io → ARCHIVE");
  check(r?.rule_matched === "step_c_negative", "Step C: negative-prospect rule matched");
}

// ─── Step D — stable mailbox split ───
{
  const r = classifyDeterministic(meta({ senderEmail: "priority@usestable.com" }));
  check(r?.urgency === "NOW", "Step D: priority@usestable → NOW");
  check(r?.domain === "INFRA", "Step D: stable gets INFRA domain");
}
{
  const r = classifyDeterministic(meta({ senderEmail: "mailroom@email.usestable.com" }));
  check(r?.urgency === "THIS_WEEK", "Step D: mailroom → THIS_WEEK");
}
{
  const r = classifyDeterministic(meta({ senderEmail: "collin.pham@email.usestable.com" }));
  check(r?.urgency === "ARCHIVE", "Step D: collin.pham → ARCHIVE");
}

// ─── Step E — atlas/legal ───
{
  const r = classifyDeterministic(meta({
    senderEmail: "atlas@stripe.com",
    subject: "Your 83(b) election was successfully filed",
  }));
  check(r?.urgency === "REFERENCE", "Step E: 83(b) filed → REFERENCE");
  check(r?.domain === "ATLAS_LEGAL", "Step E: ATLAS_LEGAL domain");
}
{
  const r = classifyDeterministic(meta({
    senderEmail: "atlas@stripe.com",
    subject: "Verify your email to use Stripe Atlas",
  }));
  check(r?.urgency === "NOW", "Step E: verify email → NOW");
  check(r?.domain === "ATLAS_LEGAL", "Step E: urgent ATLAS_LEGAL domain");
}
{
  const r = classifyDeterministic(meta({
    senderEmail: "no-reply@accounts.google.com",
    subject: "Security alert",
  }));
  check(r?.urgency === "NOW", "Step E: Google security alert → NOW");
}

// ─── Step F — infra ───
{
  const r = classifyDeterministic(meta({
    senderEmail: "hello@notify.railway.app",
    subject: "Deployment crashed for Audit-AI in responsible-perfection!",
  }));
  check(r?.urgency === "NOW", "Step F: Railway crash → NOW");
  check(r?.domain === "INFRA", "Step F: INFRA domain");
}
{
  const r = classifyDeterministic(meta({
    senderEmail: "notifications@vercel.com",
    subject: "Deployment status update",
  }));
  check(r?.urgency === "THIS_WEEK", "Step F: Vercel non-crash → THIS_WEEK");
}

// ─── Step G — unreplyable ───
{
  const r = classifyDeterministic(meta({
    senderEmail: "invitations@linkedin.com",
    subject: "You have an invitation",
  }));
  check(r?.urgency === "ARCHIVE", "Step G: LinkedIn invite → ARCHIVE");
  check(r?.rule_matched === "step_g_unreplyable", "Step G: unreplyable rule matched");
}

// ─── Step H — positive prospects ───
{
  const r = classifyDeterministic(meta({
    senderEmail: "frank.burch@snoeinc.com",
    senderName: "Frank Burch",
  }));
  check(r?.urgency === "NOW", "Step H: Frank Burch from snoeinc → NOW");
  check(r?.domain === "PROSPECT", "Step H: PROSPECT domain");
  check(r?.draft_recommended === true, "Step H: draft recommended for prospect");
}
{
  // Stale prospect (>3d) → THIS_WEEK
  const r = classifyDeterministic(meta({
    senderEmail: "frank.burch@snoeinc.com",
    senderName: "Frank Burch",
    ageDays: 5,
  }));
  check(r?.urgency === "THIS_WEEK", "Step H: stale prospect → THIS_WEEK (not NOW)");
}

// ─── Step I — escalate to LLM (returns null) ───
{
  const r = classifyDeterministic(meta({
    senderEmail: "unknown@randomdomain.com",
    senderName: "Random Person",
  }));
  check(r === null, "Step I: unknown sender → null (escalate to LLM)");
}

// ─── Company tag derivation ───
{
  const r = classifyDeterministic(meta({
    senderEmail: "jose@faraudit.com",
    recipient: "test@external.com",
  }));
  check(r?.company === "FARaudit", "Company: jose@faraudit.com → FARaudit");
}
{
  const r = classifyDeterministic(meta({
    senderEmail: "atlas@stripe.com",
    recipient: "jose@bullrize.com",
    subject: "Verify your email to use Stripe Atlas",
  }));
  check(r?.company === "Bullrize", "Company: recipient bullrize.com → Bullrize");
}

if (failed === 0) {
  console.log(`All deterministic tests passed (${passed}/${passed})`);
  process.exit(0);
} else {
  console.error(`${failed} test(s) failed (${passed} passed)`);
  assert.strictEqual(failed, 0, `${failed} test(s) failed`);
}
