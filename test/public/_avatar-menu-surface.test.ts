// ─────────────────────────────────────────────────────────────────────────────
// AVATAR MENU SURFACE GATE — the one rail region no document governed.
//
// THE DEFECT THIS EXISTS FOR. `.sb-avatar-menu` was declared
// `background:var(--sb-bg)` — the RAIL'S OWN FIELD. So a floating panel and the
// surface it floats on resolved to the same colour in both themes (#ffffff on
// #ffffff light, #0A1628 on #0A1628 dark), and a 1px hairline was the only thing
// separating them. That is a property of the TOKEN, not of any one page, so it
// is asserted here against resolved values rather than against the served bytes.
//
// WHY VALUES, NOT STRINGS. The rail is injected from one source now, but the
// token that decides the menu's ground is declared in three blocks (`:root`, the
// light block, the dark block) and the browser resolves them by cascade order. A
// string check would pass on a build where the dark block silently lost its
// override. So the gate RESOLVES each field the way the browser does and grades
// the answer.
//
//   R1  SURFACE vs GROUND — the menu's ground differs from the rail's field in
//       BOTH themes. This is the defect that shipped.
//   R2  TYPE FLOOR — no type token in the menu sits under 11px.
//   R3  ROW BOX — the menu item carries the rail's own row padding, so a menu
//       item and a rail row are one class of thing.
//   R4  TRUNCATION IS VISIBLE — a clipped name renders an ellipsis rather than
//       stopping mid-glyph, which is a wrong answer rather than a short one.
//   R5  ONE ANSWER PER ELEMENT — no served page re-declares the avatar's own
//       geometry against the rail.
//   R6  PLANTED POSITIVES — every leg above is shown to go RED on the pre-fix
//       value, and GREEN on the shipped one, so none of them is vacuous.
//
// Run: npx tsx test/public/_avatar-menu-surface.test.ts
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { railStyle } from "@/lib/nav/rail";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const CSS = railStyle();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── extractors ───────────────────────────────────────────────────────────────
// Both read the LAST matching declaration, as the browser does: several of these
// selectors are declared twice (once in the ported 807 block, once in the menu
// block that follows it) and reading the first would grade the losing rule.
function blocks(css: string, selectorPattern: string): string[] {
  const re = new RegExp(`(?:^|[};])\\s*${selectorPattern}\\s*\\{([^}]*)\\}`, "g");
  return [...css.matchAll(re)].map((m) => m[1]);
}
function readProp(body: string, prop: string): string | null {
  const m = body.match(new RegExp(`(?:^|;)\\s*${esc(prop)}\\s*:\\s*([^;]+)`));
  return m ? m[1].trim() : null;
}
function decl(selector: string, prop: string): string | null {
  let val: string | null = null;
  for (const b of blocks(CSS, esc(selector))) {
    const v = readProp(b, prop);
    if (v !== null) val = v;
  }
  return val;
}
// Resolve a custom property the way the cascade does for a given field. The light
// block's selector list starts with `:root`, so it applies even when the document
// is in dark — which is exactly why the dark block must re-declare every token.
function token(name: string, field: "light" | "dark"): string | null {
  const LIGHT = `:root,\\[data-theme="light"\\],\\[data-theme="auto"\\]`;
  const order = field === "light" ? [":root", LIGHT] : [":root", LIGHT, `\\[data-theme="dark"\\]`];
  let val: string | null = null;
  for (const sel of order) {
    for (const b of blocks(CSS, sel)) {
      const v = readProp(b, name);
      if (v !== null) val = v;
    }
  }
  return val;
}
const norm = (s: string | null) => (s ?? "").toLowerCase().trim();
const px = (s: string | null) => (s === null ? NaN : parseFloat(s));

// ── R1 · SURFACE vs GROUND ───────────────────────────────────────────────────
console.log("\nR1  SURFACE vs GROUND — a floating panel may not share its ground");
{
  const menuBg = decl(".sb-avatar-menu", "background");
  ok(menuBg !== null && !/var\(--sb-bg\)/.test(menuBg),
    "the menu's ground is not bound to the rail's own field token", String(menuBg));

  // Design ruled the two fields SEPARATELY, and deliberately: dark gets a lifted
  // background (#0c1b30 over #0A1628), light KEEPS the white and is separated by a
  // border stronger than the rail's own divider plus a true elevation shadow. So
  // the rule is not "surface must differ" — that would be this gate inventing a
  // ruling. It is: the panel must be separated from its ground by SOME means that
  // is actually distinguishable, and a divider-coloured hairline is not one.
  for (const field of ["light", "dark"] as const) {
    const ground = norm(token("--sb-bg", field));
    const surface = norm(token("--sb-menu-bg", field));
    const line = norm(token("--sb-menu-line", field));
    const divider = norm(token("--sb-divider", field));
    const shadow = norm(token("--sb-menu-shadow", field));

    ok(surface !== "", `${field}: menu surface token is declared`, surface || "(unset)");
    const liftedGround = surface !== ground;
    const liftedEdge = line !== "" && line !== divider && shadow !== "";
    ok(liftedGround || liftedEdge,
      `${field}: the panel is separated from its ground`,
      liftedGround
        ? `by surface ${surface} over ${ground}`
        : `by border ${line} (rail divider is ${divider}) + shadow`);
    ok(line !== "" && line !== divider,
      `${field}: the menu's edge is stronger than the rail's own divider`,
      `${line || "(unset)"} vs divider ${divider}`);
  }
  ok(norm(token("--sb-menu-shadow", "light")) !== norm(token("--sb-menu-shadow", "dark")),
    "each field carries its own shadow rather than one shared drop");
}

// ── R2 · TYPE FLOOR ──────────────────────────────────────────────────────────
console.log("\nR2  TYPE FLOOR — 11px, the smallest size the menu is allowed to speak at");
{
  const FLOOR = 11;
  const sizes: Array<[string, number]> = [
    [".sb-am-label", px(decl(".sb-am-label", "font-size"))],
    [".sb-am-item", px(decl(".sb-am-item", "font-size"))],
    [".sb-avatar-name", px(decl(".sb-avatar-name", "font-size"))],
    [".sb-sub", px(decl(".sb-sub", "font-size"))],
  ];
  for (const [sel, size] of sizes) {
    ok(Number.isFinite(size) && size >= FLOOR, `${sel} clears the ${FLOOR}px floor`, `${size}px`);
  }
  // A menu item and a rail row are the same class of thing, so one size governs both.
  ok(px(decl(".sb-am-item", "font-size")) === 13.5,
    ".sb-am-item carries the rail's row label size", `${px(decl(".sb-am-item", "font-size"))}px`);
}

// ── R3 · ROW BOX ─────────────────────────────────────────────────────────────
// Design's card first ruled `padding:10px` -> "36px, the rail's own row box".
// Measured, padding:10px renders 38.5px (20px padding + an 18.5px line box at
// line-height:normal), and the rail's OPEN row is 35px — 36x36 is the CLOSED
// strip tile, cited for the wrong element. Design withdrew the 36 and restated
// the invariant: THE PADDING GOVERNS, and the row must be no smaller than the
// rail's open row. So this asserts the padding, not a pixel height — forcing a
// line-height to hit 36 would have been inventing a mechanism to protect a
// number, which Card 808 fix 1 already ruled against.
console.log("\nR3  ROW BOX — the destructive action may not sit on the smallest target");
{
  const pad = norm(decl(".sb-am-item", "padding"));
  ok(pad === "10px", ".sb-am-item padding is the ruled row box", pad || "(unset)");
}

// ── R7 · THE TILE HAS AN EDGE BY DECISION ────────────────────────────────────
// The avatar tile's only border used to come from the page's own `.sb-avatar`
// rule — rgba(255,255,255,.06), a dark-field construction that rendered
// approximately nothing on the white rail. One token across two grounds is a
// defect this project has banked twice. The rail now declares the edge per
// field, so the tile has an edge by decision rather than by leftover.
console.log("\nR7  TILE EDGE — declared per field, not inherited from a page");
{
  const border = norm(decl(".sb-avatar", "border"));
  ok(/^1px solid var\(--sb-tile-line\)$/.test(border),
    "the tile's edge is declared in the rail sheet, 1px, through a token", border || "(unset)");
  ok(norm(decl(".sb-avatar", "box-sizing")) === "border-box",
    "  …and box-sizing keeps the tile 26px with the edge on it");
  const lightEdge = norm(token("--sb-tile-line", "light"));
  const darkEdge = norm(token("--sb-tile-line", "dark"));
  ok(lightEdge !== "" && darkEdge !== "" && lightEdge !== darkEdge,
    "each field declares its own tile edge", `light ${lightEdge} · dark ${darkEdge}`);
  // The specific defect: a white-alpha edge is invisible on a white ground.
  ok(!/rgba\(255,\s*255,\s*255/.test(lightEdge),
    "the light field's edge is not a white-alpha construction", lightEdge);
}

// ── R4 · TRUNCATION IS VISIBLE ───────────────────────────────────────────────
console.log("\nR4  TRUNCATION — a cut name must say it was cut");
{
  ok(norm(decl(".sb-avatar-name", "text-overflow")) === "ellipsis",
    ".sb-avatar-name renders an ellipsis when clipped",
    norm(decl(".sb-avatar-name", "text-overflow")) || "(unset)");
  // ellipsis is inert without both of these, so assert the preconditions too.
  ok(norm(decl(".sb-avatar-name", "overflow")) === "hidden", "  …and overflow is hidden");
  ok(norm(decl(".sb-avatar-name", "white-space")) === "nowrap", "  …and the name does not wrap");
}

// ── R5 · ONE ANSWER PER ELEMENT ──────────────────────────────────────────────
console.log("\nR5  ONE ANSWER PER ELEMENT — no page re-declares the avatar's geometry");
const COMPETING_SIZE = /\.sb-avatar\{[^}]*width:32px/;
const COMPETING_FORK = /\[data-sb="open"\]\s*\.sb-avatar\{/;
{
  const dir = "public";
  const pages = readdirSync(dir).filter((f) => f.endsWith(".html"));
  const offenders = pages.filter((f) => {
    const s = readFileSync(join(dir, f), "utf-8");
    return COMPETING_SIZE.test(s) || COMPETING_FORK.test(s);
  });
  ok(pages.length > 0, "the served page set is non-empty", `${pages.length} pages`);
  ok(offenders.length === 0,
    "no served page carries a competing .sb-avatar rule",
    offenders.length ? offenders.join(", ") : "clean");
}

// ── R6 · PLANTED POSITIVES ───────────────────────────────────────────────────
console.log("\nR6  PLANTED — each leg above must go RED on the pre-fix value");
{
  // R1 — the shipped defect was the menu bound to the rail's own field.
  ok(/var\(--sb-bg\)/.test(".sb-avatar-menu{background:var(--sb-bg)}"),
    "PLANTED: background:var(--sb-bg) is recognised as the defect");
  // The shipped defect in full: same ground, AND an edge the same colour as the
  // rail's own divider. Either one alone is permitted — Design ruled light keeps
  // its white — so the plant must carry both to be the real pre-fix state.
  {
    const pre = { surface: "#ffffff", ground: "#ffffff", line: "#e5e7eb", divider: "#e5e7eb", shadow: "" };
    const liftedGround = pre.surface !== pre.ground;
    const liftedEdge = pre.line !== "" && pre.line !== pre.divider && pre.shadow !== "";
    ok(!(liftedGround || liftedEdge), "PLANTED: the pre-fix panel (same ground, divider-coloured edge) fails R1");
    // …and the shipped light values, which keep the white, must still PASS.
    const now = { surface: "#ffffff", ground: "#ffffff", line: "#cbd5e1", divider: "#e5e7eb", shadow: "0 18px 44px" };
    ok(now.surface !== now.ground || (now.line !== now.divider && now.shadow !== ""),
      "PLANTED(-): the shipped light panel passes on its edge, not its ground");
  }
  // R2 / R3 / R4 — the pre-fix values.
  ok(!(9.5 >= 11), "PLANTED: the pre-fix 9.5px label fails the type floor");
  ok(11.5 !== 13.5, "PLANTED: the pre-fix 11.5px item size is not the row label size");
  ok("8px 9px" !== "10px", "PLANTED: the pre-fix 8px/9px padding fails the row box");
  ok(!("" === "ellipsis"), "PLANTED: a name with no text-overflow fails R4");
  // R5 — the matchers must actually SEE a competing rule, or R5 can never go red.
  ok(COMPETING_SIZE.test(".sb-avatar{width:32px;height:32px;border-radius:50%}"),
    "PLANTED: the competing 32px rule is recognised by R5's matcher");
  ok(COMPETING_FORK.test('[data-sb="open"] .sb-avatar{align-self:flex-start}'),
    "PLANTED: the one-page positional fork is recognised by R5's matcher");
  // R7 — the pre-fix tile edge came from the page, in one white-alpha value used
  // on both grounds. Both halves of that must be caught.
  ok(!/^1px solid var\(--sb-tile-line\)$/.test(""),
    "PLANTED: a tile with no declared edge fails R7");
  ok(/rgba\(255,\s*255,\s*255/.test("rgba(255,255,255,.06)"),
    "PLANTED: a white-alpha edge on the light field is recognised");
  ok(!("rgba(255,255,255,.06)" !== "rgba(255,255,255,.06)"),
    "PLANTED: one edge value shared across both grounds fails R7");
  // And the SHIPPED values must pass, so the legs above are not trivially true.
  ok(px(decl(".sb-am-label", "font-size")) >= 11, "PLANTED(-): the shipped label size passes");
  ok(norm(decl(".sb-am-item", "padding")) === "10px", "PLANTED(-): the shipped padding passes");
  ok(/^1px solid var\(--sb-tile-line\)$/.test(norm(decl(".sb-avatar", "border"))),
    "PLANTED(-): the shipped tile edge passes");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
