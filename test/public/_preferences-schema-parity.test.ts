// Every preference the API can WRITE must be declared in schema/.
// Run: npx tsx test/public/_preferences-schema-parity.test.ts
//
// user_preferences was created in fa_intelligence_v2.sql and then grew five columns —
// theme, weekly_digest_watched, alerts_email_enabled, alerts_in_app_enabled,
// auto_signout_minutes — added directly in Supabase and never written down. The repo
// therefore could not answer what the table holds, and an absent column was
// indistinguishable from an unrecorded one without querying production. That is not a
// cosmetic gap: it blocked a Settings toggle, because "add a column" and "the column is
// already there" needed a database round trip to tell apart.
//
// This gate closes the loop the only way a repo can: the API's own ALLOWED set is the
// list of things it will write, and every one of them must appear in schema/.
//
// Part P plants the drift back and asserts this suite goes red.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = ""): void => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const ROUTE = readFileSync(join(ROOT, "src", "app", "api", "preferences", "route.ts"), "utf8");

/** Every .sql file, concatenated — a column may be declared in any of them. */
function allSql(): string {
  const dir = join(ROOT, "schema");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
}

/** What the PATCH handler will accept and write. */
function allowedColumns(src: string): string[] {
  const m = src.match(/const ALLOWED = new Set\(\[([\s\S]*?)\]\)/);
  return m ? [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]) : [];
}

/** Columns user_preferences declares anywhere in schema/, CREATE or ALTER. */
function declaredColumns(sql: string): Set<string> {
  const out = new Set<string>();
  const create = sql.match(/CREATE TABLE IF NOT EXISTS user_preferences\s*\(([\s\S]*?)\n\);/);
  if (create) for (const m of create[1].matchAll(/^\s{2}([a-z_]+)\s/gm)) out.add(m[1]);
  for (const m of sql.matchAll(/ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS\s+([a-z_]+)/g)) out.add(m[1]);
  return out;
}

const SQL = allSql();
const allowed = allowedColumns(ROUTE);
const declared = declaredColumns(SQL);

console.log("── the API's writable set was read ──");
check("ALLOWED was located and is non-trivial", allowed.length >= 5, `${allowed.length} columns`);
check("schema/ declares user_preferences at all", declared.size >= 5, `${declared.size} columns`);

console.log("── every writable preference is written down ──");
const missing = allowed.filter((c) => !declared.has(c));
check("no column the API writes is missing from schema/",
  missing.length === 0, `missing: ${missing.join(", ")}`);

// Named individually so a bulk revert shows which one went, not just a count.
for (const c of ["theme", "alerts_email_enabled", "alerts_in_app_enabled", "weekly_digest_watched", "auto_signout_minutes"]) {
  check(`  ${c} is declared`, declared.has(c), "added in Supabase and never recorded");
}

console.log("── Part P · positive controls ──");
const controls: Array<[string, string]> = [
  ["a column is dropped from schema/",
    SQL.replace(/ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS theme TEXT;/, "")],
  ["the whole drift file is deleted",
    SQL.replace(/ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS[\s\S]*?;/g, "")],
];
for (const [name, planted] of controls) {
  const changed = planted !== SQL;
  const d = declaredColumns(planted);
  const red = allowed.some((c) => !d.has(c));
  check(`positive control · ${name}`, changed && red,
    !changed ? "the replacement matched nothing — control is inert" : "the defect tripped nothing above");
}

console.log(`\n${fail === 0 ? "✅" : "❌"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
