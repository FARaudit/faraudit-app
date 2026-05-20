// FA-96 verification: replay the 3 known-bad subjects through the tuned extractor.
// Expected after patch:
//   bank account block  → digest_p0_block (still — it's a real action-required email)
//   Google sign-in      → none (downgraded from digest_p0_block)
//   Stripe pw updated   → none (downgraded from digest_p0_block)
import { extractAction } from "../src/action-extractor";
import type { EmailMeta, ClassificationResult } from "../src/types";

const baseMeta = {
  threadId: "test-thread",
  senderName: "Test Sender",
  recipient: "jose@faraudit.com",
  date: new Date().toISOString(),
  ageDays: 0,
  hasReply: false,
};

const baseClass: ClassificationResult = {
  urgency: "NOW",
  domain: null,
  company: "FARaudit",
  confidence: 0.85,
  reasoning: "Replay test fixture",
  bypassLLM: false,
  stage: "llm",
  draft_recommended: false,
};

const cases: Array<{ label: string; expected: string; meta: EmailMeta }> = [
  {
    label: "Stripe bank account block (action 1) — should STAY digest_p0_block",
    expected: "digest_p0_block",
    meta: {
      ...baseMeta,
      senderEmail: "support@stripe.com",
      subject: "[Action required] Provide a valid bank account for FARaudit Inc.",
      snippet:
        "Hi FARaudit team, We need a valid bank account on file to continue processing payments for FARaudit Inc. Please add a verified bank account in your Stripe dashboard within 7 days, or we'll need to pause payouts. Verify your bank account here: https://dashboard.stripe.com/...",
    },
  },
  {
    label: "Google security alert (action 2) — should DOWNGRADE to none",
    expected: "none",
    meta: {
      ...baseMeta,
      senderEmail: "no-reply@accounts.google.com",
      subject: "Security alert for jose@bullrize.com",
      snippet:
        "A new sign-in on Mac. We noticed a new sign-in to your Google Account on a Mac device. If this was you, you don't need to do anything. If not, we'll help you secure your account. Check activity at myaccount.google.com.",
    },
  },
  {
    label: "Stripe password updated (action 3) — should DOWNGRADE to none",
    expected: "none",
    meta: {
      ...baseMeta,
      senderEmail: "noreply@stripe.com",
      subject: "Your Stripe password has been updated",
      snippet:
        "Hi, This is a confirmation that the password for your Stripe account has been changed. If you didn't make this change, please contact Stripe support immediately. Otherwise, no action is needed.",
    },
  },
];

(async () => {
  console.log("FA-96 classifier replay — 3 cases\n");
  let pass = 0;
  let fail = 0;
  for (const c of cases) {
    const decision = await extractAction(c.meta, baseClass);
    const ok = decision.verb === c.expected;
    if (ok) pass++; else fail++;
    console.log(`──── ${c.label}`);
    console.log(`  expected: ${c.expected}`);
    console.log(`  got:      ${decision.verb}  ${ok ? "✓" : "✗ FAIL"}`);
    console.log(`  reason:   ${decision.reason}`);
    console.log(`  confidence: ${decision.confidence}`);
    console.log("");
  }
  console.log(`DONE: pass=${pass} fail=${fail}`);
  process.exit(fail > 0 ? 1 : 0);
})();
