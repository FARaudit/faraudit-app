// THE CAPABILITY STATEMENT MAY NOT INVENT A COMPANY.
//   npx tsx test/public/_capability-statement-truth.test.ts
//
// Found 2026-08-05, driven live against a populated record. The page was a static
// document for a company that does not exist. Measured against what the record
// actually held on the same screen:
//
//   letterhead        "Apex Precision Machining LLC"  ·  record: a different name
//   core competencies 4 invented bullets              ·  record: a real paragraph
//   differentiators   6 invented bullets              ·  record: a real paragraph
//   past performance  3 awards with invented contract numbers and dollar values
//                                                     ·  record: ZERO rows
//   email / phone     invented                        ·  record: one real, one null
//   completeness      "82%" hardcoded, twice          ·  computed: 75%
//   health checklist  "Past performance (3 of 3) ✓"   ·  record: ZERO rows
//
// The last two are the reason this file exists. This document is what a customer
// sends to a contracting officer, so fabricated past performance is not a UI
// blemish — and a checklist that marks a missing section complete tells them there
// is nothing left to fix.
//
// The rule: every claim on this page derives from the record, or says it is empty.
import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};
const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const html = read("public/capability-statement.html");
const live = read("public/capability-statement-live.js");

console.log("── the document invents nothing ──");
{
  // The fabricated company and its fabricated programme names.
  for (const ghost of ["Apex Precision Machining", "Radar Sustainment · Mission Systems", "SPY-6 Radar Sustainment", "GPS-III Ground Station", "F-35 Mission Systems — CI Pipeline"]) {
    check(`no fabricated content: ${ghost.slice(0, 34)}`, !html.includes(ghost), "still shipped in the page");
  }
  // Invented solicitation numbers and dollar values on a document sent to a CO.
  check("no invented contract numbers", !/N00024-26-R-2207|FA2517-26-R-0033|FA8730-26-Q-0114/.test(html), "a fabricated solicitation number is still on the page");
  check("no invented contract values", !/\$18\.4M|\$24\.6M|\$7\.9M/.test(html), "a fabricated award value is still on the page");
  check("no invented contact details", !/contracts@faraudit-defense\.com|\(703\) 555-0142/.test(html), "a fabricated contact is still on the page");
  check("no hardcoded completeness figure", !/>82%<|>82</.test(html), "the health ring asserts a number nothing computed");

  // THE TEXT WAS ONLY HALF OF IT. The number came out of the markup while the ARC
  // stayed frozen at stroke-dashoffset="33.9" — 82% of a 188.5 circumference — so a
  // record at 42% drew a ring at 82%, and the ring is what is seen first. Geometry is
  // a claim too, and this gate read only the words.
  const ring = (html.match(/<circle[^>]*class="health-ring-fg"[^>]*>/) ?? [""])[0];
  check("the completeness ring is identifiable", ring.length > 0,
    "no .health-ring-fg circle — the arc cannot be checked");
  const dash = parseFloat((ring.match(/stroke-dasharray="([\d.]+)"/) ?? ["", "0"])[1]);
  const off = parseFloat((ring.match(/stroke-dashoffset="([\d.]+)"/) ?? ["", "-1"])[1]);
  check("the ring ships EMPTY, not at some pre-drawn fraction", dash > 0 && off === dash,
    `dasharray=${dash} dashoffset=${off} — an arc drawn before any record was read`);
  check("a script sets the ring from the counted percentage",
    /health-ring-fg/.test(live) && /stroke-dashoffset/.test(live),
    "nothing computes the arc, so it can only ever show what the markup drew");
  check("no version stamp with no source", !/v1\.0 · auto-synced|v1\.0 · generated today|11:42 AM CT/.test(html), "a generated-at claim with nothing behind it");
}

console.log("\n── the numbers are counted, not asserted ──");
{
  check("completeness is computed from the record", /function completeness\(\)/.test(live) && /Math\.round\(\(done \/ CHECKS\.length\)/.test(live), "no arithmetic behind the percentage");
  check("the checklist is rendered from the same checks", /CHECKS\.forEach/.test(live) && /ok\(\) \? 'done' : 'todo'/.test(live), "checklist state is not derived from the record");
  check("awards on file counts the record's rows", /list\(REC\.past_performance\)/.test(live), "the award count is not read from the record");
  check("past performance is never typed", !/data-cs-field="past_performance"|past_performance:/.test(live.split("statementText")[0]) , "past performance became editable — the route recomputes it on every load");
}

console.log("\n── empty says what is missing, and unreadable says something different ──");
{
  check("an empty section states the consequence", /function emptyNote/.test(live) && /on file\. /.test(live), "an empty region renders blank");
  check("a failed read is NOT rendered as an empty record", /cs-unreadable/.test(live) && /no statement in response/.test(live), "an outage looks like an empty company");
  check("the unreadable state is visible to the customer", /cs-unreadable .doc-card::before/.test(html), "the class is set but nothing renders");
  check("unreadable copy distinguishes itself from empty", /connection problem, not an empty record/.test(html), "the two states read the same");
}

console.log("\n── a control may only claim what the code can do ──");
{
  check("no Regenerate button", !/>\s*Regenerate\s*</.test(html), "a control with no generator behind it");
  check("no 'Improve with AI' button", !/Improve with AI/.test(html), "a control with no endpoint behind it");
  check("no PDF or Word export button", !/Download as PDF|Download as Word/.test(html), "an export that produces no file");
  check("no invented tailored versions", !/U\.S\. Army Edition|U\.S\. Navy Edition|Air &amp; Space Force Edition/.test(html), "agency editions that do not exist");
  check("what is not built says so", /cs-unwired/.test(html), "an absent feature is silently missing instead of stated");
  check("Copy to Clipboard is actually wired", /id="csCopy"/.test(html) && /navigator\.clipboard/.test(live), "the one working export is not connected");
  check("the copied text is built from the record", /function statementText/.test(live) && /REC\.company_name/.test(live), "the export could drift from what is on screen");
}

console.log("\n── the save believes the server, and every counted field can be filled ──");
{
  check("save reads back the persisted row", /res\.body && res\.body\.statement/.test(live), "success is reported from the request body");
  check("a mismatch between sent and persisted is reported", /Save did not persist/.test(live), "a dropped field would report success");
  check("a failed save says so", /Could not save|Could not reach the server/.test(live), "a failed save is silent");

  // The trap this closes: the checklist counted 12 fields while the UI could only
  // set 7 of them, so a customer could be told to fill in something with no input.
  const checks = [...live.matchAll(/\{ label: '([^']+)',\s*ok: function \(\) \{ return (?:has|list)\(REC\.(\w+)\)/g)]
    .map((m) => ({ label: m[1], field: m[2] }));
  check("the checklist was parsed", checks.length >= 10, `parsed ${checks.length} checks`);

  const editable = new Set([
    ...[...live.matchAll(/FIELD_LABELS = \{([\s\S]*?)\};/g)].flatMap((m) => [...m[1].matchAll(/(\w+):/g)].map((x) => x[1])),
    ...[...live.matchAll(/CONTACT_FIELDS = \[([^\]]+)\]/g)].flatMap((m) => [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1])),
  ]);
  // Filled from SAM when the customer saves a UEI, not typed; and past performance
  // is recomputed from won audits. Each is named, so nothing is waved through silently.
  const FILLED_ELSEWHERE: Record<string, string> = {
    uei: "the UEI input on this page",
    cage_code: "synced from the SAM entity record when a UEI is saved",
    certifications: "synced from the SAM entity record when a UEI is saved",
    naics_codes: "the NAICS page",
    past_performance: "recomputed from audits recorded as won",
  };
  for (const c of checks) {
    const where = editable.has(c.field) ? "this page" : FILLED_ELSEWHERE[c.field];
    check(`"${c.label}" is counted AND fillable — ${where ?? "NOWHERE"}`, !!where,
      `the checklist tells the customer to fill ${c.field}, and nothing in the product can set it`);
  }

  check("company name is editable — it is the letterhead", /data-cs-field="company_name"/.test(html), "the most important field on the page has no editor");
  check("website and address have contact rows", /Business address<\/div>/.test(html) && /Website<\/div>/.test(html), "a counted field has no input");
}

console.log("\n── planted positives ──");
check("P1 · rejects a resurrected fabricated award", /SPY-6 Radar Sustainment/.test('<span class="perf-title">SPY-6 Radar Sustainment — Phase IV</span>'));
check("P2 · rejects a hardcoded completeness figure", />82%</.test('<span class="pct">82%</span>'));
check("P3 · accepts a page with neither", !/SPY-6|>82%</.test('<div class="perf-list"></div><span class="pct"></span>'));
check("P4 · the fillability check names a field with no editor", !new Set(["company_name"]).has("contact_fax"));

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
