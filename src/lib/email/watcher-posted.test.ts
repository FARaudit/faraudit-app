// Unit tests for the watcher "RFP posted" email verdict palette.
// Run: npx tsx src/lib/email/watcher-posted.test.ts
//
// Locks in the fix for the false-green bug: the agentic engine writes
// recommendation = PROCEED_WITH_CAUTION (the bucket honest-fail INCOMPLETE /
// NEEDS_HUMAN_REVIEW maps to) with a NULL score. The old palette used
// `=== "CAUTION"` and a `score < 80` rescue, so PROCEED_WITH_CAUTION fell through
// to the green "Strong fit" tile — emailing a customer a false opportunity on the
// exact verdicts the engine refused to stand behind. The palette must now match
// BOTH vocabularies and FAIL SAFE to amber for anything it doesn't recognize.

import { buildWatcherPostedEmail } from "./watcher-posted";

const base = {
  toEmail: "x@y.com", title: "Test RFP", solicitationNumber: null, agency: null,
  naics: null, priorNoticeType: null, noticeType: null, complianceFlagsCount: 0,
  risksFlagsCount: 0, responseDeadline: null, auditUrl: "https://a", watchingUrl: "https://w",
  settingsUrl: "https://s", unsubscribeUrl: "https://u", postedAt: null,
};

// word + caption are the palette-driven, unambiguous discriminators (the ink
// colors also appear in static CSS, so they can't be used for absence checks).
interface PCase { label: string; rec: string | null; score: number | null; word: string; caption: string }
const cases: PCase[] = [
  // The lethal case — must be amber, never green.
  { label: "PROCEED_WITH_CAUTION (honest-fail bucket), null score → CAUTION amber", rec: "PROCEED_WITH_CAUTION", score: null, word: "CAUTION", caption: "Workable" },
  { label: "NEEDS_HUMAN_REVIEW → CAUTION amber", rec: "NEEDS_HUMAN_REVIEW", score: null, word: "CAUTION", caption: "Workable" },
  { label: "INCOMPLETE → CAUTION amber", rec: "INCOMPLETE", score: null, word: "CAUTION", caption: "Workable" },
  { label: "BID_WITH_CAUTION → CAUTION amber", rec: "BID_WITH_CAUTION", score: null, word: "CAUTION", caption: "Workable" },
  // Proceed poles — green.
  { label: "PROCEED (agentic GO) → GO green", rec: "PROCEED", score: null, word: "GO", caption: "Strong fit" },
  { label: "BID → GO green", rec: "BID", score: null, word: "GO", caption: "Strong fit" },
  { label: "legacy GO → GO green", rec: "GO", score: null, word: "GO", caption: "Strong fit" },
  // Decline poles — red.
  { label: "DECLINE → DECLINE red", rec: "DECLINE", score: null, word: "DECLINE", caption: "Hard pass" },
  { label: "NO_BID → DECLINE red", rec: "NO_BID", score: null, word: "DECLINE", caption: "Hard pass" },
  { label: "INELIGIBLE → DECLINE red", rec: "INELIGIBLE", score: null, word: "DECLINE", caption: "Hard pass" },
  // Legacy vocabulary + score-only paths still work.
  { label: "legacy CAUTION → CAUTION amber", rec: "CAUTION", score: null, word: "CAUTION", caption: "Workable" },
  { label: "low score forces DECLINE", rec: null, score: 40, word: "DECLINE", caption: "Hard pass" },
  { label: "high score forces GO", rec: null, score: 90, word: "GO", caption: "Strong fit" },
  { label: "mid score → CAUTION amber", rec: null, score: 65, word: "CAUTION", caption: "Workable" },
  // Fail-safe — an unrecognized/blank verdict must NOT render green anymore.
  { label: "blank recommendation fails SAFE to amber (was green GO)", rec: null, score: null, word: "CAUTION", caption: "Workable" },
  { label: "garbage verdict fails SAFE to amber", rec: "WAT", score: null, word: "CAUTION", caption: "Workable" },
];

let pass = 0; let fail = 0;
for (const c of cases) {
  const { html } = buildWatcherPostedEmail({ ...base, recommendation: c.rec, score: c.score });
  const wordOk = html.includes(`<span class="vw">${c.word}</span>`);
  const capOk = html.includes(`<span class="vc">${c.caption}</span>`);
  const ok = wordOk && capOk;
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${c.label}`);
  if (!ok) console.log(`        word "${c.word}" present:${wordOk} · caption "${c.caption}" present:${capOk}`);
}

console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
