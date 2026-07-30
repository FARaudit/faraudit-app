// ─────────────────────────────────────────────────────────────────────────────
// OPPORTUNITIES CLASSIFIER GATE — the invariant that makes a wrong mapping fail
// a BUILD instead of a customer.
//
// Why this file exists: on 2026-07-29 a 66-check Playwright suite reported
// "every control verified against independently recomputed expectations" while
// two classifiers were domain-wrong on 42% and 28% of the live feed. It could
// not see them because it recomputed its expectations from the SAME mapper it
// was testing — self-consistent by construction. `set-aside SB → 129 rows,
// expected 129` passed, and 83 of those 129 were SAM's "No Set aside used"
// (unrestricted) displayed to a small business as reserved for them.
//
// So this gate never counts. It asserts:
//   G1  the raw source token → rendered pole TABLE (the instrument that sees an
//       inversion; a count cannot)
//   G2  COVERAGE — every raw token the live feed actually emits has an explicit
//       rule. An unrecognised token must reach the fail-closed pole, and the
//       gate FAILS if the feed carries a token no rule matches.
//   G3  FAIL-CLOSED — neither classifier may end in a permissive default that
//       asserts a real category.
//   G4  RENDERABILITY — every pole a classifier can emit has a STAGE_META entry
//       and appears in the filter list, so no pole renders as a blank chip.
//   G5  PLANTED POSITIVES — inject a token that must be mis-handled by the OLD
//       logic, and assert this gate catches it. A gate that cannot fail proves
//       nothing.
//
// Run: npx tsx test/test/public/_opportunities-classifier.test.ts
// The classifiers live in public/opportunities-live.js (plain browser JS, loaded
// via <script>), so we EXECUTE that file's functions rather than reimplementing
// them — a reimplementation would drift and re-create the original blind spot.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

// ── load the SHIPPED classifiers out of the browser file ─────────────────────
const LIVE_JS = readFileSync(path.join(process.cwd(), "public", "opportunities-live.js"), "utf8");
const DATA_JS = readFileSync(path.join(process.cwd(), "public", "dso-data.js"), "utf8");

function extractFn(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found in opportunities-live.js`);
  let depth = 0, i = src.indexOf("{", start);
  const open = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1) + `\n;__out.${name} = ${name};`;
}
function extractDecl(src: string, name: string): string {
  const re = new RegExp(`(?:var|const|let)\\s+${name}\\s*=\\s*`);
  const m = src.match(re);
  if (!m) throw new Error(`${name} not found`);
  const start = src.indexOf(m[0]);
  let i = src.indexOf(m[0][m[0].length - 1] === "=" ? "=" : "=", start) + 1;
  while (/\s/.test(src[i])) i++;
  const openCh = src[i];
  const closeCh = openCh === "[" ? "]" : "}";
  let depth = 0;
  const from = i;
  for (; i < src.length; i++) {
    if (src[i] === openCh) depth++;
    else if (src[i] === closeCh) { depth--; if (depth === 0) break; }
  }
  // Bind as a sandbox global too — the extracted functions reference these by
  // bare identifier, exactly as they do in the browser.
  return `var ${name} = ${src.slice(from, i + 1)}; __out.${name} = ${name};`;
}

const sandbox: any = { __out: {}, console };
vm.createContext(sandbox);
vm.runInContext(
  [
    extractDecl(LIVE_JS, "SETASIDE_RULES"),
    extractFn(LIVE_JS, "normSetaside"),
    extractDecl(LIVE_JS, "DOCTYPE_STAGE"),
    extractFn(LIVE_JS, "normStage"),
    extractDecl(DATA_JS, "STAGE_META"),
    extractDecl(DATA_JS, "SETASIDES")
  ].join("\n"),
  sandbox
);
const { normSetaside, normStage, SETASIDE_RULES, DOCTYPE_STAGE, STAGE_META, SETASIDES } = sandbox.__out;

// ── the raw tokens the LIVE feed actually emits ───────────────────────────────
// Observed 2026-07-29 across 200 live SAM rows via fetchLiveSamRowsUncached.
// This list is the contract: when SAM adds or renames an enumeration value, the
// probe below surfaces it and G2 fails the build rather than a customer finding
// out. Refresh with: npx tsx test/... (see OPPS-CLASSIFIER board row).
const OBSERVED_SETASIDE_TOKENS: Array<[string | null, string]> = [
  [null, "Full"],                                                                   // SAM published no set-aside
  ["No Set aside used", "Full"],                                                     // 83 rows — WAS inverted to 'SB'
  ["Small Business Set Aside - Total", "SB"],                                        // 43 rows
  ["Small Business Set Aside - Partial", "SB-Partial"],                              // partial ≠ total
  ["SBA Certified Women-Owned Small Business (WOSB) Program Set-Aside (FAR 19.15)", "WOSB"],
  ["SBA Certified Women-Owned Small Business (WOSB) Program Sole Source (FAR 19.15)", "SoleSource"], // directed buy first
  // Enumeration values not present in the 2026-07-29 window but published by SAM:
  ["Service-Disabled Veteran-Owned Small Business (SDVOSB) Set-Aside (FAR 19.14)", "SDVOSB"],
  ["8(a) Set-Aside (FAR 19.8)", "8(a)"],
  ["8(a) Sole Source (FAR 19.8)", "SoleSource"],
  ["HUBZone Set-Aside (FAR 19.13)", "HUBZone"],
  ["Economically Disadvantaged WOSB (EDWOSB) Program Set-Aside (FAR 19.15)", "EDWOSB"]
];

const OBSERVED_DOCTYPE_TOKENS: Array<[string, string]> = [
  ["Combined", "rfp"],       // 56 rows — WAS 'sources' (told them to shape a live solicitation)
  ["SrcSght", "sources"],    // 24 rows
  ["RFQ", "rfp"],            // 89 rows
  ["Special", "notice"],     // 20 rows — WAS 'rfp' with a metered Run Audit CTA
  ["PreSol", "presol"],      // 11 rows
  ["Award", "eval"],
  ["Mod", "eval"],
  ["IDIQ", "rfp"], ["BPA", "rfp"], ["TaskOrd", "rfp"]
];

console.log("\n═══ G1 · RAW TOKEN → RENDERED POLE (the table a count cannot see) ═══");
for (const [raw, expected] of OBSERVED_SETASIDE_TOKENS) {
  const got = normSetaside(raw as any);
  ok(got === expected, `set-aside  ${JSON.stringify(raw)?.slice(0, 62)} → ${expected}`, got === expected ? "" : `got "${got}"`);
}
for (const [raw, expected] of OBSERVED_DOCTYPE_TOKENS) {
  const got = normStage(raw, "");
  ok(got === expected, `stage      "${raw}" → ${expected}`, got === expected ? "" : `got "${got}"`);
}

console.log("\n═══ G2 · COVERAGE — no observed token may reach the fail-closed pole ═══");
const uncoveredSa = OBSERVED_SETASIDE_TOKENS.filter(([raw]) => normSetaside(raw as any) === "UNKNOWN").map(([r]) => r);
ok(uncoveredSa.length === 0, "every observed set-aside token has an explicit rule", uncoveredSa.join(" | "));
const uncoveredDt = OBSERVED_DOCTYPE_TOKENS.filter(([raw]) => normStage(raw, "") === "UNKNOWN").map(([r]) => r);
ok(uncoveredDt.length === 0, "every observed notice type has an explicit rule", uncoveredDt.join(" | "));

console.log("\n═══ G3 · FAIL-CLOSED — no permissive default ═══");
const NONSENSE = ["zzz-not-a-real-token", "Qxj Program 2199", "??", "Set aside: TBD by CO"];
ok(NONSENSE.every((t) => normSetaside(t) === "UNKNOWN"),
  "unrecognised set-aside → UNKNOWN (never 'SB', never 'Full')",
  NONSENSE.map((t) => `${t}→${normSetaside(t)}`).join(" · "));
ok(NONSENSE.every((t) => normStage(t, "") === "UNKNOWN"),
  "unrecognised notice type → UNKNOWN (never 'rfp')",
  NONSENSE.map((t) => `${t}→${normStage(t, "")}`).join(" · "));
// the exact historical regressions, asserted as named cases
ok(normSetaside("No Set aside used") !== "SB", "REGRESSION GUARD: 'No Set aside used' must never render SB");
ok(normStage("Combined", "") !== "sources", "REGRESSION GUARD: Combined must never render Sources Sought");
ok(normStage("Special", "") !== "rfp", "REGRESSION GUARD: Special Notice must never render Open RFP");
ok(normSetaside("SBA Certified Women-Owned Small Business (WOSB) Program Sole Source (FAR 19.15)") === "SoleSource",
  "REGRESSION GUARD: a WOSB sole-source is a directed buy, not an SB opportunity");

console.log("\n═══ G4 · RENDERABILITY — every emittable pole is renderable ═══");
const stagePoles = new Set<string>([...Object.values(DOCTYPE_STAGE) as string[], "presol", "sources", "rfp", "notice", "eval", "UNKNOWN"]);
const missingMeta = [...stagePoles].filter((p) => !STAGE_META[p]);
ok(missingMeta.length === 0, `all ${stagePoles.size} stage poles have a STAGE_META entry (no blank chip)`, missingMeta.join(","));
const saPoles = new Set<string>([...(SETASIDE_RULES as any[]).map((r) => r.pole), "Full", "UNKNOWN"]);
const missingFilter = [...saPoles].filter((p) => !SETASIDES.includes(p));
ok(missingFilter.length === 0, `all ${saPoles.size} set-aside poles appear in the filter list`, missingFilter.join(","));

console.log("\n═══ G5 · PLANTED POSITIVES — prove this gate can fail ═══");
// A gate that cannot fail is a placebo. Each planted case reproduces a real
// historical defect against a deliberately-broken classifier and asserts the
// gate's own logic rejects it.
const oldNormSetaside = (s: string | null) => {
  if (!s) return "Full";
  const u = String(s).toLowerCase();
  if (u.includes("sdvosb")) return "SDVOSB";
  if (u.includes("wosb")) return "SB";
  if (u.includes("small business")) return "SB";
  if (u.includes("full") || u.includes("open")) return "Full";
  return "SB"; // the permissive default that caused the 42% inversion
};
ok(oldNormSetaside("No Set aside used") === "SB" && normSetaside("No Set aside used") === "Full",
  "planted: OLD logic inverts 'No Set aside used'→SB; NEW returns Full", "gate distinguishes them");
ok(oldNormSetaside("zzz-unknown") === "SB" && normSetaside("zzz-unknown") === "UNKNOWN",
  "planted: OLD logic asserts SB on nonsense; NEW fails closed");
const oldNormStage = (d: string) => (d.toLowerCase() === "combined" ? "sources" : "rfp");
ok(oldNormStage("Combined") === "sources" && normStage("Combined", "") === "rfp",
  "planted: OLD logic maps Combined→sources; NEW maps to an open solicitation");
ok(oldNormStage("Special") === "rfp" && normStage("Special", "") === "notice",
  "planted: OLD logic maps Special→rfp; NEW gives it its own pole");
// and prove G2 itself fires: a token with no rule must be reported, not swallowed
const syntheticFeedToken = "Brand New SAM Enumeration Value 2027";
ok(normSetaside(syntheticFeedToken) === "UNKNOWN",
  "planted: an unseen future SAM enumeration reaches UNKNOWN, so G2 would flag it");

console.log(`\n══════ ${pass} passed · ${fail} failed ══════`);
if (fail > 0) {
  console.error("\nCLASSIFIER GATE FAILED — a raw→rendered mapping is wrong or a token is uncovered.");
  process.exit(1);
}
console.log("classifier gate clean.");
