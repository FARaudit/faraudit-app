// Gate — the news warm is scheduled, bounded, and cannot be triggered by a stranger.
//
// WHY THIS EXISTS. /api/defense-news is the ONLY endpoint that spends on page load. Its judged
// insights are cached per article per desk, so repeat reads are free — but nothing paid for the
// FIRST read of the day, so whoever signed in first waited out 11 RSS feeds, the image fetches
// and the model chunks. Minutes of latency reads as stale news, which is the opposite of what
// it is.
//
// ⛔ AND IT MUST NOT HANG OFF SIGN-IN. `auto_signout_minutes` is a live preference, so one
// working day holds many sign-ins. Tying the only spending endpoint to that trigger makes the
// bill a function of how often someone steps away from their desk.
//
// W1 the warm is secret-gated · W2 it fails closed · W3 the desk list is READ, not typed ·
// W4 it is sequential · W5 it is actually scheduled · W6 planted positives.
//
// Run: npx tsx test/public/_warm-news-cron.test.ts
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

const CRON = code("src/app/api/cron/warm-news/route.ts");
const NEWS = code("src/app/api/defense-news/route.ts");
const VERCEL = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as
  { crons?: Array<{ path: string; schedule: string }>; functions?: Record<string, { maxDuration?: number }> };

console.log("W1 · the warm is secret-gated on BOTH doors");
ok(/CRON_SECRET/.test(CRON) && /status:\s*401/.test(CRON),
  "the cron route refuses without the shared secret");
ok(/CRON_SECRET/.test(NEWS),
  "and the news route only accepts explicit codes behind that same secret",
  "otherwise anyone could name a desk and make us judge stories for it");
ok(/\/\^\\d\{6\}\$\//.test(NEWS) || /\\d\{6\}/.test(NEWS),
  "warm codes are validated as 6-digit NAICS, not passed through");

console.log("\nW2 · it fails closed");
ok(/getAdminClient\(\)/.test(NEWS) && /503/.test(NEWS),
  "no service-role key ⇒ 503, rather than spending and caching nothing",
  "a warm that cannot write the cache is worse than no warm");
ok(/could not read desks|502/.test(CRON),
  "a failed desk read is an error, not a clean zero-warm run",
  "an empty enforcement loop prints all-clear");

console.log("\nW3 · the desk list is READ, not typed");
ok(/from\("capability_statements"\)/.test(CRON),
  "desks come from the capability statements on file");
ok(!/\b3\d{5}\s*[,"']/.test(CRON),
  "no NAICS code is hardcoded in the cron",
  "a typed list stops covering a customer the day they edit their profile");
ok(/new Map|seen\.set/.test(CRON),
  "and it warms one desk per DISTINCT code set",
  "the cache is keyed by the code set, so per-customer warming pays twice for one judgement");

console.log("\nW4 · it is sequential, not a fan-out");
ok(!/Promise\.all\s*\(\s*\[?\s*\.\.\.|await Promise\.all/.test(CRON),
  "desks are warmed one at a time",
  "parallel warms would hit the same RSS upstreams at once, unwatched");
ok(/for\s*\(const\s*\[/.test(CRON), "the loop is an ordinary sequential for-of");

console.log("\nW5 · it is actually scheduled");
const cron = (VERCEL.crons || []).find((c) => c.path === "/api/cron/warm-news");
ok(Boolean(cron), "the cron is registered in vercel.json",
  "a warm route nothing calls is not a warm");
ok(Boolean(cron) && /^\d+ \d+ \* \* \*$/.test(cron!.schedule),
  `it runs daily — ${cron?.schedule ?? "unscheduled"}`);
ok(Boolean(VERCEL.functions?.["src/app/api/cron/warm-news/route.ts"]?.maxDuration),
  "and it is given a duration budget, since a cold warm is slow by definition");

console.log("\nW6 · planted positives");
ok(!/CRON_SECRET/.test("export async function GET(req){ return ok() }"),
  "the W1 detector would catch an ungated route");
ok(/\b3\d{5}\s*[,"']/.test('const CODES = ["336413", "332710"]'),
  "the W3 detector would catch a hardcoded desk list");
ok(!/\b3\d{5}\s*[,"']/.test(CRON), "and it does not fire on the live cron");

console.log(`\n${fail === 0 ? "✅ ALL PASS" : `❌ ${fail} RED`} — ${pass} check(s) green`);
process.exit(fail === 0 ? 0 : 1);
