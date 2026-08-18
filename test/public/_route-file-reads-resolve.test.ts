// EVERY FILE A ROUTE READS AT RUNTIME MUST EXIST ON DISK.
//   npx tsx test/public/_route-file-reads-resolve.test.ts
//
// Found in production 2026-08-09, by the CEO, minutes after I moved /audit to /audits.
// The route directory was renamed with `git mv`, but src/app/audits/[id]/route.ts builds
// its template paths as STRING LITERALS:
//
//   path.join(process.cwd(), "src", "app", "audit", "[id]", "_states-template.html")
//
// so every audit report answered 500 with
// ENOENT: no such file or directory, open '/var/task/src/app/audit/[id]/_states-template.html'.
//
// NOTHING CAUGHT IT, and the reasons are worth writing down:
//   · tsc cannot see a path built from string parts — it is not an import.
//   · `next build` compiles the route; it never RUNS it, so the read never happens.
//   · the whole test/public suite asserts on markup and source text; not one of them
//     asked a route to read its own files.
//   · I even saw the 500 while verifying the move, tested a second audit that rendered
//     fine, and concluded it was that record's data. One passing sample is not a
//     control.
//
// This gate resolves the paths instead of trusting them.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, isAbsolute } from "node:path";

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};
const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");

// Walk src/ for route handlers and library files that read files at runtime.
const files: string[] = [];
const walk = (dir: string) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); }
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(p);
  }
};
walk(join(ROOT, "src"));

console.log("── every path.join(process.cwd(), …) resolves ──");
{
  check("the sweep reached the source tree", files.length > 50, `only ${files.length} files`);

  // path.join(process.cwd(), "a", "b", "c") — all-literal segments only. A path with a
  // variable in it cannot be resolved statically and is skipped rather than guessed at.
  const RE = /path\.join\(\s*process\.cwd\(\)\s*,\s*((?:"[^"]*"\s*,\s*)*"[^"]*")\s*\)/g;
  let found = 0;
  const broken: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(RE)) {
      const segs = [...m[1].matchAll(/"([^"]*)"/g)].map((s) => s[1]);
      if (!segs.length) continue;
      found++;
      const resolved = join(ROOT, ...segs);
      if (!existsSync(resolved)) {
        broken.push(`${f.replace(ROOT + "/", "")} → ${segs.join("/")}`);
      }
    }
  }
  check("literal cwd-relative paths were found to check", found > 0,
    "no path.join(process.cwd(), \"…\") call sites — this gate asserts nothing");
  check("every one of them resolves to a file that exists", broken.length === 0,
    broken.join(" | "));
  console.log(`   (${found} literal path(s) resolved)`);
}

// The same defect one layer over: a readFileSync/readFile on a literal relative path.
console.log("\n── every literal readFile path resolves ──");
{
  const RE = /read(?:File|FileSync)\(\s*(?:join\()?\s*"((?:src|public|scripts)\/[^"]+)"/g;
  let found = 0;
  const broken: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(RE)) {
      found++;
      const p = m[1];
      const resolved = isAbsolute(p) ? p : join(ROOT, p);
      if (!existsSync(resolved)) broken.push(`${f.replace(ROOT + "/", "")} → ${p}`);
    }
  }
  check("every literal readFile path resolves", broken.length === 0, broken.join(" | "));
  console.log(`   (${found} literal read(s) resolved)`);
}

console.log("\n── planted positives ──");
{
  // The exact defect: the pre-fix path, resolved the way the gate resolves it.
  const dead = join(ROOT, "src", "app", "audit", "[id]", "_states-template.html");
  check("P1 · the path that broke production does NOT exist", !existsSync(dead),
    "the old directory is still on disk, so this gate cannot prove the move happened");
  const live = join(ROOT, "src", "app", "audits", "[id]", "_states-template.html");
  check("P2 · the corrected path DOES exist", existsSync(live),
    "the template is missing from the new location — the fix is wrong");
  check("P3 · a real file resolves and a moved one does not",
    existsSync(join(ROOT, "package.json")) && !existsSync(join(ROOT, "src", "app", "audit")),
    "existsSync is not discriminating here — the checks above prove nothing");
  // The segment regex must actually capture multi-part joins.
  const RE = /path\.join\(\s*process\.cwd\(\)\s*,\s*((?:"[^"]*"\s*,\s*)*"[^"]*")\s*\)/g;
  const sample = [...`path.join(process.cwd(), "src", "app", "audit", "[id]", "_t.html")`.matchAll(RE)];
  check("P4 · the parser reads a multi-segment join", sample.length === 1
    && [...sample[0][1].matchAll(/"([^"]*)"/g)].length === 5,
    "the regex misses real call sites, so the sweep would silently cover nothing");
}

console.log(`\n${pass} passed · ${fail} failed`);
if (fail > 0) process.exit(1);
