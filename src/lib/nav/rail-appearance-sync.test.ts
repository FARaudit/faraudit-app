// $0 behavioural lock for APPEARANCE TWO-WAY SYNC (src/lib/nav/rail.ts).
// Run: npx tsx src/lib/nav/rail-appearance-sync.test.ts
//
// THE BUG THIS LOCKS. Appearance has two stores — `preferences.theme` on the account and a
// `faraudit-theme` localStorage mirror on the device. Settings > Appearance (public/ps-app.js) wrote
// BOTH. The rail's own appearance control wrote the MIRROR ALONE. So the two disagreed in exactly one
// direction: change the theme from the rail, open Settings, and the select still showed the old value,
// because it renders from the account. The control looked broken, and on a new browser the account
// silently reverted the choice.
//
// WHY THIS EXECUTES THE SCRIPT INSTEAD OF GREPPING IT. The rail ships as a STRING of JavaScript
// assembled in a .ts file. A source-grep gate over that string passes on a script that never runs and
// breaks on any refactor that moves a line. This builds a minimal DOM, EVALUATES the real emitted
// script, clicks a real appearance button and reads what was actually sent — so it fails when the
// BEHAVIOUR regresses, not when the text moves.
export {};

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } };

type Btn = { choice: string; attrs: Record<string, string>; handlers: Array<(e: any) => void> };

/** The smallest DOM the rail script needs. Anything it touches that is not modelled resolves to an
 *  empty NodeList, which is what a page missing that element would give it. */
function harness(opts: { stored?: string | null; accountTheme?: unknown }) {
  const store = new Map<string, string>();
  if (typeof opts.stored === "string") store.set("faraudit-theme", opts.stored);
  const sent: Array<{ url: string; method?: string; body?: any }> = [];
  const rootAttrs: Record<string, string> = { "data-theme": "light", "data-sb": "open" };

  const buttons: Btn[] = ["light", "dark", "auto"].map((c) => ({
    choice: c, attrs: { "data-theme-choice": c }, handlers: [],
  }));
  const mkEl = (b: Btn) => ({
    getAttribute: (k: string) => (k === "data-theme-choice" ? b.choice : b.attrs[k] ?? null),
    setAttribute: (k: string, v: string) => { b.attrs[k] = v; },
    addEventListener: (_t: string, fn: any) => { b.handlers.push(fn); },
    querySelector: () => null, getBoundingClientRect: () => ({ right: 0, top: 0, height: 0 }),
    classList: { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false },
    style: {}, removeAttribute: () => {}, closest: () => null,
  });
  const themeEls = buttons.map(mkEl);

  const documentElement = {
    getAttribute: (k: string) => rootAttrs[k] ?? null,
    setAttribute: (k: string, v: string) => { rootAttrs[k] = v; },
    removeAttribute: (k: string) => { delete rootAttrs[k]; },
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    style: {},
  };
  const document: any = {
    documentElement,
    querySelectorAll: (sel: string) => (sel.includes("sb-am-theme") ? themeEls : []),
    querySelector: () => null,
    getElementById: () => null,
    addEventListener: () => {},
    body: { addEventListener: () => {}, appendChild: () => {}, classList: { add: () => {} }, style: {} },
    createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {}, classList: { add: () => {} } }),
  };
  const win: any = {
    document,
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
    },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    addEventListener: () => {}, setTimeout: (f: any) => { f(); return 0; }, clearTimeout: () => {},
    location: { pathname: "/notices.html", href: "https://faraudit.com/notices.html" },
    MutationObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (f: any) => { f(); return 0; },
  };
  win.fetch = (url: string, init?: any) => {
    sent.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined });
    const payload = url.includes("/api/preferences")
      ? { preferences: { ...(("accountTheme" in opts) ? { theme: opts.accountTheme } : {}) } }
      : null;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
  };
  return { win, document, store, sent, buttons, rootAttrs, themeEls };
}

async function run(script: string, h: ReturnType<typeof harness>) {
  const fn = new Function(
    "window", "document", "localStorage", "fetch", "matchMedia", "MutationObserver",
    "setTimeout", "clearTimeout", "requestAnimationFrame", "location",
    `try{${script}}catch(e){window.__err=e;}`,
  );
  fn(h.win, h.document, h.win.localStorage, h.win.fetch, h.win.matchMedia, h.win.MutationObserver,
     h.win.setTimeout, h.win.clearTimeout, h.win.requestAnimationFrame, h.win.location);
  await new Promise((r) => setTimeout(r, 0));
  return h.win.__err;
}

(async () => {
  // The PRODUCTION emitter, called the way a page calls it — then unwrapped from its <script> tags.
  // Taking the string from the real function is what makes this a behavioural test rather than a
  // fixture: any change to what railScript() emits is a change to what this executes.
  const { railScript } = await import("./rail");
  const html = railScript();
  const script: string | undefined = (html.match(/<script>([\s\S]*)<\/script>/) || [])[1];
  ok("railScript() emits a single <script> block carrying the appearance control",
     typeof script === "string" && script.includes("sb-am-theme") && script.includes("faraudit-theme"));
  if (!script) { console.log(`\nFAIL — ${pass} passed, ${fail + 1} failed`); process.exit(1); }

  console.log("── clicking an appearance choice writes the ACCOUNT, not only the device");
  for (const [choice, expected] of [["dark", "dark"], ["auto", "auto"], ["light", null]] as const) {
    const h = harness({ stored: null });
    const err = await run(script, h);
    ok(`${choice}: script ran without throwing${err ? ` (${err})` : ""}`, !err);
    const btn = h.buttons.find((b) => b.choice === choice)!;
    ok(`${choice}: the control is wired to a click handler`, btn.handlers.length > 0);
    btn.handlers.forEach((fn) => fn({ stopPropagation() {}, preventDefault() {} }));
    await new Promise((r) => setTimeout(r, 0));
    const patch = h.sent.find((s) => s.url.includes("/api/preferences") && s.method === "PATCH");
    ok(`${choice}: a PATCH reached /api/preferences`, !!patch);
    ok(`${choice}: it sent theme=${JSON.stringify(expected)} (Settings' own value contract)`,
       !!patch && "theme" in (patch.body ?? {}) && patch!.body.theme === expected);
    ok(`${choice}: the device mirror was written too`, h.store.get("faraudit-theme") === choice);
  }

  console.log("── the account's theme refreshes the device mirror (the other direction)");
  {
    const h = harness({ stored: null, accountTheme: "dark" });
    await run(script, h);
    ok("account dark ⇒ mirror becomes dark", h.store.get("faraudit-theme") === "dark");
    ok("but THIS paint is not flipped — the mirror converges on the next navigation",
       h.rootAttrs["data-theme"] === "light");
  }
  {
    const h = harness({ stored: "dark", accountTheme: null });
    await run(script, h);
    ok("account null ⇒ mirror becomes light (null is the DEFAULT, not 'unset')",
       h.store.get("faraudit-theme") === "light");
  }
  {
    const h = harness({ stored: "dark", accountTheme: "nonsense" });
    await run(script, h);
    ok("an unrecognised account value is IGNORED, never written through",
       h.store.get("faraudit-theme") === "dark");
  }

  console.log("── a stored preference still paints before any network answer");
  {
    const h = harness({ stored: "dark" });
    await run(script, h);
    ok("stored dark is applied to the document", h.rootAttrs["data-theme"] === "dark");
    ok("and the matching control reads checked",
       h.buttons.find((b) => b.choice === "dark")!.attrs["aria-checked"] === "true");
  }

  console.log("── the theme block must not starve the rail-sections mirror below it");
  {
    // An early `return` in the theme branch would silently disable a DIFFERENT feature that shares
    // this one request. Both are asserted from the same response.
    const h = harness({ stored: null });
    h.win.fetch = (url: string, init?: any) => {
      if (init?.method) return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({
        preferences: { theme: "dark", rail_sections_open: { intel: true } } }) });
    };
    await run(script, h);
    ok("theme mirrored", h.store.get("faraudit-theme") === "dark");
    ok("AND the rail-sections mirror still written", !!h.store.get("faraudit-rail-sections"));
  }
  {
    const h = harness({ stored: null });
    h.win.fetch = (url: string, init?: any) => {
      if (init?.method) return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({
        preferences: { rail_sections_open: { intel: true } } }) });     // no theme key at all
    };
    await run(script, h);
    ok("no theme key ⇒ mirror untouched", h.store.get("faraudit-theme") === undefined);
    ok("AND the rail-sections mirror still written", !!h.store.get("faraudit-rail-sections"));
  }

  console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
