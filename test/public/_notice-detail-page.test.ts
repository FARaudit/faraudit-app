// A notice has its own address, and that page spends nothing.
// Run: npx tsx test/public/_notice-detail-page.test.ts
//
// /notices was a list only: a notice existed as a card inside it and had no URL, so it
// could not be sent to a colleague, bookmarked, or returned to after a run.
// /notices/<noticeId> is that address.
//
// THE CONSTRAINT THIS GATE EXISTS FOR: the page must not reach the engine. Reading a
// notice is free; /api/audit fires a PAID run. The Run audit control is the same link
// the card already carried — a doorway, not a trigger — and nothing on this page may
// call a model or the audit pipeline.
//
// Part P plants each defect back and asserts this suite goes red.

import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = ""): void => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
// The handler and its render helpers are two files: Next forbids a route from
// exporting anything but handlers and config, and the build — not tsc — enforces it.
// Both are swept, because the guarantees below hold across the pair, not one half.
const ROUTE = read("src/app/notices/[noticeId]/route.ts") + "\n" + read("src/app/notices/[noticeId]/_render.ts");
const PAGE = read("public/notice-detail.html");
const LIST = read("public/dso-app.js");

console.log("── the notice is addressable ──");
check("the per-notice route exists", ROUTE.length > 500, `${ROUTE.length} bytes`);
check("it is auth-gated and returns you to the notice",
  /redirect\(`\/sign-in\?next=\/notices\/\$\{encodeURIComponent\(noticeId\)\}`\)/.test(ROUTE),
  "a shared link would drop the reader on a generic page after sign-in");
check("the list links a notice to its page",
  /href="\/notices\/' \+ encodeURIComponent\(o\.notice_id\)/.test(LIST),
  "the address exists and nothing reaches it");

console.log("── it spends nothing ──");
// The whole reason this feature was allowed: reading is free, running is not.
for (const [what, re] of [
  ["a model client", /new Anthropic|@anthropic-ai\/sdk|messages\.create/],
  ["the audit pipeline", /audit-orchestrator|runAudit\(|submitAudit/],
  ["the paid run endpoint", /\/api\/audit\b(?!s)/],
] as Array<[string, RegExp]>) {
  check(`the route never touches ${what}`, !re.test(ROUTE), "reading a notice must stay free");
  check(`  ...nor does the page`, !re.test(PAGE), "reading a notice must stay free");
}
// The audit DOORWAY is allowed and expected — it is the same link the card carries.
check("it still offers the audit link the card offers",
  /href="\/audits\?noticeId=/.test(ROUTE),
  "the page dead-ends instead of handing off to the run");

console.log("── it reuses the endpoints the list already calls ──");
check("description comes from the existing route",
  /\/api\/notice-description\?noticeId=/.test(ROUTE) && /\/api\/notice-description\?noticeId=/.test(LIST),
  "a second implementation of 'what does SAM say' will drift from the first");
check("attachments come from the existing route",
  /\/api\/notice-attachments\?noticeId=/.test(ROUTE) && /\/api\/notice-attachments\?noticeId=/.test(LIST),
  "same");
check("the row is resolved from the SAME feed the list renders",
  /fetchLiveOpportunitiesScoped/.test(ROUTE),
  "a detail page with its own source is a second answer to one question");

console.log("── three outcomes, and none of them render alike ──");
check("NOT IN YOUR FEED explains itself and still offers SAM",
  /not in your feed/i.test(ROUTE) && /sam\.gov\/opp\//.test(ROUTE),
  "a scoped-out notice must not look like a broken link");
check("A FAILED FEED READ is its own state",
  /could not be read/i.test(ROUTE) && /not an empty result/i.test(ROUTE),
  "an outage rendered as 'not found' sends the reader to fix the wrong thing");
check("a failed ATTACHMENT read is distinct from an empty list",
  /attachments === null/.test(ROUTE) && /lists no attachments/i.test(ROUTE),
  "null is a failed read and [] is 'SAM listed none'");

console.log("── Part P · positive controls ──");
const controls: Array<[string, string, (s: string) => boolean]> = [
  ["the route starts a paid run",
    ROUTE.replace("const supabase = await createServerClient();",
                  "await fetch('/api/audit', { method: 'POST' });\n  const supabase = await createServerClient();"),
    (s) => /\/api\/audit\b(?!s)/.test(s)],
  ["the two failure states collapse into one",
    // GLOBAL: the phrase appears in the comment AND the heading, and replacing one
    // occurrence left the other, so the control read as inert.
    ROUTE.replace(/not in your feed/gi, "could not be read"),
    (s) => !/not in your feed/i.test(s)],
  ["the page forks its own feed read",
    ROUTE.replace(/fetchLiveOpportunitiesScoped/g, "fetchSomethingElse"),
    (s) => !/fetchLiveOpportunitiesScoped/.test(s)],
];
for (const [name, planted, isRed] of controls) {
  const changed = planted !== ROUTE;
  check(`positive control · ${name}`, changed && isRed(planted),
    !changed ? "the replacement matched nothing — control is inert" : "the defect tripped nothing above");
}

console.log(`\n${fail === 0 ? "✅" : "❌"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
