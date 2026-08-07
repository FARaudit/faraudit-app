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
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  check("flash() names what was saved", /function flash\(what\)/.test(app), "a generic 'saved' can be fired by a control that saves nothing");

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

console.log("\n── planted positives ──");
check("P1 · rejects a resurrected auto-save claim", /changes save automatically/i.test('<b id="savedAt">changes save automatically</b>'));
check("P2 · accepts copy with no such claim", !/changes save automatically/i.test("<p>Your details and the company record.</p>"));
check("P3 · rejects a fake input for a company field", /\$\{field\('Company name'/.test("${field('Company name', COMPANY.name)}"));

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
