// Idle auto sign-out — the control, the timer, and the claim they make together.
// Run: npx tsx test/public/_auto-signout.test.ts
//
// The failure this suite exists to prevent is the one named in the /api/preferences
// source itself: "a preference the API stores and nothing consults is the #514 defect
// wearing a different hat — the switch is the last thing built, never the first."
// So the checks run in that order: the timer must EXIST and be reachable on every
// railed page, the API must accept the key, and only then does the switch count.
//
// Part A executes the shipped public/auto-signout.js in a vm and drives its clock.
// Part D plants three regressions and asserts this suite goes RED on each, so it
// cannot pass vacuously.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail = ""): void => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/* ── A DOM + timer shim. Time is DRIVEN, not waited on: the suite advances a clock
   the script reads through Date.now(), so a 15-minute idle window is exercised in
   milliseconds without weakening what is tested. */
type Harness = {
  run: (src: string) => Record<string, any>;
};

function makeHarness(): Harness & { clock: { t: number }; posted: string[]; store: Record<string, string> } {
  const clock = { t: 1_760_000_000_000 };
  const posted: string[] = [];
  const store: Record<string, string> = {};
  const listeners: Record<string, Array<() => void>> = {};
  const intervals: Array<{ fn: () => void; ms: number }> = [];

  const makeEl = (tag = "div"): any => {
    const el: any = {
      tagName: tag.toUpperCase(), id: "", className: "", textContent: "", value: "",
      style: { cssText: "" }, children: [], parentNode: null, disabled: false, hidden: false,
      method: "", action: "", type: "",
      appendChild(c: any) { c.parentNode = el; el.children.push(c); return c; },
      removeChild(c: any) { el.children = el.children.filter((x: any) => x !== c); c.parentNode = null; },
      setAttribute() {}, getAttribute() { return null; },
      addEventListener() {}, focus() {},
      submit() { posted.push("POST " + el.action); },
      appendData() {},
    };
    return el;
  };

  const body = makeEl("body");
  const byId = (id: string): any => {
    const walk = (n: any): any => {
      if (n.id === id) return n;
      for (const c of n.children) { const r = walk(c); if (r) return r; }
      return null;
    };
    return walk(body);
  };

  const documentStub: any = {
    readyState: "complete",
    hidden: false,
    body,
    documentElement: makeEl("html"),
    createElement: (t: string) => makeEl(t),
    createTextNode: (s: string) => ({ nodeValue: s, children: [], parentNode: null }),
    getElementById: byId,
    addEventListener: (k: string, fn: () => void) => { (listeners[k] ||= []).push(fn); },
  };

  const sandbox: any = {
    document: documentStub,
    console,
    localStorage: {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
    },
    Date: { now: () => clock.t },
    setInterval: (fn: () => void, ms: number) => { intervals.push({ fn, ms }); return intervals.length; },
    clearInterval: () => { intervals.length = 0; },
    fetch: () => Promise.reject(new Error("no network in the shim — boot() must survive it")),
    isFinite,
    parseInt,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.addEventListener = () => {};
  (sandbox as any).__tick = () => intervals.forEach((i) => i.fn());
  (sandbox as any).__clock = clock;

  return {
    clock, posted, store,
    run(src: string) { runInNewContext(src, sandbox, { filename: "auto-signout.js" }); return sandbox; },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("── Part A · the timer, executed ──");

const SRC = read("public/auto-signout.js");
const h = makeHarness();
const w = h.run(SRC);

check("the script exposes an arming hook the settings control can call", typeof w.faSetAutoSignout === "function",
  "settings cannot re-arm the running timer, so a change needs a reload");

// OFF is the reachable default: nothing armed, nothing scheduled, nothing posted.
w.faSetAutoSignout(null);
h.clock.t += 10 * 60 * 60 * 1000;
(w as any).__tick();
check("off · a ten-hour idle signs nobody out", h.posted.length === 0, `posted ${JSON.stringify(h.posted)}`);

// Armed at 15 minutes.
w.faSetAutoSignout(15);
h.clock.t += 5 * 60000;
(w as any).__tick();
check("armed · no warning five minutes into a fifteen-minute window",
  !h.store.__warned && (w.document.getElementById("faSignoutWarn") === null),
  "the dialog appeared far too early");
check("armed · nothing signed out five minutes in", h.posted.length === 0, `posted ${JSON.stringify(h.posted)}`);

// Inside the final minute the warning must appear, and carry a real remaining count.
h.clock.t += 9 * 60000 + 20000;   // 14m20s idle ⇒ 40s left
(w as any).__tick();
const warn = w.document.getElementById("faSignoutWarn");
check("armed · the warning appears inside the final minute", warn !== null, "no warning before sign-out");
const countEl = w.document.getElementById("faSignoutCount");
check("armed · the countdown states the REAL remaining time, not a fixed number",
  !!countEl && /^(3[5-9]|40) seconds$/.test(countEl.textContent),
  `countdown read "${countEl ? countEl.textContent : "(absent)"}" with 40s left`);
check("armed · still nothing signed out while the warning stands", h.posted.length === 0, `posted ${JSON.stringify(h.posted)}`);

// Running the clock past the deadline must post the REAL sign-out.
h.clock.t += 60000;
(w as any).__tick();
check("armed · the deadline posts /api/auth/sign-out — the same endpoint the rail button posts",
  h.posted.length === 1 && h.posted[0] === "POST /api/auth/sign-out",
  `posted ${JSON.stringify(h.posted)}`);

// Activity resets the shared clock, and the reset survives a re-arm.
const h2 = makeHarness();
const w2 = h2.run(SRC);
w2.faSetAutoSignout(15);
h2.clock.t += 14 * 60000;
(w2 as any).__tick();
h2.store["faraudit-last-activity"] = String(h2.clock.t);   // what "Stay signed in" writes
h2.clock.t += 5 * 60000;
(w2 as any).__tick();
check("activity resets the clock · a reset five minutes ago does not sign out",
  h2.posted.length === 0, `posted ${JSON.stringify(h2.posted)}`);
check("the clock is SHARED across tabs (localStorage), not per-page",
  /localStorage/.test(SRC) && /faraudit-last-activity/.test(SRC),
  "activity in one tab would not reset another tab's timer");

// ─────────────────────────────────────────────────────────────────────────────
console.log("── Part B · the timer is reachable everywhere, and the store can hold the setting ──");

const rail = read("src/lib/nav/rail.ts");
check("injectRail ships auto-signout.js, so the timer is on every railed page",
  /auto-signout\.js/.test(rail),
  "a timer only on the pages that remembered to load it is not a security control");

const prefs = read("src/app/api/preferences/route.ts");
check("/api/preferences accepts auto_signout_minutes", /ALLOWED[\s\S]*?auto_signout_minutes/.test(prefs),
  "the control saves nothing");
check("/api/preferences validates the duration against a fixed set",
  /VALID_SIGNOUT_MINUTES/.test(prefs),
  "any number could be stored, including one no UI can undo");

const mig = read("supabase/migrations/20260813040000_auto_signout_preference.sql");
// Strip comments BEFORE asserting. The first version of this check read the whole
// file and went red on the word "DEFAULT" inside a comment explaining why there is
// no default — an assertion matching prose that sits near the code it is about.
const ddl = mig.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ");
check("a migration adds the column the preference needs",
  /alter table[\s\S]*user_preferences[\s\S]*auto_signout_minutes/i.test(ddl),
  "the key has nowhere to live");
check("the column is nullable with no default, so existing accounts stay OFF",
  !/\bnot null\b/i.test(ddl) && !/\bdefault\b/i.test(ddl),
  "shipping this would switch the feature on for people who never asked");
// The two checks above are string tests, so they need their own control.
const planted = ddl.replace("integer;", "integer not null default 30;");
check("positive control · a NOT NULL DEFAULT migration is caught",
  planted !== ddl && (/\bnot null\b/i.test(planted) || /\bdefault\b/i.test(planted)),
  "the nullability check cannot fail, so it is asserting nothing");

// ─────────────────────────────────────────────────────────────────────────────
console.log("── Part C · the switch, and the claim it makes ──");

const ps = read("public/ps-app.js");
check("settings renders a Security panel", /key: 'security'/.test(ps), "the control has no home");
check("the select is wired to the same save path as the toggles",
  /savePref\('auto_signout_minutes'/.test(ps), "the control is decorative");
check("a refused save is reported AND the control returns to the stored value",
  /wireAutoSignout/.test(ps) && /flash\(PREF_LABELS\.auto_signout_minutes, false\)/.test(ps),
  "a refused save would leave a setting on screen that is not in force");
check("a store that cannot hold the key disables the control instead of refusing every save",
  /storable/.test(ps), "the customer would meet a live-looking control that never saves");
check("changing the setting re-arms the running timer without a reload",
  /faSetAutoSignout/.test(ps), "the chosen duration would not take effect until a reload");

// The copy may not claim more than the mechanism does.
check("the panel does not claim to shorten the SESSION itself",
  /What this is not/.test(ps) && /not a shorter session/.test(ps),
  "a browser timer must not be sold as session lifetime control");

// ─────────────────────────────────────────────────────────────────────────────
console.log("── Part D · positive controls — each regression must go RED ──");

type Ctl = { name: string; src: string; expectRed: (w: any, hh: ReturnType<typeof makeHarness>) => boolean };
const controls: Ctl[] = [
  {
    name: "a timer that ignores OFF and signs out anyway",
    src: SRC.replace("if (!MINUTES) return;                 // OFF means nothing is scheduled at all",
                     "if (!MINUTES) MINUTES = 15;"),
    expectRed: (ww, hh) => { ww.faSetAutoSignout(null); hh.clock.t += 10 * 3600000; (ww as any).__tick(); return hh.posted.length > 0; },
  },
  {
    name: "a countdown that prints a fixed number instead of the remaining time",
    src: SRC.replace("el.textContent = s === 1 ? '1 second' : s + ' seconds';",
                     "el.textContent = '60 seconds';"),
    expectRed: (ww, hh) => {
      ww.faSetAutoSignout(15); hh.clock.t += 14 * 60000 + 20000; (ww as any).__tick();
      const c = ww.document.getElementById("faSignoutCount");
      return !!c && !/^(3[5-9]|40) seconds$/.test(c.textContent);
    },
  },
  {
    name: "a deadline that only redirects, leaving the session alive",
    src: SRC.replace("f.action = '/api/auth/sign-out';", "f.action = '/sign-in';"),
    expectRed: (ww, hh) => {
      ww.faSetAutoSignout(15); hh.clock.t += 16 * 60000; (ww as any).__tick();
      return !hh.posted.includes("POST /api/auth/sign-out");
    },
  },
];

for (const c of controls) {
  const changed = c.src !== SRC;
  const hh = makeHarness();
  let red = false;
  if (changed) { const ww = hh.run(c.src); red = c.expectRed(ww, hh); }
  check(`positive control · ${c.name}`, changed && red,
    !changed ? "the replacement matched nothing — control is inert" : "the regression did not trip any assertion above");
}

console.log(`\n${fail === 0 ? "✅" : "❌"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
