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
