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

console.log("\nE · falsifiability (planted positive)");
// Plant the tempting over-reach: strip the identifiers to 'clean up' the title.
const planted = (s: string) => s.replace(/_+/g, " ").replace(/\s*(NSN|PN|End Item)\s+\S+/g, "").trim();
const lost = planted(LIVE[0][0]);
ok(!lost.includes("1650015171308FW"),
  "an implementation that 'tidies' the identifiers away IS caught by the B checks",
  `it yields "${lost}" — the NSN is gone`);

console.log(`\n${fail === 0 ? "✅ ALL PASS" : `❌ ${fail} RED`} — ${pass} check(s) green`);
process.exit(fail === 0 ? 0 : 1);
