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
  // Both copy controls opt in through data-cs-copy. They used to share id="csCopy" —
  // a duplicate id, and the confirmation rendered ~900px above the Export button, so a
  // copy from down the page reported success off-screen and read as a dead control.
  const copyHooks = (html.match(/data-cs-copy/g) || []).length;
  check("every copy control is wired", copyHooks >= 2 && /\[data-cs-copy\]/.test(live),
    `found ${copyHooks} copy hooks`);
  check("no duplicate copy id", (html.match(/id="csCopy"/g) || []).length === 0,
    "two elements share one id");
  check("the confirmation lands where the button was pressed", /function localNote/.test(live),
    "a copy from the Export section reports success off-screen");
  // The page renders a letterhead; a flat transcript of it is not the document.
  check("the export carries the document's formatting",
    /function statementHtml/.test(live) && /'text\/html'/.test(live) && /'text\/plain'/.test(live),
    "pasting into Word or email produces a wall of plain text");
  check("…and falls back to plain text where rich is unsupported", /plainOnly/.test(live),
    "a browser without ClipboardItem copies nothing");
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

// A PAST-PERFORMANCE VALUE MAY ONLY BE A RECORDED AWARD. ceiling_value_estimate is a
// lens's reading of the SOLICITATION and was filling contract_value on both autopopulate
// paths — rendering in a past-performance row and printing in the PDF as an award figure
// a contracting officer would read as fact.
console.log("\n── no estimated ceiling is presented as an award value ──");
{
  const capSrc = readFileSync(join(process.cwd(), "src/app/api/capability-statement/route.ts"), "utf8");
  const code = capSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  check("comments were stripped before scanning", code.length < capSrc.length,
    "scanning prose, not code");
  const bad = [...code.matchAll(/contract_value:[^\n]*ceiling_value_estimate[^\n]*/g)].map((m) => m[0].trim());
  check("contract_value is never filled from ceiling_value_estimate", bad.length === 0,
    bad.join(" | "));
  check("a recorded actual is still allowed through",
    /contract_value:\s*o\.contract_value_actual/.test(code),
    "the real award figure was removed too — suppression went too far");
}

console.log("\n── planted positives ──");
check("P1 · rejects a resurrected fabricated award", /SPY-6 Radar Sustainment/.test('<span class="perf-title">SPY-6 Radar Sustainment — Phase IV</span>'));
check("P2 · rejects a hardcoded completeness figure", />82%</.test('<span class="pct">82%</span>'));
check("P3 · accepts a page with neither", !/SPY-6|>82%</.test('<div class="perf-list"></div><span class="pct"></span>'));
check("P4 · the fillability check names a field with no editor", !new Set(["company_name"]).has("contact_fax"));

// ── CAGE is synced, not typed, and not silently dropped ────────────────────
// The UEI editor displayed cage_code as "not on file" and NOTHING wrote it — writable by
// the API, shown on a document a contracting officer reads, and unfillable from anywhere in
// the product. The entity was already carrying it: sam-entity.ts parses er.cageCode into
// SamEntity.cage_code, and cert-sync dropped it on the floor.
{
  const certSync = read("src/lib/cert-sync.ts");
  const samEntity = read("src/lib/sam-entity.ts");
  check("the SAM entity still carries a CAGE to sync",
    /cage_code:\s*er\.cageCode/.test(samEntity), "nothing upstream to persist");
  check("cert-sync persists cage_code from the attested entity",
    /\.update\(\{ cage_code: samCage \}\)/.test(certSync) && /entity\.cage_code/.test(certSync),
    "CAGE reads 'not on file' forever with no control that can change it");
  check("…and uses .select() as the zero-row control, like attributes_v2",
    /\.update\(\{ cage_code: samCage \}\)[\s\S]{0,240}\.select\("user_id"\)/.test(certSync),
    "PostgREST reports no error on a zero-row UPDATE — the write would claim success");
  check("P5 · that check can see the pre-fix shape",
    !/\.update\(\{ cage_code: samCage \}\)/.test('return { state: "verified", records };'));
}

// ── editing is an in-page editor, not window.prompt ────────────────────────
// Every editable field opened a native browser dialog — "www.faraudit.com says" chrome on
// a designed document — and it gave a SINGLE LINE to Core Competencies, a field that holds
// paragraphs. Same dialog for all eight fields, with no statement of what any field is for.
{
  check("no field opens a native browser prompt", !/window\.prompt\(/.test(live.replace(/\/\*[\s\S]*?\*\//g, "")),
    "editing drops out of the design into browser chrome");
  check("prose fields get a textarea, not a one-line input",
    /prose: true/.test(live) && /spec\.prose \? 'textarea' : 'input'/.test(live),
    "Core Competencies is edited through a single-line box");
  check("the editor says what the field is for", /FIELD_SPEC/.test(live) && /help:/.test(live),
    "a bare label with no explanation of what a contracting officer does with it");
  check("it is a real dialog — labelled, escapable, focus-trapped",
    /aria-modal/.test(live) && /e\.key === 'Escape'/.test(live) && /e\.key === 'Tab'/.test(live),
    "keyboard users cannot leave it and screen readers cannot name it");
  check("an unchanged value does not claim a save",
    /next === current\.trim\(\)/.test(live), "closing without editing reports a write that never happened");
  check("the hint is not set in --mute-2", !/\.fe-hint\{[^}]*--mute-2/.test(html),
    "--mute-2 is not a text token at any size (2.56:1)");
  check("P6 · the prompt check can see the old shape", /window\.prompt\(/.test("var next = window.prompt('Edit ' + label, current);"));
}

// ── the page does not invite a click it cannot honour, and empty teaches ──────
{
  check("the logo box is not dressed as a button",
    !/\.lh-logo\{[^}]*cursor:pointer/.test(html),
    "a dashed box with a hover state and no handler, no column and no storage behind it");
  check("a phone is shown as a phone", /function fmtPhone/.test(live) && /return '\(' \+ d\.slice\(0, 3\)/.test(live),
    "12034567890 is printed raw on a document a contracting officer reads");
  check("an unrecognised phone is passed through untouched", /if \(d\.length !== 10\) return String\(v\)/.test(live),
    "an extension or a foreign number would be mangled into a shape it does not have");
  // Guidance may never become data: the CEO fills this record as a customer and that act
  // is the test, so nothing may pre-write a word of it.
  check("empty prose fields show what to write", /PROSE_GUIDE/.test(live) && /function proseGuide/.test(live),
    "an empty field says only that it is empty");
  // The exported statement must be built from the record alone. Slice the two export
  // builders out and assert neither can see the guidance.
  const exportSrc = live.slice(live.indexOf("function statementText"));
  check("…and that guidance is never written or exported",
    !/PROSE_GUIDE|proseGuide/.test(exportSrc),
    "example copy could reach the exported statement");
  check("…nor saved onto the record",
    !/save\([^)]*PROSE_GUIDE|patch\[[^\]]*\]\s*=\s*PROSE_GUIDE/.test(live),
    "example copy could be written into the customer's record");
}

// ── the two-column grid actually has two columns ─────────────────────────────
// A single stray </div> closed <article class="doc-card"> early, so the parser ejected
// BOTH the contact strip and the whole side column out to <main>. The grid kept its
// 3fr/2fr tracks with nothing in the second one — that empty 566px column is what read
// as a blank hole beside the document, and it is why Export did not line up with
// anything above it. Nothing asserted the panel was still inside the grid.
{
  const gridOpen = html.indexOf('<section class="cs-grid">');
  const gridBlock = html.slice(gridOpen, html.indexOf('</section>', html.indexOf('<aside class="side-col">')));
  check("the side column is inside the grid", gridOpen > -1 && /<aside class="side-col">/.test(gridBlock),
    "the second grid track is empty and the side cards render full-bleed below");
  check("the contact strip is inside the document", /<article class="doc-card">[\s\S]*?contact-strip[\s\S]*?<\/article>/.test(html),
    "the contact strip was ejected out of the statement it belongs to");

  // Tag balance inside the grid — the actual defect, not its symptom.
  const VOID = new Set(["br","hr","img","input","meta","link","path","circle","rect","line","polyline","polygon","use","source","col","area","base","embed","param","track","wbr","stop","ellipse"]);
  const region = html.slice(gridOpen, html.indexOf('<aside class="side-col">'));
  const stack: string[] = [];
  let stray = 0;
  for (const m of region.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>/g)) {
    const [, closing, rawTag, , selfClose] = m;
    const tag = rawTag.toLowerCase();
    if (VOID.has(tag) || selfClose === "/") continue;
    if (closing) { if (stack[stack.length - 1] === tag) stack.pop(); else stray++; }
    else stack.push(tag);
  }
  check("no stray closing tag inside the document card", stray === 0,
    `${stray} closing tag(s) with no matching open — the parser will eject everything after them`);
  check("P7 · the balance check can see a planted stray", (() => {
    const s2: string[] = []; let bad = 0;
    for (const m of '<div><span></span></div></div>'.matchAll(/<(\/?)([a-z]+)>/g)) {
      if (m[1]) { if (s2[s2.length - 1] === m[2]) s2.pop(); else bad++; } else s2.push(m[2]);
    }
    return bad === 1;
  })());
}

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
