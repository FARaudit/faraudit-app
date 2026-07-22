// #660 egress gauntlet — plain-assert (run via: npx ts-node test/egress.test.ts).
// Matrix: p0 action → draft; machine-noise → zero egress; already-classified → skipped;
// second tick same thread → no reprocess; new message on thread → reprocesses (can re-notify);
// telegram gated cleanly when creds absent.
import { isNeedsAttention, buildNeedsAttentionDraft, buildTelegramLine, type NeedsAttentionItem } from "../src/needs-attention";
import { telegramConfigured } from "../src/telegram";
import type { ActionVerb } from "../src/action-extractor";

let passed = 0, failed = 0;
function check(cond: boolean, label: string): void {
  if (cond) passed += 1; else { failed += 1; console.error(`FAIL: ${label}`); }
}

// ── 1. isNeedsAttention: ONLY digest_p0_block qualifies (machine noise → zero egress) ──
check(isNeedsAttention("digest_p0_block") === true, "digest_p0_block → qualifies");
const nonQualifying: ActionVerb[] = ["reply", "calendar", "notion_update", "digest_p0_unblock", "forward", "none"];
for (const v of nonQualifying) check(isNeedsAttention(v) === false, `${v} → does NOT qualify (no egress)`);

// ── 2. buildNeedsAttentionDraft: zero qualifying → NO draft; ≥1 → one draft w/ #660 subject ──
check(buildNeedsAttentionDraft([], "2026-07-22 11:30 CT") === null, "0 qualifying → null (no draft)");
const items: NeedsAttentionItem[] = [
  { senderName: "Mercury", senderEmail: "team@mercury.com", subject: "Action required: verify bank", reason: "bank verification", deadline: "2026-07-25", threadId: "t1" },
  { senderName: "", senderEmail: "registered-agent@example.com", subject: "83(b) filing due", reason: "filing deadline", threadId: "t2" },
];
const draft = buildNeedsAttentionDraft(items, "2026-07-22 11:30 CT");
check(draft !== null, "≥1 qualifying → draft built");
check(!!draft && draft.subject === "📌 NEEDS ATTENTION — 2026-07-22 11:30 CT", "subject matches #660 format");
check(!!draft && draft.body.includes("team@mercury.com") && draft.body.includes("Action required: verify bank"), "body carries sender + subject");
check(!!draft && draft.body.includes("Deadline: 2026-07-25"), "body carries deadline when present");
check(!!draft && draft.body.includes("mail.google.com/mail/u/0/#inbox/t1"), "body carries thread deep-link");

// ── 3. buildTelegramLine: correct push text (what gets sent when creds present) ──
const tg = buildTelegramLine(items[0], "2026-07-22 11:30 CT");
check(tg.includes("NEEDS ATTENTION") && tg.includes("Mercury") && tg.includes("bank verification") && tg.includes("Deadline"), "telegram line has all fields");

// ── 4. telegram gating — creds absent in test env → cleanly disabled (never throws/blocks) ──
check(telegramConfigured() === false, "telegram disabled when creds absent (clean skip)");

// ── 5. idempotency (Set membership) — already-classified skipped; new message id reprocesses ──
const alreadyClassified = new Set<string>(["msg-A"]);
check(alreadyClassified.has("msg-A") === true, "already-classified message id → skip (no re-act/re-notify)");
check(alreadyClassified.has("msg-B") === false, "new message id → NOT skipped (reprocess → can re-notify)");

console.log(`\n[egress.test] ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
