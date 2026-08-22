// Gate — the SAM API key is in the request line, so nothing may log the request.
//
// STATE OF THE ITEM WHEN THIS WAS WRITTEN (P0 #BUNDLE-SAM-HARDENING). Two of its four parts
// were already shipped and are re-proved by src/app/api/sam/route.failclosed.test.ts (18/18):
// /api/sam is fail-closed — 200 live, 503 unconfigured, 502 upstream-failed, never sample rows —
// and the key is never echoed into a response body.
//
// WHAT REMAINED. Four call sites build the upstream URL with the key interpolated into the query
// string, because that is how SAM accepts it:
//
//   src/lib/sam.ts:266 · src/lib/sam-history.ts:113,137,147 · src/lib/sam-attachments.ts:437
//
// There is NO live leak today: sam.ts and sam-history.ts swallow the error entirely, and
// sam-attachments logs `http_<status>` and the notice id, never the URL and never the caught
// error. That is the whole safety margin — and it is one `console.error(e)` wide. A caught fetch
// error can carry the full request URL, and the key with it, straight into a production log.
//
// So the invariant is not "never put the key in a URL" — that is the wire protocol and changing
// it would mean refactoring engine-critical paths against a quota-limited API. It is: THE FILES
// THAT BUILD A KEY-BEARING URL MUST NEVER LOG A URL OR A RAW ERROR. That is mechanically
// checkable, it is the property that keeps the key out of logs, and it fails the moment someone
// adds the debug line that would leak it.
//
// S1 the key-bearing files are known · S2 none of them logs a URL or raw error ·
// S3 the key never reaches a log line · S4 planted positives.
//
// Run: npx tsx test/public/_sam-key-never-logged.test.ts
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** ⛔ DERIVED, NEVER TYPED. The first version of this gate carried a hand-written list of three
 *  files — and missed src/lib/sam-entity.ts, which builds a key-bearing URL and had FOUR
 *  console.error(..., err) calls logging caught errors. That is the exact leak this gate exists to
 *  prevent, sitting in a file the gate could not see, for the same reason a hardcoded desk list
 *  stops covering a customer: a typed list is a snapshot of what someone remembered. */
function keyBearingFiles(): string[] {
  const dir = join(ROOT, "src/lib");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
    .filter((f) => /api_key/.test(code(readFileSync(join(dir, f), "utf8"))))
    .map((f) => "src/lib/" + f)
    .sort();
}
const KEY_BEARING = keyBearingFiles();

/** A console call that would carry a URL or a caught error into the log. */
export function leakyLogCalls(src: string): string[] {
  const out: string[] = [];
  for (const m of code(src).matchAll(/console\.(?:log|warn|error|info|debug)\(([\s\S]*?)\);/g)) {
    /* An error passed THROUGH a sanitiser is not a leak — safeErr(err) redacts the key before it
       can be printed. Only a RAW error object carries the request URL. Blank the wrapped form
       first, or the gate convicts its own fix and the only way to go green is to stop logging. */
    const arg = m[1].replace(/\b\w+\(\s*(?:e|err|error|ex)\s*\)/g, "SANITISED");
    // interpolating a url-ish identifier, or logging a caught error object directly
    if (/\$\{[^}]*\burl\b[^}]*\}/i.test(arg)) { out.push(m[0].slice(0, 90)); continue; }
    if (/\$\{\s*(?:e|err|error|ex)\s*\}/.test(arg)) { out.push(m[0].slice(0, 90)); continue; }
    if (/(^|[(,\s])(?:e|err|error|ex)\s*(?:,|\)|$)/.test(arg)) { out.push(m[0].slice(0, 90)); continue; }
    if (/api_key/i.test(arg)) { out.push(m[0].slice(0, 90)); continue; }
  }
  return out;
}

console.log("S1 · the key-bearing files are DISCOVERED, not remembered");
ok(KEY_BEARING.length >= 4, `found ${KEY_BEARING.length} files that put the key in a request`,
  KEY_BEARING.join(", "));
ok(KEY_BEARING.includes("src/lib/sam-entity.ts"),
  "including sam-entity.ts — the one a hand-written list missed",
  "it had four console.error(..., err) calls and was not covered");

console.log("\nS2 · none of them logs a URL or a raw caught error");
for (const f of KEY_BEARING) {
  const leaks = leakyLogCalls(read(f));
  ok(leaks.length === 0, `${f} has no leaky log call`, leaks.join(" | "));
}

console.log("\nS3 · and the key never appears beside a log call anywhere in src/lib");
{
  const bad: string[] = [];
  for (const f of KEY_BEARING) {
    for (const line of code(read(f)).split("\n")) {
      if (/console\./.test(line) && /SAM_API_KEY|apiKey/.test(line)) bad.push(`${f}: ${line.trim().slice(0, 70)}`);
    }
  }
  ok(bad.length === 0, "no log line references the key at all", bad.join(" | "));
}

console.log("\nS4 · planted positives");
ok(leakyLogCalls("console.error(`fetch failed ${url}`);").length === 1,
  "logging the URL IS caught");
ok(leakyLogCalls("console.warn('sam failed', e);").length === 1,
  "logging a caught error object IS caught",
  "a fetch error can carry the full request URL");
ok(leakyLogCalls("console.error(`boom ${err}`);").length === 1,
  "and so is interpolating one");
ok(leakyLogCalls("console.warn(`[manifest-blip] notice=${noticeId} failure=http_${res.status}`);").length === 0,
  "while the real, safe log line passes",
  "status and notice id only — this is the line that ships today");
ok(leakyLogCalls("// console.error(`${url}`)\n").length === 0,
  "a commented-out leak is not a leak");
ok(leakyLogCalls("console.error('sam failed:', safeErr(err));").length === 0,
  "an error passed through a sanitiser is NOT flagged",
  "otherwise the only way to pass is to stop logging, which trades one defect for another");
ok(leakyLogCalls("console.error('sam failed:', err);").length === 1,
  "but the raw error still is");

console.log(`\n${fail === 0 ? "✅ ALL PASS" : `❌ ${fail} RED`} — ${pass} check(s) green`);
process.exit(fail === 0 ? 0 : 1);
