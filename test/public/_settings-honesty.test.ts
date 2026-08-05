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

console.log("── the page claims no save it cannot perform ──");
check("no 'changes save automatically' claim", !/changes save automatically/i.test(html), "the header still promises auto-save");
check("no hardcoded 'Last sync <date>'", !/Last sync \w+ \d{1,2}, \d{4}/.test(app), "a literal sync date is back");
check("no unconditional '✓ Saved' badge in the company panel", !/<span class="saved">✓ Saved<\/span>/.test(app.split("naics:")[0]), "the account panel asserts saved with nothing behind it");

console.log("\n── a write path exists, and only for the person ──");
check("/api/profile exposes PATCH", /export async function PATCH/.test(route), "the save button has no endpoint");
check("PATCH refuses email and plan_tier explicitly", /READ_ONLY[\s\S]{0,200}plan_tier/.test(route) && /rejected/.test(route), "a dropped field would report success");
check("PATCH echoes the PERSISTED value, not the request body", /did not persist/.test(route), "success is reported without reading the write back");
check("the save handler believes the server echo", /body\.full_name !== full_name/.test(live), "the client trusts its own input");
check("the save handler reports failure to the user", /Could not save|did not persist/.test(live), "a failed save is silent");

console.log("\n── company fields are read-only, not fake inputs ──");
const panel = app.slice(app.indexOf("company: ()"), app.indexOf("naics: ()"));
check("company panel renders no <input> for company fields", !/\$\{field\('Company name'/.test(panel) && !/\$\{field\('SAM\.gov UEI'/.test(panel), "a company field is still an editable box with no writer");
check("company fields render through the read-only helper", /\$\{ro\('Company name'/.test(panel) && /\$\{ro\('SAM\.gov UEI'/.test(panel), "company fields are not marked read-only");
check("exactly one editable field — the person's name", (panel.match(/\$\{editable\(/g) ?? []).length === 1, `${(panel.match(/\$\{editable\(/g) ?? []).length} editable fields`);
check("company record links out to its real editor", /href="\/capability-statement"/.test(panel), "no route to where the company is actually edited");
check("empty NAICS states the consequence", /stay empty/.test(panel), "an empty feed is not explained");

console.log("\n── planted positives ──");
check("P1 · rejects a resurrected auto-save claim", /changes save automatically/i.test('<b id="savedAt">changes save automatically</b>'));
check("P2 · accepts copy with no such claim", !/changes save automatically/i.test("<p>Your details and the company record.</p>"));
check("P3 · rejects a fake input for a company field", /\$\{field\('Company name'/.test("${field('Company name', COMPANY.name)}"));

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
