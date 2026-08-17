// The rail's collapsible sections must REMEMBER — and must still open the section
// holding the current page.
// Run: npx tsx test/public/_rail-section-persistence.test.ts
//
// Before this, clicking "Market intel" open lasted exactly until the next click:
// injectRail() re-renders the rail server-side from SECTIONS[].defaultOpen on every
// page load, and nothing wrote the toggle anywhere. The control moved, animated, set
// aria-expanded — and had no effect that survived a navigation. Same family as a
// preference the API stores and nothing consults, one layer out: a control the UI
// honours and nothing persists.
//
// Part B EXECUTES the restore script that ships inside the rail markup, against a DOM
// shim, so the assertions run the shipped string rather than match it.
// Part D plants three regressions and asserts each turns this suite red.

import { runInNewContext } from "node:vm";
import { renderRail, injectRail, SECTIONS } from "../../src/lib/nav/rail";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = ""): void => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

// ─────────────────────────────────────────────────────────────────────────────
console.log("── Part A · the markup carries what persistence needs ──");

const onToday = renderRail("today");
const onCmmc = renderRail("cmmc");   // /cmmc lives inside "Readiness"

const slug = (l: string) => l.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
for (const sec of SECTIONS) {
  check(`section "${sec.label}" carries a stable data-sec key`,
    onToday.includes(`data-sec="${slug(sec.label)}"`),
    "no key means no per-section storage");
}
check("exactly one section is marked data-active when the page is inside one",
  (onCmmc.match(/data-active="true"/g) || []).length === 1,
  `found ${(onCmmc.match(/data-active="true"/g) || []).length}`);
check("the ACTIVE section is the one holding the page (Readiness holds /cmmc)",
  /data-sec="readiness"[^>]*data-active="true"/.test(onCmmc),
  "the wrong section was marked active");
check("no section is marked active on a page outside every section",
  !onToday.includes('data-active="true"'),
  "/today is not inside a collapsible section");

// The restore has to run INSIDE the rail markup. Moved to the end-of-body script it
// would apply after first paint and the section would visibly swing shut.
const restore = onToday.slice(onToday.indexOf("</aside>"));
check("the restore script ships immediately after </aside>, not at end of body",
  /<script>/.test(restore) && restore.indexOf("<script>") < 40,
  "restore is not adjacent to the rail");
// ─────────────────────────────────────────────────────────────────────────────
console.log("── Part B · the shipped restore script, executed ──");

const m = restore.match(/<script>([\s\S]*?)<\/script>/);
const restoreSrc = m ? m[1] : "";
check("restore script extracted", restoreSrc.length > 0, "nothing to execute");

type Sec = { sec: string; active: boolean; open: string; aria: string };
function runRestore(src: string, stored: Record<string, boolean>, secs: Sec[]) {
  const nodes = secs.map((s) => {
    const attrs: Record<string, string> = { "data-sec": s.sec, "data-open": s.open };
    if (s.active) attrs["data-active"] = "true";
    const head = { setAttribute: (k: string, v: string) => { s.aria = v; }, getAttribute: () => null };
    return {
      hasAttribute: (k: string) => k in attrs,
      getAttribute: (k: string) => attrs[k] ?? null,
      setAttribute: (k: string, v: string) => { attrs[k] = v; s.open = v; },
      querySelector: () => head,
    };
  });
  const sandbox: any = {
    localStorage: { getItem: () => JSON.stringify(stored), setItem: () => {} },
    document: { querySelectorAll: () => nodes },
    JSON, console,
  };
  sandbox.window = sandbox;
  runInNewContext(src, sandbox, { filename: "rail-restore.js" });
  return secs;
}

const base = (): Sec[] => [
  { sec: "readiness", active: false, open: "true", aria: "true" },
  { sec: "market-intel", active: false, open: "false", aria: "false" },
  { sec: "reference", active: false, open: "false", aria: "false" },
];

const r1 = runRestore(restoreSrc, { readiness: false, "market-intel": true }, base());
check("a section the customer CLOSED comes back closed", r1[0].open === "false", `got ${r1[0].open}`);
check("a section the customer OPENED comes back open", r1[1].open === "true", `got ${r1[1].open}`);
check("a section never touched keeps its shipped default", r1[2].open === "false", `got ${r1[2].open}`);
check("aria-expanded is restored alongside data-open, not left stale",
  r1[0].aria === "false" && r1[1].aria === "true",
  `aria was ${r1[0].aria} / ${r1[1].aria}`);

// The rule that must survive: the section holding the current page always opens.
const withActive = base();
withActive[0].active = true;
const r2 = runRestore(restoreSrc, { readiness: false }, withActive);
check("the ACTIVE section stays open even when stored closed",
  r2[0].open === "true",
  "restoring over the active section hides the highlight for the page you are on");

// No storage at all ⇒ shipped defaults, untouched.
const r3 = runRestore(restoreSrc, {}, base());
check("empty storage leaves every shipped default alone",
  r3[0].open === "true" && r3[1].open === "false" && r3[2].open === "false",
  "a fresh customer would not see the designed rail");

// Corrupt storage must not throw — a rail that fails to render is worse than one that forgets.
let threw = false;
try {
  const sandbox: any = {
    localStorage: { getItem: () => "{not json", setItem: () => {} },
    document: { querySelectorAll: () => [] }, JSON, console,
  };
  sandbox.window = sandbox;
  runInNewContext(restoreSrc, sandbox, { filename: "rail-restore.js" });
} catch { threw = true; }
check("corrupt stored state is swallowed, not thrown", !threw, "a bad localStorage value breaks the rail");

// ─────────────────────────────────────────────────────────────────────────────
console.log("── Part C · the toggle persists ──");
// The handler ships in railScript(), which injectRail() appends — reading renderRail()
// output for it was checking a string that could never contain it.
const injected = injectRail(
  '<html><head></head><body><aside class="sidebar"></aside></body></html>', "today");
const handler = injected.slice(injected.indexOf("</aside>"));
check("the toggle handler writes to faraudit-rail-sections",
  /faraudit-rail-sections/.test(handler) && /localStorage\.setItem/.test(handler),
  "the control would still be cosmetic");
check("the handler keys the write by data-sec, not by index or label",
  (handler.match(/getAttribute\('data-sec'\)/g) || []).length >= 2,
  "reordering SECTIONS would silently swap two sections' stored state");

// ─────────────────────────────────────────────────────────────────────────────
console.log("── Part D · positive controls ──");

const controls: Array<[string, string, (secs: Sec[]) => boolean]> = [
  ["a restore that ignores data-active and hides the active section",
   restoreSrc.replace("if(s.hasAttribute('data-active'))return;", ""),
   (secs) => secs[0].open === "false"],
  ["a restore that forgets aria-expanded",
   restoreSrc.replace(/var h=s\.querySelector\('\.sb-sech'\);if\(h\)h\.setAttribute\('aria-expanded',String\(v\)\);/, ""),
   (secs) => secs[0].aria === "true" && secs[0].open === "false"],
  /* The guard now also carries the ACCOUNT DEFAULT branch, so the planted text had to
     move with it. A control whose replacement no longer matches is INERT — it proves a
     gate that checks nothing — and this suite caught its own control going inert when
     the restore block changed shape, which is the point of asserting `changed`. */
  ["a restore that treats a missing key as closed",
   restoreSrc.replace("if(v!==true&&v!==false){if(D!=='expanded')return;v=true;}", "if(v===undefined)v=false;"),
   (secs) => secs[2].open === "false" && secs[0].open === "false"],
];

for (const [name, src, isRed] of controls) {
  const changed = src !== restoreSrc;
  let red = false;
  if (changed) {
    const secs = name.includes("data-active") ? (() => { const b = base(); b[0].active = true; return b; })() : base();
    const stored: Record<string, boolean> = name.includes("missing key") ? {} : { readiness: false };
    try { red = isRed(runRestore(src, stored, secs)); } catch { red = false; }
  }
  check(`positive control · ${name}`, changed && red,
    !changed ? "the replacement matched nothing — control is inert" : "the regression tripped nothing above");
}

console.log(`\n${fail === 0 ? "✅" : "❌"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
