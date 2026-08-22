// Gate — a firm can find its own SAM record, and cannot be given someone else's.
//
// WHY THIS EXISTS. syncCertifications has been built for months and has NEVER RUN. It keys on a
// UEI, and nothing acquired one. Measured on the live profile: uei, cage_code and
// sam_registration_status are all NULL, attributes_v2 is empty, five of the nine ruled title-block
// cells render blank as a direct result, and FPDS past performance has no key — which is why
// past_performance is empty and the RFI draft had nothing real to cite.
//
// ⛔ THE HAZARD IS NOT "NO MATCH", IT IS THE WRONG MATCH. A name search is fuzzy by construction.
// Binding the top hit would attest ANOTHER FIRM'S SBA certifications onto this profile — and those
// certifications are what clear a set-aside bar. sam-entity.ts already refuses a fuzzy match on the
// UEI path for exactly this reason; the same rule has to hold here, with more force.
//
// ⛔ AND THE QUOTA IS SHARED. The entity API has a small DAILY allowance that resets 00:00 UTC. A
// lookup on page load or per keystroke would exhaust it for everything else we run.
//
// N1 search never binds · N2 the confirm re-reads from SAM · N3 the write is verified ·
// N4 the states stay distinct · N5 quota discipline · N6 planted positives.
//
// Run: npx tsx test/public/_sam-entity-lookup.test.ts
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};
const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const code = (p: string) =>
  readFileSync(join(ROOT, p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ROUTE = code("src/app/api/sam-entity-lookup/route.ts");
const LIB = code("src/lib/sam-entity.ts");

console.log("N1 · searching never binds a record");
ok(!/\.update\(|\.upsert\(|\.insert\(/.test(ROUTE.split("export async function POST")[0]),
  "the GET path writes nothing at all",
  "a fuzzy name match must never reach the profile");
ok(/searchEntitiesByName/.test(ROUTE), "it searches by name");
ok(!/candidates\[0\]|\.find\(|first/.test(ROUTE.split("export async function POST")[0]),
  "and never picks a candidate for the customer",
  "binding the top hit attests another firm's certifications onto this profile");

console.log("\nN2 · the confirm re-reads from SAM rather than trusting the client");
const POST = ROUTE.split("export async function POST")[1] || "";
ok(/lookupEntityByUei\(uei\)/.test(POST),
  "the chosen UEI is looked up again server-side");
ok(/\^\[A-Z0-9\]\{12\}\$/.test(POST), "and is shape-checked before any call");
ok(!/body\.(?:cage|name|registration)/.test(POST),
  "nothing but the UEI is taken from the request body",
  "the record bound comes from SAM in this request, not from the browser");
ok(/not-registered|uei-not-found/.test(POST),
  "a UEI SAM does not know writes nothing");

console.log("\nN3 · the write is verified, not assumed");
ok(/\.select\(/.test(POST) && /rows\.length === 0/.test(POST),
  "the update asks for the row back and treats zero rows as a failure",
  "PostgREST reports no error when an UPDATE matches zero rows under RLS");
ok(/syncCertifications\(/.test(POST),
  "and the existing sync runs once a key finally exists",
  "one author of that rule, not a second copy here");

console.log("\nN4 · the states stay distinct");
for (const st of ["unconfigured", "too-short", "unreachable", "none-found"]) {
  ok(ROUTE.includes(`"${st}"`), `GET reports ${st} as its own state`);
}
ok(/outage, not an answer/i.test(ROUTE),
  "an outage is never reported as 'you are not registered'",
  "that would tell a registered firm to fix a profile that is correct");
ok(/truncated/.test(ROUTE),
  "and a partial page says so rather than reading as the whole register");

console.log("\nN5 · quota discipline");
ok(/q\.length < 3/.test(LIB),
  "a query under three characters is refused before it costs a call");
ok(/registrationStatus:\s*"A"/.test(LIB),
  "the search asks SAM for ACTIVE registrations only",
  "a narrower query is a cheaper one");
ok(!/revalidate\s*=\s*\d|unstable_cache/.test(ROUTE),
  "the route is not wired to anything that could fire it on a page render");

console.log("\nN6 · planted positives");
ok(/\.update\(/.test('const x = supabase.from("t").update({uei})'),
  "the N1 detector would catch a write on the search path");
ok(!/lookupEntityByUei\(uei\)/.test('const e = body.entity;'),
  "the N2 detector would catch a confirm that trusted the client");
ok(/q\.length < 3/.test(LIB) && !/q\.length < 3/.test("const q = name;"),
  "the N5 floor check is not vacuous");

console.log(`\n${fail === 0 ? "✅ ALL PASS" : `❌ ${fail} RED`} — ${pass} check(s) green`);
process.exit(fail === 0 ? 0 : 1);
