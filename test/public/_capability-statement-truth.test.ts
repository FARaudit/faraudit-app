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
  // The copy control opts in through data-cs-copy. There were once TWO of them firing
  // the identical handler — this assertion required both, which made the duplicate a
  // rule rather than the defect it was. Export is one cluster now; the count is asserted
  // exactly, below, so a second control cannot creep back in unnoticed.
  const copyHooks = (html.match(/data-cs-copy/g) || []).length;
  check("the copy control is wired", copyHooks >= 1 && /\[data-cs-copy\]/.test(live),
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
  // Not dressed as a button was not enough. A dashed box reading "LOGO" is the shape of
  // a drop zone, so it read as a control that was BROKEN rather than one not yet built.
  check("the logo placeholder says it is unbuilt", /lt-unbuilt">NOT BUILT</.test(html),
    "the box invites an upload the code cannot accept and names no reason");
  check("nothing claims a logo the record cannot hold",
    !/logo_url/.test(html) && !/logo_url/.test(live),
    "a logo is rendered from a column that does not exist on capability_statements");
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

// ── which field a contact row edits is authored, not inferred from its position ──
// paintContact() used to walk `.cv` cells by index against CONTACT_FIELDS and STAMP
// data-cs-contact from that index. The click handler opens the editor on that same
// attribute, so reordering two rows in the markup did not merely mislabel them — it
// pointed the editor at the wrong column of the record, and the save would have
// written a website into the address. Nothing asserted the two orders agreed.
console.log("\n── a contact row names its own field ──");
{
  const fields = (live.match(/var CONTACT_FIELDS\s*=\s*\[([^\]]*)\]/)?.[1] ?? "")
    .split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  check("the painted field list is readable", fields.length === 5, `parsed ${fields.length}`);

  const strip = html.slice(html.indexOf('<div class="contact-strip">'), html.indexOf("</article>"));
  const authored = [...strip.matchAll(/data-cs-contact="([^"]+)"/g)].map((m) => m[1]);
  const rows = [...strip.matchAll(/<div class="contact-item"/g)].length;

  check("every row names the field it edits", authored.length === rows && rows > 0,
    `${rows} contact rows, ${authored.length} carry data-cs-contact — an unnamed row paints blank`);
  for (const f of fields) {
    check(`${f} is authored exactly once`, authored.filter((a) => a === f).length === 1,
      "a field the strip paints has no row, or two rows claim it");
  }
  check("no row claims a field the record has no painter for",
    authored.every((a) => fields.includes(a)),
    "the editor would open on a key paintContact never fills");

  check("the position of a row decides nothing", !/setAttribute\(\s*['"]data-cs-contact['"]/.test(live),
    "the attribute is still stamped by index — reordering the markup re-points the editor");
  check("hydration reads the authored field", /getAttribute\(\s*['"]data-cs-contact['"]\s*\)/.test(live),
    "paintContact does not consult the attribute the click handler trusts");

  check("P8 · the authored-field check can see a stripped attribute", (() => {
    const planted = strip.replace(/ data-cs-contact="contact_website"/, "");
    const a = [...planted.matchAll(/data-cs-contact="([^"]+)"/g)].map((m) => m[1]);
    const r = [...planted.matchAll(/<div class="contact-item"/g)].length;
    return !(a.length === r) && !a.includes("contact_website");
  })());
}

// ── the strip reads as columns, and the document reaches the bottom of the rail ──
console.log("\n── the contact strip is laid out in columns ──");
{
  const rule = html.match(/\.contact-strip\{([^}]*)\}/)?.[1] ?? "";
  check("the strip is a grid, not a wrapping row", /display:grid/.test(rule) && /grid-template-columns:minmax\(0,320px\)/.test(rule),
    "flex-wrap packs by content width, so nothing lines up column to column");

  // Every cell is placed BY FIELD. Auto-flow would put the phone wherever the markup
  // happens to sit, and markup order on this strip is already load-bearing for which
  // record column an edit writes to — layout must not add a second reason to care.
  for (const [field, col] of [["contact_name", "1"], ["contact_email", "1"], ["contact_phone", "1"],
                              ["contact_address", "2"], ["contact_website", "2"]] as const) {
    check(`${field} is placed in column ${col}`,
      new RegExp(`\\.contact-item\\[data-cs-contact="${field}"\\]\\{grid-column:${col};grid-row:\\d`).test(html),
      "the cell falls wherever auto-flow puts it, so reordering the markup moves it");
  }
  check("narrow screens drop the placement", /\.contact-strip \.contact-item\{grid-column:auto !important/.test(html),
    "a two-column placement survives into a one-column grid and leaves holes");
  check("the strip sits at the bottom of the document", /margin-top:auto/.test(rule),
    "the strip floats mid-card once the card is taller than its content");
  check("the document card fills the row beside the side column",
    /\.doc-card\{[^}]*align-self:stretch/.test(html),
    "the card stops short of the last side card and leaves a hole under it");

  const cv = html.match(/\.contact-item \.cv\{([^}]*)\}/)?.[1] ?? "";
  check("a contact value is never clipped by its column", !/white-space:nowrap/.test(cv),
    "a fixed-width column plus nowrap spills the address out of the card");

  check("P9 · the column check can see the pre-fix shape",
    !/display:grid/.test("display:flex;flex-wrap:wrap;gap:18px 28px"));
}

// ── a confirmation is an event, not a permanent green sentence ───────────────
// One press of Copy produced TWO messages — a global note beside the title AND a note
// appended at the button — and neither was ever removed. Three copies left three
// confirmations on screen, which is what "a glitch that does not go away" was.
console.log("\n── the copy confirmation clears itself ──");
{
  check("the note is on a timer", /noteTimer\s*=\s*setTimeout/.test(live),
    "note() shows a message with nothing scheduled to take it down");
  check("a second press restarts the clock rather than stacking",
    /if \(noteTimer\) \{ clearTimeout\(noteTimer\)/.test(live),
    "two presses leave two pending timers and the first clears the second's message");
  check("the note is hidden again, not merely emptied", /n\.hidden = true/.test(live),
    "an empty but visible note keeps its layout space");
  check("the note at the button is removed too", /\.cs-localnote[\s\S]{0,400}?remove\(\)/.test(live),
    "the local confirmation is reused forever and never taken down");
  check("one press writes one confirmation",
    /if \(where\) localNote\(where, msg, ok\); else note\(msg, ok\)/.test(live),
    "the same copy is reported in two places at once");
  check("a save is not taken down mid-flight", /note\('Saving…', true, true\)/.test(live),
    "the in-progress message expires while the request is still open");

  check("P10 · the timer check can see the pre-fix shape",
    !/noteTimer\s*=\s*setTimeout/.test("function note(m,o){var n=el('#csNote');n.hidden=false;n.textContent=m;}"));
}

// ── how many awards were won, and how many are being sent ────────────────────
// The route caps past performance, and every number on the page counted the CAPPED
// array. A customer with 300 wins read "AWARDS ON FILE 20" and sent a statement that
// understated their own record to a contracting officer, with nothing saying a cap
// existed. Separately the PDF capped at 12 where the page capped at 20, so the
// document they checked on screen was not the document they sent.
console.log("\n── the count is the total, not the slice ──");
{
  const limits = read("src/lib/capability-statement-limits.ts");
  const pageLimit = Number(limits.match(/PAST_PERFORMANCE_LIMIT = (\d+)/)?.[1]);
  const exportLimit = Number(limits.match(/PAST_PERFORMANCE_EXPORT_LIMIT = (\d+)/)?.[1]);
  const api = read("src/app/api/capability-statement/route.ts");
  const pdf = read("src/app/api/capability-statement/pdf/route.tsx");

  check("there is one page cap and one export cap", pageLimit > 0 && exportLimit > 0,
    `parsed page=${pageLimit} export=${exportLimit}`);
  check("the export cap is within the 3–5 convention", exportLimit >= 3 && exportLimit <= 5,
    `a capability statement carries three to five entries; this sends ${exportLimit}`);
  // Only slices taken OF THE AWARD LIST count — `toISOString().slice(0, 10)` is a date.
  const literalPastSlice = /(past|ranked)[^\n]{0,80}\.slice\(\s*0\s*,\s*\d+\s*\)/;
  check("no route hardcodes its own past-performance cap",
    !literalPastSlice.test(pdf) && !literalPastSlice.test(api),
    "a second literal cap will drift from the shared one, which is how 20-vs-12 happened");
  check("the PDF takes the export cap from the shared module",
    /PAST_PERFORMANCE_EXPORT_LIMIT/.test(pdf) && /capability-statement-limits/.test(pdf),
    "the printed document can silently carry a different number of rows than the page");
  check("the copy export uses the same number as the PDF",
    Number(live.match(/var EXPORT_LIMIT = (\d+)/)?.[1]) === exportLimit,
    "paste and PDF disagree on how much of the record they send");

  check("the route reports the total separately from the slice",
    /past_performance_total/.test(api) && /const pastTotal = ranked\.length/.test(api),
    "the client has no way to know anything was left out");
  check("the total is counted before the cap is applied",
    api.indexOf("const pastTotal = ranked.length") < api.indexOf("ranked.slice(0, PAST_PERFORMANCE_LIMIT)"),
    "counting after the slice reports the cap as though it were the total");
  check("the awards stat prints the total", /PAST_TOTAL === null \? perf\.length : PAST_TOTAL/.test(live),
    "the headline number is the capped array length");
  check("absent is not zero", /typeof d\.past_performance_total === 'number'/.test(live),
    "a route that does not send a total would be read as zero awards");

  for (const [what, src] of [["the page", live], ["the printed document", pdf]] as const) {
    check(`${what} says when it is showing a subset`, /most recent/.test(src),
      "a shortened list is indistinguishable from a complete one");
  }
  check("the PDF does not state a total it cannot prove", !/of \$\{pastTotal\}/.test(pdf),
    "that route reads the already-capped row, so any total it printed would be wrong");

  check("P11 · the shared-cap check can see a re-hardcoded slice",
    /slice\(0,\s*\d+\)/.test("past.slice(0, 12).map"));
}

// ── one export home ──────────────────────────────────────────────────────────
// Two controls fired the identical handler with identical output, and the one in the
// side card reported success ~900px below the fold. The PDF route, meanwhile, was 187
// complete lines with ZERO callers while the page said PDF export did not exist.
console.log("\n── export is one place, and it claims only what is wired ──");
{
  check("there is exactly one copy control", (html.match(/data-cs-copy/g) || []).length === 1,
    "two buttons, one behaviour — the second is a duplicate with no distinct purpose");
  check("PDF download is reachable", /data-cs-pdf/.test(html) && /data-cs-pdf/.test(live),
    "a built, working route with no caller is not a shipped capability");
  check("the PDF button is handled, not just present",
    /function downloadPdf/.test(live) && /API \+ '\/pdf'/.test(live),
    "the control exists and does nothing");
  check("a refused export is read out, not dumped as JSON",
    /b\.error/.test(live) && /Could not build the PDF/.test(live),
    "the route's 409 and 404 carry text the customer can act on");
  check("the page no longer says PDF export is unbuilt", !/PDF and Word export are not built/.test(html),
    "the page denies a capability it now offers");
  check("Word export is still declared unbuilt", /Word export is not built yet/.test(html),
    "an unbuilt format must keep saying so");
  check("the retired Export card is gone", !/class="export-list"/.test(html),
    "the side card and the header cluster both claim to be the export home");
  check("both actions sit together", /export-actions[\s\S]{0,900}?data-cs-copy[\s\S]{0,900}?data-cs-pdf/.test(html),
    "the two export actions are not in one cluster");

  check("P12 · the duplicate-control check can see two copies",
    (('data-cs-copy data-cs-copy').match(/data-cs-copy/g) || []).length === 2);
}

// ── the card is the document; the history is the record ─────────────────────
// The statement card showed up to twenty awards while the export sent five, so the
// thing labelled GENERATED STATEMENT was not the thing that got generated. The card
// now renders exactly what leaves with the statement, and every win lives in a
// full-width Award history below it — which is the record, and is not sent.
console.log("\n── the statement card shows what actually exports ──");
{
  const limits = read("src/lib/capability-statement-limits.ts");
  const exportLimit = Number(limits.match(/PAST_PERFORMANCE_EXPORT_LIMIT = (\d+)/)?.[1]);

  check("the card renders no more rows than the export carries",
    /rows\.slice\(0, EXPORT_LIMIT\)\.forEach/.test(live),
    "the preview shows awards the document will not contain");
  check("the card says which of them go out", /go out with the statement/.test(live),
    "five rows with no caption reads as the whole record");

  check("award history is a section, not a card in the grid",
    /<\/section>\s*<!-- award history[\s\S]*?<section class="award-history"/.test(html),
    "it sits inside the two-column grid and cannot run full width");
  check("award history is outside the statement card",
    !/<article class="doc-card">[\s\S]*?award-history[\s\S]*?<\/article>/.test(html),
    "the record is inside the document it is meant to sit apart from");
  check("it ships hidden", /<section class="award-history" id="awardHistory" hidden>/.test(html),
    "a section with no rows paints an empty table on first load");
  check("only a settled read may reveal it", /section\.hidden = false/.test(live),
    "nothing ever unhides it, so it is dead markup");

  check("it appears only when the record exceeds the document",
    /if \(total <= EXPORT_LIMIT\) \{ section\.hidden = true; return; \}/.test(live),
    "it repeats the same rows the card already shows");
  check("it lists every row the route sent", /rows\.forEach\(function \(p\) \{[\s\S]{0,400}?ah-row/.test(live),
    "the history applies a cap of its own and stops being the record");
  check("it says it is not the sent document", /This is your record — the statement above sends/.test(live),
    "a second award list with no framing reads as part of the statement");
  check("it reports its own shortfall too", /most recent of ' \+ total \+ ' awards/.test(live),
    "a capped history presents itself as complete");

  // An absent award value must stay blank. A dash in the VALUE column reads to a
  // contracting officer as a figure of nothing; the other columns may dash, because
  // "no contract number recorded" is not a claim about what the work was worth.
  check("a missing award value is blank, never a dash",
    /ah-value[\s\S]{0,320}?contract_value !== null/.test(live),
    "an unrecorded value prints as an em dash in a money column");

  check("the header row is labelled for assistive tech", /role="columnheader"/.test(html),
    "a grid of divs with no roles is not a table to a screen reader");
  check("the table collapses on narrow screens",
    /@media \(max-width:900px\)\{[\s\S]{0,200}?\.ah-row\{grid-template-columns:1fr/.test(html),
    "five columns at phone width crush every cell");

  check("P13 · the card-cap check can see an uncapped loop",
    !/rows\.slice\(0, EXPORT_LIMIT\)\.forEach/.test("rows.forEach(function (p) {"));
  check("P14 · the containment check can see history inside the card",
    /<article class="doc-card">[\s\S]*?award-history[\s\S]*?<\/article>/.test(
      '<article class="doc-card"><div class="award-history"></div></article>'));
}

// ── one field, one rendering, on every surface it reaches ────────────────────
// The page and the clipboard ran the number through the client's fmtPhone(); the PDF
// printed `contact_phone` straight off the record. So the customer checked
// "(203) 456-7890" on screen and sent a document reading "12034567890" to a
// contracting officer. Confirmed on a real production download, 2026-08-09.
console.log("\n── the phone reads the same everywhere ──");
{
  const pdf = read("src/app/api/capability-statement/pdf/route.tsx");
  const fmt = read("src/lib/capability-statement-format.ts");

  check("the printed document formats the phone", /formatPhone\(stmt\.contact_phone\)/.test(pdf),
    "the PDF prints the raw record value while every other surface formats it");
  check("it uses the shared formatter", /from "@\/lib\/capability-statement-format"/.test(pdf),
    "a second copy of the rule will drift from the client's");
  check("no surface prints the bare field", !/\{stmt\.contact_phone\}/.test(pdf),
    "an unformatted contact_phone still reaches a rendered surface");

  // public/*.js is served verbatim and cannot import from src/lib, so there are
  // necessarily two implementations. They are held together by asserting BOTH carry the
  // same four rules — strip non-digits, drop a leading country 1 on an 11-digit number,
  // bail out unless exactly 10 remain, and emit (xxx) xxx-xxxx. Behaviour is then
  // checked against a transcription of those rules. Structural, not executed: the
  // alternative is evaluating shipped source inside the gate, which is worse.
  const RULES: Array<[string, RegExp, RegExp]> = [
    ["strips non-digits",        /replace\(\/\\D\/g, ''\)/,            /replace\(\/\\D\/g, ""\)/],
    ["drops a leading 1 of 11",  /length === 11 && .*charAt\(0\) === '1'/, /length === 11 && .*startsWith\("1"\)/],
    ["bails unless 10 remain",   /length !== 10\) return String\(v\)/,  /length !== 10\) return raw/],
    ["emits \\(xxx\\) xxx-xxxx", /'\(' \+ .*slice\(0, 3\)/,             /\(\$\{.*slice\(0, 3\)\}\)/]
  ];
  for (const [what, clientRe, serverRe] of RULES) {
    check(`client and server both ${what}`, clientRe.test(live) && serverRe.test(fmt),
      `client=${clientRe.test(live)} server=${serverRe.test(fmt)} — the two renderings will diverge`);
  }

  const format = (value: string | null | undefined): string => {
    const raw = String(value ?? "");
    if (!raw.trim()) return raw;
    let d = raw.replace(/\D/g, "");
    if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
    if (d.length !== 10) return raw;
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  };
  check("the number the PDF got wrong now formats", format("12034567890") === "(203) 456-7890",
    "the exact value downloaded from production on 2026-08-09");
  check("a plain 10-digit number formats", format("2034567890") === "(203) 456-7890");
  check("an already-formatted number is stable", format("(203) 456-7890") === "(203) 456-7890");
  check("an extension is passed through untouched", format("203-456-7890 x22") === "203-456-7890 x22",
    "a number with an extension is mangled into a shape it does not have");
  check("a foreign number is passed through untouched", format("+44 20 7946 0958") === "+44 20 7946 0958");
  check("empty stays empty", format("") === "" && format(null) === "");

  check("P15 · the parity check can see a divergent implementation",
    !/length !== 10\) return raw/.test("function fmtPhone(v){return String(v).replace(/\\D/g,'')}"));
}

// ── the document is the customer's, and it is dated correctly ────────────────
// Two CEO rulings, 2026-08-09. (1) DUNS was retired for federal use in April 2022 when
// UEI replaced it, and it was printing in the pasted copy while being absent from the
// PDF — one document, two identifier sets, one of them dating the firm. (2) The
// FARaudit wordmark sat above the customer's company name on a document they send to a
// contracting officer under their own name.
console.log("\n── whose document this is ──");
{
  const pdf = read("src/app/api/capability-statement/pdf/route.tsx");

  // Match the RENDERING, not the word — a comment mentioning DUNS is not a DUNS on the
  // document, and a check that cannot tell the difference fails for the wrong reason.
  for (const [surface, src] of [["the pasted copy", live], ["the printed document", pdf]] as const) {
    check(`${surface} prints no DUNS`,
      !/['"`]DUNS /.test(src) && !/\.duns\b/.test(src),
      "an identifier retired for federal use in April 2022 is on a document sent to a CO");
  }

  // Scope to the HTML export: the plain-text builder names the same fields, so an
  // unscoped indexOf compares positions in two different functions.
  const htmlFn = live.slice(live.indexOf("function statementHtml()"), live.indexOf("function copyStatement"));
  check("the pasted copy leads with the company, not with us",
    htmlFn.indexOf("Capability Statement</div>") < htmlFn.indexOf("company name not set"),
    "the vendor's name sits above the customer's on their own letterhead");
  check("the pasted copy carries no FARaudit letterhead",
    !/FAR<span style="color:/.test(live),
    "our wordmark is still rendered into the head of the document");
  check("the pasted copy credits FARaudit in the footer", /Prepared with FARaudit/.test(live),
    "the credit was removed rather than moved");

  check("the printed document's header is the company", /<Text style={styles\.brand}>{company}<\/Text>/.test(pdf),
    "the PDF header is not the customer's name");
  check("the printed document credits FARaudit in the footer", /Prepared with FARaudit/.test(pdf),
    "the credit was removed rather than moved");
  check("no dead brand styles remain", !/brandGold/.test(pdf) && !/companyName:/.test(pdf),
    "styles for the retired header are still declared");

  check("P16 · the DUNS check can see a reintroduced line",
    /DUNS/.test("ids.push('DUNS ' + esc(REC.duns));"));
}

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
