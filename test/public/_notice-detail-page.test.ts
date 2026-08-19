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
// Static, not dynamic: this suite transpiles to CJS, where top-level await is a
// transform error rather than a runtime one — the failure is at build, not in a check.
import { renderNotice } from "../../src/app/notices/[noticeId]/_render";

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

/* ── the buying office is a DISPLAY string, not SAM's machine path ──
   RENDERED, not grepped. The shipped bug was invisible to a source sweep: office_path
   and agency were both read correctly and the guard between them looked reasonable.
   Only executing renderNotice() on a real path shows the two of them printed back to
   back. This section imports the real helper and reads its actual output. */

// Verbatim from SAM for solicitation 70Z08026Q16007B00, the notice that exposed this.
const PATH = "HOMELAND SECURITY, DEPARTMENT OF.US COAST GUARD.SFLC PROCUREMENT BRANCH 3(00040)";
const DEPT = "HOMELAND SECURITY, DEPARTMENT OF";
const row = (over: Record<string, unknown> = {}) => ({
  notice_id: "n1", solicitation_number: "70Z08026Q16007B00", title: "Rudder Overhaul",
  agency: `${DEPT} · US COAST GUARD`, office_path: PATH,
  naics_code: "332710", set_aside: null, notice_type: "Solicitation",
  response_deadline: null, created_at: null, ...over,
}) as unknown as Parameters<typeof renderNotice>[0];

const buyerOf = (html: string): string =>
  (html.match(/<div class="nd-buyer">([\s\S]*?)<\/div>/) || ["", ""])[1];

console.log("── the buying office reads as a place, not a path ──");
const buyer = buyerOf(renderNotice(row()));
check("the raw dotted SAM path is never printed",
  !buyer.includes(PATH) && !/[A-Z]\.[A-Z]/.test(buyer),
  `fullParentPathName is a machine field; got: ${buyer}`);
check("the department is named once, not twice",
  buyer.split(DEPT).length - 1 <= 1,
  `agency is a prefix of office_path, so printing both repeats it: ${buyer}`);
check("the specific buying office is what LEADS the line",
  /^<b>SFLC PROCUREMENT BRANCH 3<\/b>/.test(buyer),
  `the leaf is the only new information the hierarchy does not already carry: ${buyer}`);

// A path with no leaf below the top two segments, and a row with no path at all:
// neither may render empty, and neither may fall back to the dotted string.
const shallow = buyerOf(renderNotice(row({ office_path: `${DEPT}.US COAST GUARD` })));
check("a path with no leaf still names the agency",
  shallow.includes("US COAST GUARD") && !/[A-Z]\.[A-Z]/.test(shallow),
  `got: ${shallow}`);
const none = buyerOf(renderNotice(row({ office_path: null, agency: null })));
check("a notice with no buyer at all says so",
  /not stated/i.test(none), `an empty line reads as a render failure: ${none}`);

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
  // The shipped defect itself: reinstate the guard that compared a dotted path to a
  // middot-joined string. It is a RENDER control, so it asserts on output, not source.
  ["the buyer line prints the raw path and repeats the department",
    (() => {
      // Typed as `string`, not left as literals: with literal types tsc REJECTS the
      // comparison below as having no overlap — the compiler can see the shipped guard
      // was dead. The real code widened both through String(), which is why it built.
      const office: string = PATH, agency: string = `${DEPT} \u00b7 US COAST GUARD`;
      return office && agency && office !== agency ? `${office} \u00b7 ${agency}` : office;
    })(),
    (s) => s.includes(PATH) && s.split(DEPT).length - 1 > 1],
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
