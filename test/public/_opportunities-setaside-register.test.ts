// ─────────────────────────────────────────────────────────────────────────────
// OPPORTUNITIES SET-ASIDE REGISTER GATE — a chip that says "you may not compete"
// may never render in the register that means "anyone may".
//
// Why this file exists: `public/dso-app.js` mapped SoleSource, UNKNOWN and Full
// to the SAME class (`sa full`), and SB-Partial to the same class as SB. Three
// opposite eligibility meanings wore one visual register on the live tab, and
// six gates guarding this page all reported green — because none of them looked
// at the chip. The classifier gate proves the raw token → POLE mapping; nothing
// proved the pole → RENDERED REGISTER mapping, which is the half the customer
// actually reads.
//
// It asserts:
//   G1  pole → {class,label} TABLE, hand-written from the source token, not
//       recomputed from the mapper under test.
//   G2  COVERAGE — every pole `normSetaside` in opportunities-live.js can emit
//       has an explicit register. `Full` is the ONLY pole allowed to reach the
//       unrestricted register; a new pole falling through fails here.
//   G3  DISTINCTNESS — barred, unread, open and restricted are four different
//       registers, and partial is separable from restricted.
//   G4  REALISABILITY — every class the mapper emits resolves to a real fill in
//       BOTH themes, the barred fill differs from the open fill in both, and the
//       registers stay separable with HUE REMOVED (mark + border-style), so the
//       encoding survives greyscale and colour-blindness.
//   G5  PLANTED POSITIVES — the pre-fix mapping and two synthetic stylesheets
//       are run through the same assertions and MUST be caught. A gate that
//       cannot fail proves nothing.
//
// Run: npx tsx test/public/_opportunities-setaside-register.test.ts
//
// The register lives in the shipped browser file, so we EXECUTE `saRender` out
// of public/dso-app.js rather than reimplementing it — a reimplementation is
// self-consistent by construction and would re-create the blind spot above.
// ─────────────────────────────────────────────────────────────────────────────
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const P = (f: string) => path.join(process.cwd(), "public", f);
const DSO_JS = readFileSync(P("dso-app.js"), "utf8");
const LIVE_JS = readFileSync(P("opportunities-live.js"), "utf8");
const HTML = readFileSync(P("opportunities.html"), "utf8");

// ── load the SHIPPED register out of the browser file ────────────────────────
function extractFn(src: string, name: string, file: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name}() not found in ${file}`);
  let depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1) + `\n;__out.${name} = ${name};`;
}
function extractArray(src: string, name: string, file: string): string {
  const m = src.match(new RegExp(`(?:var|const|let)\\s+${name}\\s*=\\s*\\[`));
  if (!m) throw new Error(`${name} not found in ${file}`);
  const from = src.indexOf("[", src.indexOf(m[0]));
  let depth = 0, i = from;
  for (; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]") { depth--; if (depth === 0) break; }
  }
  // Bound as a sandbox global too: the extracted function references it by bare
  // identifier, exactly as it does in the browser.
  return `var ${name} = ${src.slice(from, i + 1)}; __out.${name} = ${name};`;
}

type Reg = { cls: string; label: string; reg: string };
let saRender: (s: string) => Reg;
try {
  const sandbox: any = { __out: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(
    extractArray(DSO_JS, "SA_RESTRICTED", "dso-app.js") + "\n" +
    extractFn(DSO_JS, "saRender", "dso-app.js"),
    sandbox
  );
  saRender = sandbox.__out.saRender;
} catch (e: any) {
  console.log(`\n  ✗ FATAL — cannot load the register: ${e.message}`);
  console.log(`    The set-aside register must be a top-level saRender(pole) in public/dso-app.js`);
  console.log(`    so it can be asserted. An expression inlined in a template literal is unreachable`);
  console.log(`    to any gate, which is how the collision shipped.\n`);
  process.exit(1);
}

// ── the poles the live classifier can actually emit (derived, not assumed) ────
const polesFromClassifier: string[] = (() => {
  const out: string[] = [];
  const re = /\{\s*pole:\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(LIVE_JS))) out.push(m[1]);
  const fallthrough = LIVE_JS.match(/return\s+'UNKNOWN'/) ? ["UNKNOWN"] : [];
  return [...out, ...fallthrough];
})();

// ═══ G1 · pole → {class,label} table ═════════════════════════════════════════
// Written from the SOURCE token's meaning. "Full" is SAM stating the buy is
// unrestricted; "SoleSource" is a directed buy the reader cannot bid; "UNKNOWN"
// is a token we could not read and must not assert an eligibility for.
console.log("\nG1 · pole → rendered register");
const TABLE: Record<string, { cls: string; label: string }> = {
  "SoleSource":  { cls: "sa-barred",     label: "SOLE SOURCE" },
  "UNKNOWN":     { cls: "sa-unread",     label: "SET-ASIDE UNREAD" },
  "SB-Partial":  { cls: "sa-partial",    label: "SB · PARTIAL" },
  "SB":          { cls: "sa-restricted", label: "SB" },
  "SDVOSB":      { cls: "sa-restricted", label: "SDVOSB" },
  "8(a)":        { cls: "sa-restricted", label: "8(A)" },
  "HUBZone":     { cls: "sa-restricted", label: "HUBZONE" },
  "WOSB":        { cls: "sa-restricted", label: "WOSB" },
  "EDWOSB":      { cls: "sa-restricted", label: "EDWOSB" },
  "Full":        { cls: "sa-open",       label: "FULL & OPEN" },
};
for (const [pole, want] of Object.entries(TABLE)) {
  const got = saRender(pole);
  ok(got.cls === want.cls && got.label === want.label, `${pole.padEnd(11)} → ${want.cls} "${want.label}"`,
     got.cls === want.cls && got.label === want.label ? "" : `got ${got.cls} "${got.label}"`);
}

// ═══ G2 · coverage ═══════════════════════════════════════════════════════════
console.log("\nG2 · coverage — every emitted pole has an explicit register");
ok(polesFromClassifier.length >= 10, `classifier poles read from opportunities-live.js`, `${polesFromClassifier.length}: ${polesFromClassifier.join(", ")}`);
for (const pole of polesFromClassifier) {
  ok(TABLE[pole] !== undefined, `pole ${pole} is covered by this gate's table`);
}
const openPoles = polesFromClassifier.filter(p => saRender(p).cls === "sa-open");
ok(openPoles.length === 1 && openPoles[0] === "Full",
   `"Full" is the ONLY pole reaching the unrestricted register`,
   openPoles.length === 1 && openPoles[0] === "Full" ? "" : `also: ${openPoles.filter(p => p !== "Full").join(", ")}`);

// ═══ G3 · distinctness ═══════════════════════════════════════════════════════
console.log("\nG3 · four registers, not one");
function distinctnessFailures(render: (s: string) => Reg): string[] {
  const bad: string[] = [];
  const c = (p: string) => render(p).cls;
  if (c("SoleSource") === c("Full")) bad.push("SoleSource shares the register of Full");
  if (c("UNKNOWN") === c("Full")) bad.push("UNKNOWN shares the register of Full");
  if (c("SB") === c("Full")) bad.push("SB shares the register of Full");
  if (c("SoleSource") === c("SB")) bad.push("SoleSource shares the register of SB");
  if (c("SB-Partial") === c("SB")) bad.push("SB-Partial shares the register of SB");
  if (new Set(["SoleSource", "UNKNOWN", "SB-Partial", "SB", "Full"].map(c)).size !== 5)
    bad.push("the five poles do not resolve to five classes");
  return bad;
}
const d3 = distinctnessFailures(saRender);
ok(d3.length === 0, `SoleSource · UNKNOWN · SB-Partial · SB · Full are five registers`, d3.join(" | "));

// ═══ G4 · realisability in CSS, both themes, hue removed ═════════════════════
console.log("\nG4 · the registers exist in CSS, in both themes, without hue");
const STYLE = [...HTML.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join("\n");

function varsFor(theme: "light" | "dark", css: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const take = (selPattern: RegExp) => {
    for (const m of css.matchAll(selPattern)) {
      for (const d of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) vars[d[1]] = d[2].trim();
    }
  };
  take(/(?:^|\})\s*:root\s*\{([^}]*)\}/g);
  take(/(?:^|\})\s*:root\s*,\s*\[data-theme="light"\][^{]*\{([^}]*)\}/g);
  if (theme === "dark") take(/\[data-theme="dark"\]\s*\{([^}]*)\}/g);
  return vars;
}
function resolve(v: string, vars: Record<string, string>, depth = 0): string {
  if (depth > 12) return v;
  const m = v.match(/var\((--[\w-]+)(?:\s*,\s*([^)]*))?\)/);
  if (!m) return v.trim();
  const sub = vars[m[1]] ?? m[2] ?? "";
  return resolve(v.replace(m[0], sub), vars, depth + 1);
}
function declsFor(selector: string, css: string): Record<string, string> {
  const out: Record<string, string> = {};
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Anchored at a rule boundary so `.chip.sa-open` never matches inside
  // `.chip.sa-open::before`. `m` is required: a rule may open a line directly
  // after a comment, where the previous character is neither `}` nor `,`.
  for (const m of css.matchAll(new RegExp(`(?:^|[},])\\s*${esc}\\s*\\{([^}]*)\\}`, "gm"))) {
    for (const d of m[1].matchAll(/([\w-]+)\s*:\s*([^;}]+)/g)) out[d[1].trim()] = d[2].trim();
  }
  return out;
}
// A register's identity as the eye reads it: the fill, and — with hue stripped —
// the MARK and the border treatment.
function signature(cls: string, theme: "light" | "dark", css: string) {
  const vars = varsFor(theme, css);
  const base = declsFor(`.chip.${cls}`, css);
  const mark = declsFor(`.chip.${cls}::before`, css);
  const markShape = Object.keys(mark).length === 0 ? "none"
    : [mark["background"] ?? "", mark["border"] ?? "", mark["box-shadow"] ?? "", mark["border-radius"] ?? ""]
        .map(s => s.replace(/currentColor/g, "INK")).join("|");
  return {
    fill: resolve(base["background"] ?? base["background-color"] ?? "", vars),
    ink: resolve(base["color"] ?? "", vars),
    borderStyle: base["border-style"] ?? "solid",
    markShape,
    hueBlind: `${markShape}::${base["border-style"] ?? "solid"}`,
  };
}
const CLASSES = ["sa-barred", "sa-unread", "sa-partial", "sa-restricted", "sa-open"];
function cssFailures(css: string): string[] {
  const bad: string[] = [];
  for (const theme of ["light", "dark"] as const) {
    const sig = Object.fromEntries(CLASSES.map(c => [c, signature(c, theme, css)]));
    for (const c of CLASSES) {
      if (!sig[c].fill) bad.push(`${theme}: .chip.${c} has no resolved fill`);
      if (sig[c].fill && /var\(/.test(sig[c].fill)) bad.push(`${theme}: .chip.${c} fill unresolved (${sig[c].fill}) — token undefined in this theme`);
      if (!sig[c].ink) bad.push(`${theme}: .chip.${c} has no resolved ink`);
    }
    if (sig["sa-barred"].fill === sig["sa-open"].fill) bad.push(`${theme}: barred fill === open fill`);
    if (sig["sa-unread"].fill === sig["sa-open"].fill) bad.push(`${theme}: unread fill === open fill`);
    if (sig["sa-restricted"].fill === sig["sa-open"].fill) bad.push(`${theme}: restricted fill === open fill`);
    if (sig["sa-barred"].fill === sig["sa-restricted"].fill) bad.push(`${theme}: barred fill === restricted fill`);
    const fills = new Set(CLASSES.map(c => sig[c].fill));
    if (fills.size < 4) bad.push(`${theme}: only ${fills.size} distinct fills across 5 registers`);
    // Hue removed: greyscale and colour-blind readers get the same partition.
    if (sig["sa-barred"].hueBlind === sig["sa-open"].hueBlind) bad.push(`${theme}: barred and open are indistinguishable without hue`);
    if (sig["sa-unread"].hueBlind === sig["sa-open"].hueBlind) bad.push(`${theme}: unread and open are indistinguishable without hue`);
    if (sig["sa-partial"].hueBlind === sig["sa-restricted"].hueBlind) bad.push(`${theme}: partial and restricted are indistinguishable without hue`);
    if (sig["sa-open"].markShape !== "none") bad.push(`${theme}: the unrestricted register carries a mark`);
  }
  return bad;
}
const d4 = cssFailures(STYLE);
ok(d4.length === 0, `all five registers resolve, differ by fill, and survive greyscale`, d4.join(" | "));

// ═══ G5 · planted positives ══════════════════════════════════════════════════
console.log("\nG5 · planted positives — this gate must be able to fail");
// P1 · the pre-fix mapping, verbatim from dso-app.js before the register split.
const LEGACY = (s: string): Reg => {
  const R = ["SB", "SB-Partial", "SDVOSB", "8(a)", "HUBZone", "WOSB", "EDWOSB"];
  const cls = (s === "SoleSource" || s === "UNKNOWN") ? "sa full" : R.includes(s) ? "sa" : "sa full";
  return { cls, label: s, reg: cls };
};
const p1 = distinctnessFailures(LEGACY);
ok(p1.length >= 3, `P1 the pre-fix mapping is caught`, `${p1.length} findings: ${p1[0]}`);

// P2 · a stylesheet where barred and open share a fill (the CSS half of D1).
const P2_CSS = STYLE.replace(/\.chip\.sa-barred\{[^}]*\}/, `.chip.sa-barred{background:var(--open-bg);color:var(--open-ink);border-color:var(--open-line)}`);
const p2 = cssFailures(P2_CSS);
ok(p2.some(f => f.includes("barred fill === open fill")), `P2 a shared barred/open fill is caught`, `${p2.length} findings`);

// P3 · registers that differ by HUE ONLY — the failure a colour-blind reader
// gets and a screenshot review does not.
const P3_CSS = STYLE.replace(/\.chip\.sa-barred::before\{[^}]*\}/, "");
const p3 = cssFailures(P3_CSS);
ok(p3.some(f => f.includes("indistinguishable without hue")), `P3 a hue-only distinction is caught`, `${p3.length} findings`);

// P4 · a new classifier pole with no register must not fall through to open.
const P4 = (s: string): Reg => s === "NEWPOLE" ? { cls: "sa-open", label: "FULL & OPEN", reg: "open" } : saRender(s);
const p4Open = [...polesFromClassifier, "NEWPOLE"].filter(p => P4(p).cls === "sa-open");
ok(p4Open.length > 1, `P4 an unregistered pole reaching the open register is caught`, `${p4Open.join(", ")}`);

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
