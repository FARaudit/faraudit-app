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
import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Files that put SAM_API_KEY into a request URL. */
const KEY_BEARING = ["src/lib/sam.ts", "src/lib/sam-history.ts", "src/lib/sam-attachments.ts"];

/** A console call that would carry a URL or a caught error into the log. */
export function leakyLogCalls(src: string): string[] {
  const out: string[] = [];
  for (const m of code(src).matchAll(/console\.(?:log|warn|error|info|debug)\(([\s\S]*?)\);/g)) {
    const arg = m[1];
    // interpolating a url-ish identifier, or logging a caught error object directly
    if (/\$\{[^}]*\burl\b[^}]*\}/i.test(arg)) { out.push(m[0].slice(0, 90)); continue; }
    if (/\$\{\s*(?:e|err|error|ex)\s*\}/.test(arg)) { out.push(m[0].slice(0, 90)); continue; }
    if (/(^|[(,\s])(?:e|err|error|ex)\s*(?:,|\)|$)/.test(arg)) { out.push(m[0].slice(0, 90)); continue; }
    if (/api_key/i.test(arg)) { out.push(m[0].slice(0, 90)); continue; }
  }
  return out;
}

console.log("S1 · the key-bearing files are the ones we think they are");
for (const f of KEY_BEARING) {
  ok(/api_key=\$\{|api_key:\s/.test(code(read(f))), `${f} builds a key-bearing request`,
    "if this goes false the file no longer needs the rule — remove it from the list deliberately");
}

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

console.log(`\n${fail === 0 ? "✅ ALL PASS" : `❌ ${fail} RED`} — ${pass} check(s) green`);
process.exit(fail === 0 ? 0 : 1);
