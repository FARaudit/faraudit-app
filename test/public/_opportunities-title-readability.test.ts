// ─────────────────────────────────────────────────────────────────────────────
// Gate — notice titles are made readable WITHOUT being reinterpreted.
//
// DLA machine-generates titles and joins every part with underscores. Measured on
// the live feed: 45 of 196 titles carry them, and all 45 are DEPT OF DEFENSE —
// one publisher's habit, not a SAM-wide format. Splitting one shows the
// underscore is purely a stand-in for a space:
//
//   "CYLINDER ASSEMBLY,A_End_Item_B-02_NSN_1650015171308FW_PN_DAA3122A001-090"
//    → CYLINDER ASSEMBLY,A · End · Item · B-02 · NSN · 1650015171308FW · PN · …
//
// So the swap reconstructs the sentence DLA meant and loses nothing.
//
// THE LINE THIS GATE HOLDS: display only. No part may be dropped, reordered, or
// promoted to a field. Parsing structure out of an unstructured government title
// is how a wrong name lands on a notice someone is deciding whether to bid, and
// the raw string must stay reachable so a customer can always check us.
//
// Run: npx tsx test/public/_opportunities-title-readability.test.ts
// ─────────────────────────────────────────────────────────────────────────────
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync } from "node:fs";
import { unscopedAnchorColourRules } from "./_link-specificity";
import path from "node:path";
import vm from "node:vm";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const DSO = readFileSync(path.join(process.cwd(), "public", "dso-app.js"), "utf8");
const CODE = DSO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// Drive the SHIPPED helper.
let READABLE: (s: unknown) => string;
try {
  const m = DSO.match(/const READABLE = [^\n]+/);
  if (!m) throw new Error("const READABLE not found");
  const sandbox: any = { __out: {} };
  vm.createContext(sandbox);
  vm.runInContext(m[0] + "\n;__out.READABLE = READABLE;", sandbox);
  READABLE = sandbox.__out.READABLE;
} catch (e: any) {
  console.log(`\n  ✗ FATAL — READABLE must stay a top-level const: ${e.message}\n`);
  process.exit(1);
}

// Transcribed verbatim from the live feed.
const LIVE: [string, string][] = [
  ["CYLINDER ASSEMBLY,A_End_Item_B-02_NSN_1650015171308FW_PN_DAA3122A001-090",
   "CYLINDER ASSEMBLY,A End Item B-02 NSN 1650015171308FW PN DAA3122A001-090"],
  ["Power Supply_End_Item_KC135_NSN_6130012907512HY_PN_8ES003417-00",
   "Power Supply End Item KC135 NSN 6130012907512HY PN 8ES003417-00"],
  ["THRUST INDICATOR_End_Item_B001B_NSN_6620011829763_PN_8DJ219WCF1",
   "THRUST INDICATOR End Item B001B NSN 6620011829763 PN 8DJ219WCF1"],
  // Note the stray space before the underscore — the collapse must not leave two.
  ["Bushing , Sleeve _End_Item_B2_NSN_3120014250619FW_PN_04A082-05B019A",
   "Bushing , Sleeve End Item B2 NSN 3120014250619FW PN 04A082-05B019A"]
];

console.log("\nA · the live DLA titles read as sentences");
for (const [raw, want] of LIVE) ok(READABLE(raw) === want, raw.slice(0, 44) + "…", READABLE(raw));

console.log("\nB · NOTHING is dropped — every part survives the swap");
for (const [raw] of LIVE) {
  const parts = raw.split(/_+/).map((p) => p.trim()).filter(Boolean);
  const out = READABLE(raw);
  ok(parts.every((p) => out.includes(p)),
    "every underscore-separated part still present", parts.length + " parts");
}
// The identifiers are the whole point of these titles; losing one is the failure.
ok(READABLE(LIVE[0][0]).includes("1650015171308FW"), "the NSN survives verbatim");
ok(READABLE(LIVE[0][0]).includes("DAA3122A001-090"), "the part number survives verbatim");
ok(READABLE(LIVE[0][0]).includes("NSN") && READABLE(LIVE[0][0]).includes("PN"),
  "and their labels survive — the reader still knows which is which");

console.log("\nC · nothing else is touched");
ok(READABLE("MH-65 9 Frame D-ring Kit") === "MH-65 9 Frame D-ring Kit",
  "a hand-written title passes through unchanged");
ok(READABLE("Fairing Clearbore & Anti-abrasion Patches") === "Fairing Clearbore & Anti-abrasion Patches",
  "ampersands and hyphens are left alone");
ok(READABLE("Bracket") === "Bracket", "a one-word title is unchanged");
ok(READABLE("A__B") === "A B", "a run of underscores collapses to ONE space, not three");
ok(READABLE("  padded  ") === "padded", "surrounding whitespace is trimmed");
ok(READABLE("") === "", "an empty title stays empty");
ok(READABLE(null) === "", "a null title yields '' rather than throwing mid-render");
ok(READABLE(undefined) === "", "so does undefined");
ok(READABLE(12345 as unknown) === "", "and a non-string");

console.log("\nD · it is display only — the raw value stays reachable");
ok(/title="' \+ esc\(o\.title \|\| ''\) \+ '"/.test(DSO) || /title="'\+esc\(o\.title\|\|''\)\+'"/.test(DSO),
  "the card title attribute carries the EXACT string SAM published");
ok((CODE.match(/READABLE\(o\.title\)/g) || []).length === 2,
  "applied at both render sites — the row card and the Closing-first panel",
  String((CODE.match(/READABLE\(o\.title\)/g) || []).length));
// The transform must not reach anything that is matched, searched or sent.
ok(!/READABLE\([^)]*\)\s*\.\s*(includes|indexOf|match)/.test(CODE),
  "it is never used for matching — search still runs on the real title");
ok(!/solicitation[^\n]*READABLE|READABLE[^\n]*solicitation/i.test(CODE),
  "and never touches the solicitation number");

console.log("\nF · the title LOOKS like the doorway it is");
/* The title is an anchor to /notices/<id>. Before this gate it was ink with
   text-decoration:none — identical to a heading — and the only signals were :hover
   and the pointer cursor, NEITHER of which exists on touch. These assert the
   at-rest affordance, and that it is paid for without a third blue on the card. */
const OPPS = readFileSync(path.join(import.meta.dirname ?? __dirname, "..", "..", "public", "opportunities.html"), "utf8");
const restRule = (OPPS.match(/\na\.pc-title\{[^}]*\}/) || [""])[0];

ok(/text-decoration\s*:\s*underline/.test(restRule),
  "the title is underlined AT REST, not only on hover",
  "hover and cursor:pointer both require a pointing device");
ok(/text-decoration-color\s*:\s*var\(--mute\)/.test(restRule),
  "the underline carries NO HUE — it is --mute",
  "a blue underline is what opportunities.html:341 objected to, and the objection stands");
/* Asserts the VALUE, not the absence of a declaration: the ruling restates
   `color:var(--ink)` on purpose, to make "unchanged" explicit at the rule. Testing
   for no colour declaration at all failed on a rule that changes no colour. */
const restColour = (restRule.match(/(?:^|[;{])\s*color\s*:\s*([^;}]+)/) || [])[1];
ok(restColour === undefined || restColour.trim() === "var(--ink)",
  "the title's own colour is unchanged at rest",
  `recolouring it would add the third blue the card cannot afford — found ${restColour}`);
ok(/a\.pc-title:focus-visible\{[^}]*outline/.test(OPPS),
  "the title has a visible keyboard focus state");

ok(/@media\(max-width:1000px\)\{\s*a\.pc-title\{[^}]*padding:13px 0/.test(OPPS.replace(/\/\*[\s\S]*?\*\//g, "")),
  "short titles get a 44px+ tap target at narrow widths",
  "measured at 390px: 14 of 180 titles fall under 44px, the shortest at 19px");
ok(!/@media\(max-width:1000px\)\{\s*a\.pc-title\{[^}]*display:inline-block/.test(OPPS.replace(/\/\*[\s\S]*?\*\//g, "")),
  "no inert display:inline-block on the tap-target rule",
  ".pc-main is display:flex, so a flex item's inline-block is blockified to block");
ok(/\[data-theme="dark"\]\s+a\.pc-title:hover\{/.test(OPPS),
  "the dark hover rule is scoped to the CLASS",
  "0-2-1 cannot reach .btn-open; the unscoped form is 0-1-1 and can");

/* The SAM.gov link is a DIFFERENT DESTINATION — sam.gov, in a new tab. It is not a
   second door to our page, and removing it would delete the only route to the
   authoritative source. */
const DSOJS = readFileSync(path.join(import.meta.dirname ?? __dirname, "..", "..", "public", "dso-app.js"), "utf8");
ok(/view notice/.test(DSOJS) && /o\.ui_link/.test(DSOJS) && /target="_blank"/.test(DSOJS),
  "the SAM.gov link still points OFF-SITE and survives",
  "it is the source document, not a duplicate of the title's destination");

/* The trap the file documents at line 61: a plainly-written dark link rule is 0-1-1,
   outranks .btn-open, and drops the primary button's label to 4.25:1. */
/* ONE DETECTOR, SHARED. This used to ban the literal string `[data-theme="dark"] a{`,
   which is the wrong shape — the trap belongs to any page-wide rule colouring a bare
   anchor, and to any component that IS an anchor, not to that one selector. The general
   form lives in _link-specificity.test.ts and is imported rather than restated. */
const CSS_ONLY = OPPS.replace(/\/\*[\s\S]*?\*\//g, "");
ok(unscopedAnchorColourRules(OPPS).length === 0,
  "every bare-anchor colour rule is at zero specificity",
  "a 0-1-1 rule out-specifies .btn-open and repaints its label to 4.25:1");

console.log("\nE · falsifiability (planted positive)");
// Plant the tempting over-reach: strip the identifiers to 'clean up' the title.
const planted = (s: string) => s.replace(/_+/g, " ").replace(/\s*(NSN|PN|End Item)\s+\S+/g, "").trim();
const lost = planted(LIVE[0][0]);
ok(!lost.includes("1650015171308FW"),
  "an implementation that 'tidies' the identifiers away IS caught by the B checks",
  `it yields "${lost}" — the NSN is gone`);

// Plant the shipped defect back: a title with no at-rest decoration.
const plantedRule = restRule.replace(/text-decoration\s*:\s*underline/, "text-decoration:none");
ok(!/text-decoration\s*:\s*underline/.test(plantedRule),
  "removing the at-rest underline IS caught by the F checks",
  "the planted rule yields no underline");
// Plant the documented contrast trap.
const plantedTrap = CSS_ONLY.replace(':where([data-theme="dark"]) :where(a){', '[data-theme="dark"] a{');
ok(unscopedAnchorColourRules(plantedTrap).length > 0,
  "un-scoping the dark link rule IS caught by the F checks",
  "the 0-1-1 selector is detected by the shared detector");

console.log(`\n${fail === 0 ? "✅ ALL PASS" : `❌ ${fail} RED`} — ${pass} check(s) green`);
process.exit(fail === 0 ? 0 : 1);
