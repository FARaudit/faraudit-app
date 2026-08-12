// BD-SCOPE GATE — the scope is only infrastructure if it survives leaving the page.
//
// Three panels are moving out of Defense Spending to their own destination. They read `S.fy` and
// `S.code`, a plain object inside dsb-app.js's IIFE — readable by nothing else, expressible nowhere.
// A panel that only works inside one page's filter cannot BE a destination: land on it directly and
// it has no scope, send the link and the recipient sees their own last click.
//
// So the assertions below are about ADDRESSABILITY and HONESTY, not about rendering:
//   · a URL beats stored state, because a link has to mean what it says
//   · the merge is field by field, so a URL naming one field does not wipe the other
//   · a requested year the feed never measured is REPORTED, never silently swapped — that
//     substitution is the exact shape of a page lying about which year it is showing
//   · localStorage throwing (private browsing) degrades, never breaks
//
// Run: npx tsx test/public/_bd-scope.test.ts
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const SRC = readFileSync(join(process.cwd(), "public", "bd-scope.js"), "utf8");

interface Scope { fy: string | null; code: string | null }
interface Reconciled extends Scope { requestedFy: string | null; requestedCode: string | null; ok: boolean; note: string }
interface Api {
  get(): Scope;
  set(p: Partial<Scope>, o?: { url?: boolean }): void;
  subscribe(f: (s: Scope) => void): void;
  reconcile(years: string[], codes: string[]): Reconciled;
}

/** Loads bd-scope.js against a controllable window. `store` throwing models private browsing. */
function load(opts: { search?: string; stored?: string | null; storeThrows?: boolean } = {}) {
  const urls: string[] = [];
  let stored: string | null = opts.stored ?? null;
  const win: Record<string, unknown> = {
    location: { search: opts.search ?? "", pathname: "/who-to-call", hash: "" },
    localStorage: {
      getItem: () => { if (opts.storeThrows) throw new Error("denied"); return stored; },
      setItem: (_k: string, v: string) => { if (opts.storeThrows) throw new Error("denied"); stored = v; }
    },
    history: { replaceState: (_a: unknown, _b: string, url: string) => { urls.push(url); } }
  };
  const sandbox: Record<string, unknown> = {
    window: win, URLSearchParams, JSON, Object, Array, console: { log() {}, warn() {}, error() {} }
  };
  sandbox.globalThis = sandbox;
  vm.runInContext(SRC, vm.createContext(sandbox), { filename: "bd-scope.js" });
  return { api: win.BD_SCOPE as unknown as Api, urls, read: () => stored };
}

// ── R1 · PRECEDENCE ──────────────────────────────────────────────────────────
console.log("\nR1  A URL BEATS STORED STATE");
{
  const { api } = load({ search: "?fy=FY2025&code=336611", stored: JSON.stringify({ fy: "FY2024", code: "332710" }) });
  const s = api.get();
  ok(s.fy === "FY2025" && s.code === "336611", "the URL wins over localStorage", JSON.stringify(s));
}
{
  const { api } = load({ search: "", stored: JSON.stringify({ fy: "FY2024", code: "332710" }) });
  const s = api.get();
  ok(s.fy === "FY2024" && s.code === "332710", "with no URL scope, the stored one carries over");
}
{
  const { api } = load({});
  const s = api.get();
  ok(s.fy === null && s.code === null, "with neither, the scope is null — the page picks its default");
}
{
  // FIELD BY FIELD. A URL naming only the code must not discard the year the reader was on.
  const { api } = load({ search: "?code=336412", stored: JSON.stringify({ fy: "FY2024", code: "332710" }) });
  const s = api.get();
  ok(s.code === "336412" && s.fy === "FY2024",
    "a URL naming ONE field keeps the other", JSON.stringify(s));
}

// ── R2 · WRITES REACH BOTH PLACES ────────────────────────────────────────────
console.log("\nR2  A CHANGE IS WRITTEN WHERE THE NEXT PAGE WILL LOOK");
{
  const { api, urls, read } = load({});
  const seen: Scope[] = [];
  api.subscribe((s) => seen.push(s));
  api.set({ fy: "FY2026" });
  ok(api.get().fy === "FY2026", "set() updates the live scope");
  ok(JSON.parse(read() || "{}").fy === "FY2026", "…and localStorage, so the next page inherits it");
  ok(urls.length === 1 && urls[0].includes("fy=FY2026"),
    "…and the address bar, so the view can be linked", urls[0]);
  ok(seen.length === 1 && seen[0].fy === "FY2026", "subscribers are notified once");

  api.set({ code: "336611" });
  ok(api.get().fy === "FY2026" && api.get().code === "336611",
    "a partial set MERGES — it does not replace the whole scope");
  ok(urls[1].includes("fy=FY2026") && urls[1].includes("code=336611"), "the URL carries both", urls[1]);

  api.set({ code: null });
  ok(api.get().code === null && !urls[2].includes("code="),
    "clearing a field removes it from the URL rather than writing an empty one", urls[2]);
}
{
  // A listener that throws must not stop the others — one bad panel cannot freeze the page.
  const { api } = load({});
  let reached = false;
  api.subscribe(() => { throw new Error("boom"); });
  api.subscribe(() => { reached = true; });
  api.set({ fy: "FY2026" });
  ok(reached, "a throwing subscriber does not block the ones after it");
}

// ── R3 · A SCOPE IS A REQUEST, NOT A FACT ────────────────────────────────────
console.log("\nR3  AN UNMEASURED REQUEST IS REPORTED, NEVER SILENTLY SWAPPED");
const YEARS = ["FY2024", "FY2025", "FY2026"], CODES = ["332710", "336412", "336611"];
{
  const { api } = load({ search: "?fy=FY2019" });
  const r = api.reconcile(YEARS, CODES);
  ok(r.fy === "FY2026", "falls back to the latest measured year");
  ok(r.requestedFy === "FY2019", "…and still reports what was ASKED for");
  ok(r.ok === false, "…and does not claim the request was honoured");
  ok(/FY2019/.test(r.note) && /FY2026/.test(r.note),
    "…and hands the page a sentence naming BOTH years", r.note);
}
{
  const { api } = load({ search: "?code=111111" });
  const r = api.reconcile(YEARS, CODES);
  ok(r.code === null && r.ok === false && /111111/.test(r.note),
    "an untracked code falls back to all codes and says so", r.note);
}
{
  // NEGATIVE CONTROL. A valid request must produce NO note — otherwise the page
  // would print a correction on every normal view and the warning would be noise.
  const { api } = load({ search: "?fy=FY2025&code=336412" });
  const r = api.reconcile(YEARS, CODES);
  ok(r.ok === true && r.note === "" && r.fy === "FY2025" && r.code === "336412",
    "NEGATIVE CONTROL: a measured request is honoured with no note");
}
{
  const { api } = load({});
  const r = api.reconcile([], []);
  ok(r.fy === null && r.ok === true,
    "no measured years at all yields a null year, not a fabricated one");
}

// ── R4 · IT DEGRADES, IT DOES NOT BREAK ──────────────────────────────────────
console.log("\nR4  PRIVATE BROWSING DEGRADES RATHER THAN BREAKING");
{
  const { api, urls } = load({ search: "?fy=FY2026", storeThrows: true });
  ok(api.get().fy === "FY2026", "the URL scope still reads when localStorage throws");
  let threw = false;
  try { api.set({ code: "336611" }); } catch (e) { threw = true; }
  ok(!threw, "set() does not throw when storage is denied");
  ok(api.get().code === "336611" && urls.length === 1,
    "the scope still changes and the URL is still written");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
