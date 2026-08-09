// SETTINGS MUST NOT CLAIM A SAVE IT CANNOT PERFORM.
//   npx tsx test/public/_settings-honesty.test.ts
//
// Found 2026-08-05. The page rendered a COMPLETE form — seven <input> boxes, a
// "Save changes" button, a "✓ Saved" badge, the header line "changes save
// automatically", and "Synced from SAM.gov · Last sync May 28, 2026" — over an API
// with NO write path at all. Every keystroke was discarded and the page said it had
// saved. Nothing asserted on it, so "wired" and "a form that throws your typing
// away" were indistinguishable from the repo.
//
// The rule this pins: a control may only claim what the code can do. An input with
// no write path is a lie the moment a customer types in it.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};
const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const html = read("public/profile-settings.html");
const app = read("public/ps-app.js");
const live = read("public/profile-settings-live.js");
const route = read("src/app/api/profile/route.ts");
const capRoute = read("src/app/api/capability-statement/route.ts");

// Comments are documentation, not shipped claims. Scanning them made two checks fire on
// their own explanation of the bug they exist to prevent — the same way the capability
// gate did. Code only, for every check that asks "does this still ship?".
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const appCode = codeOnly(app);
const liveCode = codeOnly(live);
const htmlCode = html.replace(/<!--[\s\S]*?-->/g, "");

// ── THE PAGE MAY ONLY READ FIELDS THE ROUTE RETURNS ────────────────────────────────────
// Found 2026-08-05, live, on a real record: Settings rendered "CAGE code — Not on file"
// while capability_statements held 8TZ42. The client read `rec.cage` and `rec.address`;
// the route returns `cage_code` and `contact_address` and never returned the other two.
// A misspelt key is indistinguishable from an empty record — undefined || '' is '' — so
// the page stated a FACT ABOUT THE CUSTOMER'S RECORD that was false, and nothing failed.
//
// The route's first-visit stub literal enumerates its own response shape, so it is the
// contract to check the client's reads against.
console.log("── every field the page reads is a field the route returns ──");
{
  const stub = capRoute.slice(capRoute.indexOf("statement: {"), capRoute.indexOf("stub: true"));
  const shape = new Set([...stub.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]));
  check("the stub literal was located", shape.size > 8, `only found ${shape.size} fields`);

  // Comments stripped first: a comment naming the wrong key is documentation, not a read,
  // and scanning it made this check fire on its own explanation of the bug.
  const capBlock = live
    .slice(live.indexOf("capability-statement"), live.indexOf("AGENCIES"))
    .split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const reads = [...new Set([...capBlock.matchAll(/\brec\.(\w+)/g)].map((m) => m[1]))];
  check("the page reads at least one company field", reads.length > 0, "no rec.* reads found — did the block move?");
  for (const key of reads) {
    check(`page reads rec.${key} — route returns it`, shape.has(key), `route returns [${[...shape].join(", ")}]`);
  }

  // A read that lands on the envelope instead of the record reports every field absent.
  check("no fallback that accepts the envelope as the record", !/\|\|\s*cap\s*\)/.test(live), "`cap.statement || cap` makes an outage look like an empty record");
  check("a missing statement is reported, not rendered as empty", /company-unreadable/.test(live) && /no statement in response/.test(live), "an unreadable record silently reads as 'Not on file'");

  // Planted positives — the parity check must be able to go red.
  check("K-P1 · rejects a key the route does not return", !shape.has("cage"), "the route would have to return `cage` for this to be a false alarm");
  check("K-P2 · accepts a key the route does return", shape.has("cage_code"));
  check("K-P3 · the envelope check rejects the old fallback", /\|\|\s*cap\s*\)/.test("const rec = (cap && (cap.statement || cap)) || {};"));
}

console.log("\n── the page claims no save it cannot perform ──");
// COUNT THE SURFACES. The first version of this check scanned profile-settings.html
// only. #483 removed the claim from the HTML and it survived in ps-app.js, which
// injects the same string at runtime — so this gate passed green over the exact lie
// it was written to kill. A claim is not gone because it left one file.
{
  const everywhere = [["profile-settings.html", htmlCode], ["ps-app.js", appCode], ["profile-settings-live.js", liveCode]];
  const carriers = everywhere.filter(([, src]) => /changes save automatically/i.test(src)).map(([f]) => f);
  check("no 'changes save automatically' claim ON ANY SETTINGS SURFACE", carriers.length === 0, `still promised in: ${carriers.join(", ")}`);
}
check("no hardcoded 'Last sync <date>'", !/Last sync \w+ \d{1,2}, \d{4}/.test(app), "a literal sync date is back");
check("no unconditional '✓ Saved' badge in the company panel", !/<span class="saved">✓ Saved<\/span>/.test(app.split("naics:")[0]), "the account panel asserts saved with nothing behind it");

console.log("\n── a write path exists, and only for the person ──");
check("/api/profile exposes PATCH", /export async function PATCH/.test(route), "the save button has no endpoint");
check("PATCH refuses email and plan_tier explicitly", /READ_ONLY[\s\S]{0,200}plan_tier/.test(route) && /rejected/.test(route), "a dropped field would report success");
check("PATCH echoes the PERSISTED value, not the request body", /did not persist/.test(route), "success is reported without reading the write back");
check("the save handler believes the server echo", /body\.full_name !== full_name/.test(live), "the client trusts its own input");
// Keyed on BEHAVIOUR, not on one phrase. The previous form matched two exact strings,
// so rewording the handler turned the gate red while the handler still reported
// failure correctly — and, worse, a handler that dropped reporting entirely could
// pass by keeping the words.
check("the save handler reports failure to the user",
  /note\((?:[^)]*?),\s*false\)/.test(live), "no note(..., false) failure path — a failed save is silent");

console.log("\n── no control reports a save it did not perform ──");
{
  // Every panel but one shipped a "Save changes" button and an unconditional "Saved"
  // badge over nothing, and every toggle called a flash() that wrote "saved just now"
  // whether or not anything reached the server. #483 fixed one panel of four.
  const orphanFeet = (appCode.match(/<span class="saved">✓ Saved<\/span>/g) ?? []).length;
  check("no unconditional 'Saved' badge anywhere in the panels", orphanFeet === 0, `${orphanFeet} panels assert a save with nothing behind it`);
  check("no optimistic toggle handler", !/classList\.toggle\('on'\);\s*flash\(\)/.test(app), "a toggle flips and reports saved without a writer");
  // THE RULE IS THE FIRST PARAMETER, NOT THE ARITY. This pinned `function flash(what)`
  // exactly, so adding an outcome argument read as a regression while the property it
  // guards — that flash cannot be called bare and report a nameless "saved" — was
  // untouched. `\b` still rejects `function flash()`.
  check("flash() names what was saved", /function flash\(what\b/.test(app), "a generic 'saved' can be fired by a control that saves nothing");
  // A REFUSED SAVE IS REPORTED. Reverting the control is not a report: a toggle that
  // silently snaps back is indistinguishable from a dead one, so the failure branch has
  // to put a message on screen rather than clear it.
  check("a refused preference save is reported, not just reverted",
    /Could not save/.test(app) && !/flash\(''\)/.test(app),
    "the failure branch hides the note instead of naming the refusal");

  // Billing stated a plan and two prices while the route was returning all three.
  check("billing reads the live plan label", /planName\(\)/.test(app) && /PS\.plan_label/.test(app), "the plan name is a literal");
  // THE RULE INVERTED, ON PURPOSE. This previously required the page to READ two price
  // fields — which pinned a $1,250 constant that no customer's own subscription
  // determined. What a customer pays is agreed with their point of contact and is
  // stored nowhere the page can read, so the page must render NO price at all. An
  // assertion that a price is displayed is an assertion that a price is known.
  // SCANNED THE WRONG REGION at first: planPrice() is DEFINED above `billing: ()`, so
  // slicing from the panel never saw the function that produces the string. An unlisted
  // price ($4,800) sailed through. Scan the whole file for a rendered currency figure.
  // A dollar sign followed immediately by a digit. `${` cannot match (a brace is not a
  // digit), so template interpolation is not a false positive. The quote-spanning form
  // this replaced matched across string boundaries and fired on `' },`.
  const currency = [...app.matchAll(/\$\d[\d,]*/g)].map((m) => m[0]);
  check("no currency figure is rendered anywhere in the settings app",
    currency.length === 0,
    `price string(s) present: ${currency.join(" | ")}`);
  check("the route returns no price field",
    !/plan_price_monthly\s*[:,]/.test(route.split("READ_ONLY")[0]),
    "/api/profile still hands out a price the customer's subscription does not set");
  check("billing reads the SUBSCRIPTION, not user_metadata",
    /from\("subscriptions"\)/.test(route) && /plan_unreadable/.test(route),
    "the plan is not read from the row Stripe maintains, or an unreadable record is not distinguished");
  check("no hardcoded plan name or price survives", !/Design Partner<\/div>|\$1,250|\$15,000|\$2,500|\$30,000/.test(appCode), "a literal price is still rendered");
  check("no next-billing date — nothing computes one", !/Next billing:/.test(appCode), "a billing date with no source");

  // Planted positives.
  check("S-P1 · rejects a resurrected Saved badge", /<span class="saved">✓ Saved<\/span>/.test('<span class="saved">✓ Saved</span>'));
  check("S-P2 · rejects a resurrected literal price", /\$1,250/.test('<div class="pc-desc">$1,250 / month</div>'));
  check("S-P3 · accepts a panel with neither", !/<span class="saved">|\$1,250/.test('<div class="pc-name">${planName()}</div>'));
}

console.log("\n── company fields are read-only, not fake inputs ──");
const panel = app.slice(app.indexOf("company: ()"), app.indexOf("naics: ()"));
check("company panel renders no <input> for company fields", !/\$\{field\('Company name'/.test(panel) && !/\$\{field\('SAM\.gov UEI'/.test(panel), "a company field is still an editable box with no writer");
// THE DURABLE RULE IS NOT "ONE INPUT" — it is that every input has a writer. The
// earlier form asserted a snapshot (only full_name had a write path), so building the
// company writers turned an honest page red. What must never happen is an <input> the
// save handler cannot see.
// WHOLE FILE, not just the company panel. Scoped to one panel, an input added to any
// other tab was invisible to this check — which is exactly how an inert control ships.
const editableIds = [...app.matchAll(/\$\{editable\('([^']+)'/g)].map((m) => m[1]);
check("every editable field carries an id", editableIds.length > 0, "no editable fields found — did the panel move?");
const unwritten = editableIds.filter((id) => !live.includes(id));
check("EVERY editable field is read by the save handler", unwritten.length === 0,
  `input(s) with no writer: ${unwritten.join(", ")}`);
// The NAICS ✕ is a <button>, not an <input>, so the editable() sweep above cannot see
// it. An inert remove control is the same defect in different markup.
const rmKeys = [...app.matchAll(/data-naics-rm="\$\{esc\(([^)]+)\)\}"/g)];
check("the NAICS remove control exists", rmKeys.length > 0, "no data-naics-rm in ps-app.js");
// Assert the BINDING, not the string. The first form matched `data-naics-rm` anywhere
// in the file, so breaking the delegated selector while leaving a getAttribute call
// behind kept it green — a check satisfied by a line that no longer runs.
check("the NAICS remove control is bound by a delegated selector",
  /closest\(\s*['"]\[data-naics-rm\]['"]\s*\)/.test(live),
  "no closest('[data-naics-rm]') — the Remove button is not actually wired");
check("NAICS writes are confirmed by set equality, not by a 2xx", /sameSet\s*\(/.test(live),
  "a 200 with a discarded write would report success");
// NAICS LAUNDERING. The GET overlays codes derived from won audits when nothing is
// saved, so an editor that reads the DISPLAYED array, adds one code and writes the
// result back persists suggestions as customer-entered data. The write must be built
// from the row, read at write time — never from page state.
check("the route reports what is SAVED separately from what is displayed",
  /naics_saved/.test(capRoute) && /naics_derived/.test(capRoute),
  "the GET does not distinguish the persisted array from the derived overlay");
// Scoped to the LOAD path. A blanket ban on `rec.naics_codes` was wrong: the PATCH
// echo legitimately reads it, and a PATCH response carries no overlay.
const loadPath = live.slice(0, live.indexOf("function setLivePill"));
check("the editor seeds its list from naics_saved, not the overlay",
  /cap\.naics_saved/.test(loadPath) && !/rec\.naics_codes/.test(loadPath),
  "the panel is populated from the overlay — adding one code would persist the rest");
check("NAICS writes re-read the row before mutating it",
  /async function savedCodes\(/.test(live) && /mutate\(await savedCodes\(\)\)/.test(live),
  "a whole-array write is built from stale page state");
check("email is never an input — it is auth identity, not a profile column",
  !/\$\{editable\('psEmail'/.test(panel) && /\$\{ro\('Email'/.test(panel),
  "email rendered as an editable box without a verification flow behind it");
check("company record links out to its real editor", /href="\/capability-statement"/.test(panel), "no route to where the company is actually edited");
check("empty NAICS states the consequence", /stay empty/.test(panel), "an empty feed is not explained");

console.log("\n── an unfilled chip may not promise a check that never runs ──");
// The row had TWO visual states over FOUR real kinds. 8(a), HUBZone, WOSB and EDWOSB are
// the whole of SAM's SBA certification vocabulary, so those genuinely fill in when a
// registration resolves. SDVOSB and VOSB are issued by VA VetCert and appear in that list
// at NO UEI — grouping them with the first set told a customer to wait for an answer that
// is never coming. "Small business" is a third kind again: self-represented per
// solicitation, with no certification to establish.
{
  check("the source still records that SAM cannot establish SDVOSB",
    /never establish se:sdvosb|NO SDVOSB CODE/i.test(read("src/lib/cert-verification.ts")),
    "if a VetCert source was added, this panel's dead-end state must be revisited");

  check("a VetCert predicate exists", /function isVetCertProgram\(/.test(appCode), "no predicate — the kinds are collapsed again");
  check("the chip renderer branches on it", /isVetCertProgram\(k\)/.test(appCode), "the predicate exists but no chip uses it");
  check("the dead-end chip is visually distinct from a pending one",
    /cert-tg is-elsewhere/.test(appCode) && /\.cert-tg\.is-elsewhere\s*\{/.test(htmlCode),
    "same grey as an awaiting-SAM chip, so it still reads as pending");

  // TWO VISUAL STATES, ONE MEANING EACH: plain grey says "waiting on SAM, this fills in";
  // dashed says "not settled here at all". Self-represented size class belongs with the
  // second — `canonicalizeEligibilityAttr` only ever yields se:*, so a small-business
  // chip can no more turn green than a VetCert one. Rendering it plain grey beside 8(a)
  // promises the same fill-in from a check that likewise never runs.
  {
    const chipFn = appCode.slice(appCode.indexOf("function certChip("), appCode.indexOf("function certCaption("));
    const plainGrey = [...chipFn.matchAll(/class="cert-tg"/g)].length;
    check("only the awaiting-SAM chip is plain grey", plainGrey === 1,
      `${plainGrey} branches render plain grey — a kind that never fills in looks like one that does`);
    check("the self-represented chip is marked as not-settled-here",
      /isSelfRepresented\(k\)\)\s*\{[\s\S]{0,120}cert-tg is-elsewhere/.test(chipFn),
      "small business renders as pending, beside programs that really do fill in");
    check("V-P5 · rejects a self-represented chip rendered plain grey",
      !/cert-tg is-elsewhere/.test('return `<span class="cert-tg" title="Self-represented in SAM">${name}</span>`;'));
  }

  // EXECUTED, not grepped. A gate that only proves the regex is present cannot tell a
  // correct one from a wrong one, and BOTH error directions matter here: a miss leaves the
  // false promise, and a false positive sends a program SAM really does establish to a
  // dead end it does not belong in.
  // [\s\S] rather than `.` with the `s` flag: dotAll needs an es2018 target and the
  // repo's tsc rejects it, so the flag would pass under tsx and fail the build.
  const src = appCode.match(/function isVetCertProgram\(name\)\s*\{\s*return\s*(\/[\s\S]+?\/i)\.test/);
  check("the predicate's pattern was located", !!src, "could not extract the regex to execute it");
  if (src) {
    const re = new RegExp(src[1].slice(1, src[1].lastIndexOf("/")), "i");
    const mustMatch = ["SDVOSB", "VOSB", "sdvosb", "Service-Disabled Veteran-Owned Small Business", "Veteran Owned Small Business"];
    const mustNot = ["WOSB", "EDWOSB", "Women-Owned Small Business", "Economically Disadvantaged Women-Owned Small Business", "Small Business (SBA)", "8(a)", "HUBZone"];
    for (const s of mustMatch) check(`VetCert · matches "${s}"`, re.test(s), "would keep promising a SAM check that never runs");
    for (const s of mustNot) check(`VetCert · does NOT match "${s}"`, !re.test(s), "a program SAM DOES establish sent to a dead-end state");
  }

  // The caption must count the kinds apart, or the numbers restate the collapsed row.
  check("the caption counts VetCert separately from carried-and-unestablished",
    /issued by VA VetCert/.test(appCode) && /carried on your profile, not established in SAM/.test(appCode),
    "one bucket again — the count cannot distinguish the two");

  // THE PROMISE IS THE THING BEING GATED. "fill in on their own" may only appear when a
  // chip is genuinely waiting on SAM, which excludes both other kinds.
  check("the fill-in-on-their-own promise is gated on a chip that awaits SAM",
    /awaitingSam/.test(appCode) && /if\s*\(awaitingSam\)/.test(appCode),
    "the promise is unconditional, so a VetCert-only row is told to wait");
  check("awaitingSam excludes BOTH other kinds",
    /!isSelfRepresented\(k\)\s*&&\s*!isVetCertProgram\(k\)/.test(appCode),
    "a kind that is not awaiting SAM still triggers the promise");

  // ...and the stamp must NOT be gated on the row, or a true fact about the registration
  // disappears whenever the row happens to hold only VetCert entries.
  const noteFn = appCode.slice(appCode.indexOf("function certNote()"), appCode.indexOf("function editable("));
  check("the SAM state stamp survives a row with nothing awaiting SAM",
    !/if\s*\(!st\s*\|\|\s*!any/.test(noteFn) && /cert-state/.test(noteFn),
    "the stamp is gated on the chips, so 'Not found in SAM' vanishes on a VetCert-only profile");

  // THE NOTE MAY NOT SEND THE CUSTOMER TO AN EDITOR THAT DOES NOT EXIST. No screen in the
  // product writes capability_statements.certifications: the statement page only prints the
  // list, profile-editor is NAICS-only by design, and this panel renders chips, not inputs.
  // A sentence routing the reader to the statement to change them describes a product we do
  // not ship — the defect PR #514 removed, restated in prose instead of an <input>.
  const companyPanel = appCode.slice(appCode.indexOf("company: () =>"), appCode.indexOf("/* The row carries the CODE"));
  check("the note does not route certifications to an editor",
    !/certifications on your <a href="\/capability-statement">/.test(companyPanel),
    "the note points at a page with no certification control");
  check("no certification write path exists to point at",
    !/certifications/.test(read("public/capability-statement.html")),
    "a control appeared — the note above may now name it");

  // THE NOTE OUTLIVES THE EMPTY STATE, so it carries the boundary too. Once one chip exists
  // the empty message is gone, and a firm holding HUBZone in SAM plus SDVOSB from VetCert
  // would read "your registrations appear here" beside a single chip — the same promise the
  // empty state was just fixed for, in the one case where the row is NOT empty.
  {
    const anchor = "Certifications are not typed anywhere";
    const at = companyPanel.indexOf(anchor);
    check("the certifications note exists to be checked", at !== -1, "anchor moved — this leg is inert");
    const noteText = at === -1 ? "" : companyPanel.slice(at, companyPanel.indexOf("</div>", at));
    check("the note names the VetCert boundary",
      /VetCert/.test(noteText),
      "a VetCert firm reads its one SAM chip as the whole answer");
  }

  // ...and it may not claim the typed value is inert. It is not: the audit engine reads the
  // same column and canonicalizes it into a satisfied eligibility attribute.
  check("the note does not claim there is nothing useful to type",
    !/nothing useful to type/i.test(companyPanel),
    "the page calls a value inert that the engine acts on");

  // THE ROW MUST BE FED BY SAM, NOT ONLY BY THE CARRIED LIST. Promotion alone can only turn
  // green an entry the company record already holds, and no screen writes that column — so a
  // registered firm read "None on file" under a stamp saying "Registered in SAM".
  const markFn = liveCode.slice(liveCode.indexOf("async function markVerifiedCerts()"), liveCode.indexOf("function shapeError("));
  check("SAM's records are ADDED to the row, not merely matched against it",
    /CERTS\.push\(/.test(markFn),
    "the row can still only display what the record already carried");
  check("the row renders REGISTRATIONS, not containment-derived programs",
    /d\.records/.test(markFn) && !/establishedPrograms[\s\S]{0,80}CERTS\.push/.test(markFn),
    "an SDVOSB registration would print VOSB as a second registration");
  check("the header count is recomputed after the SAM read",
    /writeHeaderStats\(\)/.test(markFn),
    "the strip reports a total the row below it contradicts");

  // AN EMPTY ROW HAS FIVE CAUSES. Collapsing them tells four of those five customers something
  // untrue, and the fifth — our own read failing — is told they hold nothing.
  check("the empty row is state-derived, not a fixed string",
    /certEmpty\(\)/.test(appCode) && !/cert-row">\$\{CERTS\.length \? [\s\S]{0,80}None on file/.test(appCode),
    "one message for five different answers");
  for (const st of ["no-uei", "uei-not-found", "registration-inactive", "verified"]) {
    check(`certEmpty branches on '${st}'`, new RegExp(`'${st}'`).test(appCode), "that cause collapses into the default");
  }
  {
    const emptyFn = appCode.slice(appCode.indexOf("function certEmpty()"), appCode.indexOf("function certCaption("));
    // The unread case may not read as a quantity, and may not be the same sentence as the real zero.
    const real = emptyFn.match(/'verified'\s*\?\s*'([^']+)'/);
    const unread = emptyFn.match(/:\s*'([^']*could not be read[^']*)'/);
    check("the unread case is worded as UNKNOWN, not as zero",
      !!unread && /not known|unanswered|unknown/i.test(unread[1]) && !/^none\b/i.test(unread[1]),
      "our outage is reported to the customer as 'you hold none'");
    check("the unread case and the real zero are DIFFERENT sentences",
      !!real && !!unread && real[1] !== unread[1],
      "'we could not look' and 'you have none' render identically");

    // THE STATES THAT SPEAK FOR SAM MUST NAME WHAT SAM CANNOT CARRY. Its SBA list holds 8(a),
    // HUBZone, WOSB and EDWOSB only, so an unqualified "your programs appear here" promises a
    // VetCert firm something no registration delivers, and the real zero then reads as "you
    // hold none" to a firm that holds one. The caption already says this — but it needs a chip
    // to exist before it renders, and these are exactly the states where none does.
    const noUei = emptyFn.match(/'no-uei'\s*\?\s*'([^']+)'/);
    check("the no-UEI invitation names the VetCert boundary",
      !!noUei && /VetCert/.test(noUei[1]),
      "a service-disabled firm is invited to add a UEI that can never surface its status");
    check("the real-zero answer names the VetCert boundary",
      !!real && /VetCert/.test(real[1]),
      "'no socioeconomic programs' lands as 'you hold none' on a VetCert firm");
  }

  // Planted positives — per leg, not per section.
  const probe = /\bsdvosb\b|\bvosb\b|service[\s-]?disabled|veteran[\s-]?owned/i;
  check("V-P1 · a naive /vosb/ WOULD wrongly match nothing here but a bare one is caught", !probe.test("WOSB"));
  check("V-P2 · the executed check rejects a predicate that matches WOSB", /wosb/i.test("WOSB"), "control: the string really does contain wosb");
  check("V-P3 · rejects a collapsed caption", !/issued by VA VetCert/.test("1 carried on your profile, not established in SAM."));
  check("V-P4 · rejects an ungated promise", !/if\s*\(awaitingSam\)/.test("lines.push(why + ' These are read from your SAM registration');"));
  check("V-P5 · rejects a note routing certifications to the statement",
    /certifications on your <a href="\/capability-statement">/.test('and certifications on your <a href="/capability-statement">capability statement</a>.'));
  check("V-P6 · rejects a note calling the typed value inert",
    /nothing useful to type/i.test("so there is nothing useful to type."));
  check("V-P7 · rejects a promote-only marker that never adds a row",
    !/CERTS\.push\(/.test("window.PS.CERTS.forEach(function (c) { c.on = labels.some(fn); });"));
  check("V-P8 · rejects a fixed empty string in the cert row",
    /None on file/.test('<div class="cert-row">${CERTS.length ? x : \'<span class="fld-none">None on file</span>\'}</div>'));
  check("V-P9 · rejects an unread message that asserts zero",
    /^none\b/i.test("None on file"));
  check("V-P10 · rejects an empty-state promise that omits the VetCert boundary",
    !/VetCert/.test("Add your SAM.gov UEI above and the programs SBA has registered you under appear here on their own."));
  check("V-P11 · rejects a note that omits it",
    !/VetCert/.test("Certifications are not typed anywhere: the programs SBA has registered under the UEI above appear here on their own."));
}

// EVERY SWITCH MUST HAVE A HANDLER. PR #514 removed seven controls that wrote nowhere; the
// way that comes back is a toggle shipped ahead of the thing it governs. So each
// data-pref-tg key must (a) be accepted by the preferences API and (b) be READ by something
// that acts on it. A key the API stores and nothing consults is decoration.
{
  const keys = [...appCode.matchAll(/data-pref-tg="([a-z_]+)"/g)].map((m) => m[1]);
  check("the panel actually declares toggles to check", keys.length > 0, "no toggles found — this leg is inert");
  const prefRoute = read("src/app/api/preferences/route.ts");
  // ...AND THE COLUMN MUST EXIST. This gate shipped #541 green while two of its three
  // toggles wrote nowhere: PostgREST silently DROPS an unknown column, so the PATCH
  // answered 2xx, the switch moved, and the value vanished. Reading the key and being
  // able to STORE it are different claims, and only one was being checked.
  {
    const migrations = readdirSync(join(ROOT, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(ROOT, "supabase/migrations", f), "utf8")).join("\n");
    for (const k of [...appCode.matchAll(/data-pref-tg="([a-z_]+)"/g)].map((m) => m[1])) {
      check(`'${k}' has a migration that adds the column`,
        new RegExp(`ADD COLUMN IF NOT EXISTS ${k}\\b`).test(migrations),
        "PostgREST drops an unknown column — the PATCH would report success and store nothing");
    }
  }

  const consumers = [
    "src/lib/watcher-tick.ts",
    "src/app/api/cron/watched-digest/route.ts",
  ].map((f) => { try { return read(f); } catch { return ""; } }).join("\n");
  for (const k of keys) {
    check(`'${k}' is accepted by the preferences API`, new RegExp(`"${k}"`).test(prefRoute),
      "the toggle writes to a key the API will silently drop");
    check(`'${k}' is READ by something that acts on it`, new RegExp(k).test(consumers),
      "a switch with no handler — the #514 defect");
  }
}

// THE TAB MUST SAY WHERE ITS SUBJECT COMES FROM. Found by the CEO using the product: the
// panel governs "the notices you are watching" and never said how a notice BECOMES watched,
// so the link between pressing Track in Opportunities and receiving an email existed only in
// the code. A control whose input is undiscoverable is only half-shipped.
{
  const notifs = appCode.slice(appCode.indexOf("notifs: () =>"), appCode.indexOf("team: () =>"));
  check("the notifications panel names Track as the origin", /\bTrack\b/.test(notifs),
    "the tab never says how a notice becomes watched");
  check("...and links to where that is done", /href="\/notices"/.test(notifs),
    "the reader is told the mechanism but not where to find it");
  check("...and says what actually reaches them", /every hour/.test(notifs) && /run the audit/.test(notifs),
    "no account of what happens between tracking and the email");
}

// EVERY NAV KEY MUST HAVE A PANEL. Found by the CEO clicking Team Members and getting
// nothing: `PANELS[active] is not a function`. The panel had been deleted by an over-broad
// edit to its NEIGHBOUR, and shipped — every content check in this file still passed,
// because they all assert what a panel SAYS and none asserted that it EXISTS. A tab that
// renders nothing is the loudest possible defect and it was the one thing unguarded.
{
  const nav = [...appCode.matchAll(/\{\s*key:\s*['"]([a-z]+)['"]/g)].map((m) => m[1]);
  check("the NAV list was located", nav.length >= 3, `found ${nav.length} nav entries`);
  const panels = new Set([...appCode.matchAll(/^\s{4}([a-z]+):\s*\(\)\s*=>/gm)].map((m) => m[1]));
  check("at least one panel was located", panels.size > 0, "the PANELS scan found nothing — this leg is inert");
  for (const k of nav) {
    check(`nav key '${k}' has a panel function`, panels.has(k),
      "clicking this tab throws PANELS[active] is not a function and the panel never changes");
  }
}

// NOTHING MAY BE ASSERTED ABOUT A RECORD THAT HAS NOT BEEN READ YET.
// Measured live 2026-08-09 against production 763712b1: ps-app.js finishes at ~723ms and
// /api/profile does not answer until ~1220-1573ms. For that window every array in
// window.PS is empty while loadError is still false — byte for byte the shape of a real
// empty account — so Settings told an account holding three NAICS codes that it had none,
// and that Today, Opportunities, Contracting Officers and Teaming Partners "will stay
// empty". It corrected itself when the fetch landed. It was wrong until then.
//
// The page had a mechanism for exactly this and the mechanism was inert:
// profile-settings-live.js added `is-loading` to <body> and removed it again, and no CSS
// rule for that class exists anywhere in the repo. A flag name is not a behaviour.
//
// This leg does not grep for guards — it RUNS the page. ps-app.js is executed in a vm
// against a minimal DOM, every panel is opened through its own nav click handler, and the
// emitted HTML is read back. A panel that states absence without asking first goes red
// whether or not its author knew this rule existed.
console.log("\n── no absence is claimed before the read settles ──");
{
  // Statements about what THIS ACCOUNT holds. Every one is false while the answer is
  // still in flight. Copy about the PRODUCT — "usage metering is not built yet" — is
  // true at any time and is deliberately absent from this list.
  const RECORD_CLAIMS = [
    "None on file",
    "No NAICS codes on file",
    "will stay empty",
    "Not on file",
    "No subscription on file",
    "SAM could not be read just now",
    "This workspace has a single account, yours",
  ];

  type State = Record<string, unknown>;

  // Runs ps-app.js and returns the HTML each panel rendered, keyed by nav key.
  // `source` is a parameter so the planted positive can run the SAME harness over a
  // deliberately broken copy — a plant checked by a different code path proves nothing.
  const renderPanels = (source: string, state: State): Record<string, string> => {
    const written: Record<string, string> = {};
    const navButtons: Record<string, { dataset: { k: string }; onclick: null | (() => void) }> = {};
    const nodes: Record<string, Record<string, unknown>> = {};
    const node = (id: string) => {
      if (nodes[id]) return nodes[id];
      const n: Record<string, unknown> = {
        _html: "",
        get innerHTML() { return this._html as string; },
        set innerHTML(v: string) { this._html = v; written[id] = v; },
        // renderNav re-reads its own markup to bind the clicks. Handing back real button
        // stand-ins is what lets this test open a panel the way a customer does, rather
        // than reaching past the handler into the template.
        querySelectorAll(sel: string) {
          if (sel !== ".sn") return [];
          return [...String(this._html).matchAll(/data-k="([a-z]+)"/g)].map((m) => {
            const b = { dataset: { k: m[1] }, onclick: null as null | (() => void) };
            navButtons[m[1]] = b;
            return b;
          });
        },
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        hidden: false, textContent: "", disabled: false, value: "",
      };
      nodes[id] = n;
      return n;
    };
    const sandbox: Record<string, unknown> = {
      console: { log() {}, error() {} },
      setTimeout: () => 0,
      fetch: () => Promise.reject(new Error("no network in this harness")),
      document: {
        readyState: "complete",
        getElementById: (id: string) => node(id),
        addEventListener() {},
        body: { classList: { add() {}, remove() {} } },
      },
    };
    sandbox.window = sandbox;
    sandbox.PS = state;
    vm.createContext(sandbox);
    new vm.Script(source, { filename: "ps-app.js" }).runInContext(sandbox);

    const out: Record<string, string> = {};
    for (const [key, btn] of Object.entries(navButtons)) {
      btn.onclick?.();
      out[key] = written["setContent"] ?? "";
    }
    return out;
  };

  const inFlight = (): State => ({
    loadError: false, loaded: false,
    COMPANY: { name: "", cage: "", uei: "", address: "", contact: "", email: "", phone: "" },
    CERTS: [], NAICS: [], NOTIFS: [], TEAM: [], USAGE: [],
  });

  // ── 1 · the harness has to be real before its silence means anything ──────────
  const pending = renderPanels(app, inFlight());
  const navKeys = [...appCode.matchAll(/\{\s*key:\s*['"]([a-z]+)['"]/g)].map((m) => m[1]);
  check("the harness opened every nav panel", navKeys.length > 0 && navKeys.every((k) => k in pending),
    `opened [${Object.keys(pending).join(", ")}] · nav declares [${navKeys.join(", ")}]`);
  check("...and every panel rendered something", Object.values(pending).every((h) => h.length > 40),
    "a panel came back empty — these checks would pass on a blank page");

  // ── 2 · in flight, no panel states what the record holds ──────────────────────
  for (const key of Object.keys(pending)) {
    const said = RECORD_CLAIMS.filter((c) => pending[key].includes(c));
    check(`'${key}' claims nothing about the record before the read settles`, said.length === 0,
      `renders ${said.map((s) => JSON.stringify(s)).join(", ")} while the answer is still in flight`);
  }

  // ── 3 · NEGATIVE CONTROL — the real zero must still speak ─────────────────────
  // A guard that silences the genuine empty state is the same defect facing the other
  // way. A customer who truly holds no NAICS codes must still be told so, and told what
  // it costs. This is what stops the fix from being "hide it and pass".
  const settledEmpty = renderPanels(app, { ...inFlight(), loaded: true });
  check("N1 · a settled empty record still says 'None on file'",
    settledEmpty.company.includes("None on file"),
    "the guard swallowed the real empty state — a genuine zero is now invisible");
  check("N2 · ...and still states what an empty NAICS list costs",
    settledEmpty.company.includes("will stay empty"),
    "the consequence of holding no codes is no longer stated");
  check("N3 · ...and the NAICS panel still reports the zero",
    settledEmpty.naics.includes("No NAICS codes on file"),
    "the panel went quiet on a real empty list");
  check("N4 · ...and Billing still reports no subscription",
    settledEmpty.billing.includes("No subscription on file"),
    "an account with no plan is no longer told so");

  // ── 4 · a failed read renders as a failure on every record-bearing panel ──────
  const failed = renderPanels(app, { ...inFlight(), loaded: true, loadError: true });
  for (const key of ["company", "naics", "team"]) {
    check(`F · '${key}' renders a failure, not an empty answer, when the read failed`,
      failed[key].includes("could not be loaded"),
      "a connection failure is being shown to the customer as their own empty record");
  }

  // ── 5 · PLANTED POSITIVE — this leg must be able to go red ────────────────────
  // The guards are removed from a copy of the source and the SAME harness re-run. If it
  // comes back clean, everything above is decoration.
  const unguarded = app
    .replace("settled() ? '<span class=\"fld-none\">None on file</span>' : pending('Reading your record…')",
             "'<span class=\"fld-none\">None on file</span>'")
    .replace("${NAICS.length || !settled() ? '' :", "${NAICS.length ? '' :");
  check("PL1 · the plant actually removed both guards", unguarded !== app
    && !unguarded.includes("NAICS.length || !settled()"),
    "the guard text was not found — this planted positive is inert and proves nothing");
  const plantedOut = renderPanels(unguarded, inFlight());
  check("PL2 · without the guards the harness DOES see the claims",
    plantedOut.company.includes("None on file") && plantedOut.company.includes("will stay empty"),
    "the harness cannot see the defect it exists to catch — check 2 is passing for the wrong reason");

  // ── 6 · the inert mechanism must not come back ────────────────────────────────
  const anyStylesheetReads = /\.is-loading\b/.test(html);
  check("no body class stands in for the loaded state unless something styles it",
    !/is-loading/.test(liveCode) || anyStylesheetReads,
    "profile-settings-live.js toggles `is-loading` and no stylesheet reads it — an inert guard");
}


console.log("\n── planted positives ──");
check("P5 · rejects a panel that names no origin",
  !/\bTrack\b/.test("These apply to the notices you are watching."));
check("P6 · rejects a nav key with no panel",
  !new Set(["company","naics"]).has("team"));
check("P1 · rejects a resurrected auto-save claim", /changes save automatically/i.test('<b id="savedAt">changes save automatically</b>'));
check("P2 · accepts copy with no such claim", !/changes save automatically/i.test("<p>Your details and the company record.</p>"));
check("P4 · rejects a toggle whose key no consumer reads",
  !/nonexistent_pref_key/.test("watcher reads alerts_email_enabled and alerts_in_app_enabled"));
check("P3 · rejects a fake input for a company field", /\$\{field\('Company name'/.test("${field('Company name', COMPANY.name)}"));

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
