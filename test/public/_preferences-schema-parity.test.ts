// Every preference the API can WRITE must be declared in schema/.
// Run: npx tsx test/public/_preferences-schema-parity.test.ts
//
// THIS REPO HAS TWO MIGRATION DIRECTORIES ON PURPOSE, and supabase/migrations/README.md
// says so: `supabase/migrations/` is the CLI-tracked source of truth for app-wide schema
// work, and `schema/` holds email-AI-era migrations applied directly through the SQL
// editor. A column recorded in either one IS recorded.
//
// The first version of this gate read only `schema/` and reported five columns as
// undocumented. All five had migrations — theme, weekly_digest_watched, both alert
// toggles and auto_signout_minutes — in the directory it was not reading. Treating one
// file's silence as evidence, without checking whether it was the file that would have
// spoken, is exactly the failure this suite exists to catch in the app.
//
// So the check stands, and its scope is now both directories: the API's ALLOWED set is
// the definitive list of what PATCH will write, and every member must be declared
// somewhere a reader can find it.
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

/** Every .sql file in BOTH migration directories, concatenated. */
function allSql(): string {
  const dirs = ["supabase/migrations", "schema"];
  const parts: string[] = [];
  for (const d of dirs) {
    const dir = join(ROOT, d);
    let files: string[] = [];
    try { files = readdirSync(dir); } catch { continue; }
    for (const f of files.filter((x) => x.endsWith(".sql"))) {
      parts.push(readFileSync(join(dir, f), "utf8"));
    }
  }
  return parts.join("\n");
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
  // Both directories are matched, and case-insensitively: the CLI migrations are
  // written in lower case and the schema/ ones in upper.
  for (const m of sql.matchAll(/alter\s+table\s+(?:public\.)?user_preferences\s+add\s+column\s+if\s+not\s+exists\s+([a-z_]+)/gi)) out.add(m[1]);
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
  check(`  ${c} is declared`, declared.has(c), "no migration in either directory");
}

console.log("── Part P · positive controls ──");
const controls: Array<[string, string]> = [
  ["the new column loses its migration",
    SQL.replace(/alter\s+table\s+public\.user_preferences\s+add\s+column\s+if\s+not\s+exists\s+rail_sections_open[\s\S]*?;/i, "")],
  ["every declaration disappears",
    SQL.replace(/alter\s+table\s+(?:public\.)?user_preferences\s+add\s+column[\s\S]*?;/gi, "")],
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
