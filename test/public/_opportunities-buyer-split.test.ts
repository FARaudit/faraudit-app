// ─────────────────────────────────────────────────────────────────────────────
// BUYER SPLIT GATE — the department and the buying office must be addressable
// separately, and splitting them must change NOTHING that renders today.
//
// Why: `resolveAgency()` keeps the first two segments of SAM's dotted
// `fullParentPathName` and joins them with " · ", so a row arrived carrying
// "DEPT OF DEFENSE · DEFENSE LOGISTICS AGENCY" in ONE field while `office` was
// hardcoded to "". Nothing could key on either name — not a buyer breakdown, not
// an office filter, not a display map. Measured against the live feed: 180 of 200
// notices in the 30-day NAICS 336413 window carry "DEPT OF DEFENSE" as the
// department, with the office varying beneath it.
//
//   B1  raw resolveAgency output → {agency, office} TABLE, written from the
//       source strings the live feed actually emits.
//   B2  NO RENDER CHANGE — agency + " · " + office recomposes the original
//       byte-for-byte, which is exactly what the row template prints.
//   B3  fail-safe — absent / single-segment / whitespace inputs never guess.
//   B4  PLANTED POSITIVES — a naive split must be caught.
//
// Run: npx tsx test/public/_opportunities-buyer-split.test.ts
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

const SRC = readFileSync(path.join(process.cwd(), "public", "opportunities-live.js"), "utf8");
function extractFn(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name}() not found in opportunities-live.js`);
  let depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1) + `\n;__out.${name} = ${name};`;
}
const sandbox: any = { __out: {}, console };
vm.createContext(sandbox);
vm.runInContext(extractFn(SRC, "agencyParts"), sandbox);
const agencyParts: (s: unknown) => [string, string] = sandbox.__out.agencyParts;

// ═══ B1 · the table, from strings the live feed actually emits ═══════════════
console.log("\nB1 · resolveAgency output → {agency, office}");
const TABLE: Array<[string, string, string]> = [
  ["DEPT OF DEFENSE · DEFENSE LOGISTICS AGENCY", "DEPT OF DEFENSE", "DEFENSE LOGISTICS AGENCY"],
  ["HOMELAND SECURITY, DEPARTMENT OF · US COAST GUARD", "HOMELAND SECURITY, DEPARTMENT OF", "US COAST GUARD"],
  ["DEPT OF DEFENSE · DEPT OF THE AIR FORCE", "DEPT OF DEFENSE", "DEPT OF THE AIR FORCE"],
  ["JUSTICE, DEPARTMENT OF · FEDERAL BUREAU OF INVESTIGATION", "JUSTICE, DEPARTMENT OF", "FEDERAL BUREAU OF INVESTIGATION"],
  ["NATIONAL AERONAUTICS AND SPACE ADMINISTRATION", "NATIONAL AERONAUTICS AND SPACE ADMINISTRATION", ""],
];
for (const [raw, wantA, wantO] of TABLE) {
  const [a, o] = agencyParts(raw);
  ok(a === wantA && o === wantO, `${raw.slice(0, 46).padEnd(48)} → ${wantA.slice(0, 20)} | ${wantO.slice(0, 24) || "(none)"}`,
     a === wantA && o === wantO ? "" : `got ${a} | ${o}`);
}

// ═══ B2 · no render change ═══════════════════════════════════════════════════
// The row template prints  esc(agency) + (office ? ' · ' + esc(office) : '')  —
// so recomposition must be byte-identical or this is a visible regression.
console.log("\nB2 · the split recomposes to the original — nothing on screen moves");
for (const [raw] of TABLE) {
  const [a, o] = agencyParts(raw);
  const rendered = a + (o ? " · " + o : "");
  ok(rendered === raw, `recomposed === original`, rendered === raw ? raw.slice(0, 52) : `${rendered} !== ${raw}`);
}

// ═══ B3 · fail-safe ══════════════════════════════════════════════════════════
console.log("\nB3 · absent and malformed inputs never guess");
const empties: Array<[unknown, string]> = [[null, "null"], [undefined, "undefined"], ["", "empty string"], ["   ", "whitespace"]];
for (const [v, label] of empties) {
  const [a, o] = agencyParts(v);
  ok(a === "" && o === "", `${label} → ['', '']`, `got ['${a}','${o}']`);
}
const [a1, o1] = agencyParts("DEFENSE LOGISTICS AGENCY");
ok(a1 === "DEFENSE LOGISTICS AGENCY" && o1 === "", `single segment stays the department, office empty`);
// Only the FIRST separator splits — a three-segment value keeps the tail intact
// rather than silently dropping it.
const [a2, o2] = agencyParts("A · B · C");
ok(a2 === "A" && o2 === "B · C", `only the first separator splits; the tail is preserved`, `${a2} | ${o2}`);

// ═══ B4 · planted positives ══════════════════════════════════════════════════
console.log("\nB4 · planted positives — this gate must be able to fail");
// P1 · split(' · ')[1] on a three-segment value DROPS the tail. Catch it.
const naive = (s: string) => { const p = s.split(" · "); return [p[0] || "", p[1] || ""] as [string, string]; };
const [, naiveTail] = naive("A · B · C");
ok(naiveTail !== "B · C", `P1 a naive split drops the tail, and differs from the shipped one`, `naive gave "${naiveTail}"`);
// P2 · splitting on a bare dot would shred "HOMELAND SECURITY, DEPARTMENT OF".
const dotSplit = "HOMELAND SECURITY, DEPARTMENT OF · US COAST GUARD".split("·")[0].trim();
ok(agencyParts("HOMELAND SECURITY, DEPARTMENT OF · US COAST GUARD")[0] === dotSplit,
   `P2 the separator is the spaced middle dot, not a bare dot`);
// P3 · a value with no separator must NOT become an office.
ok(agencyParts("DEPT OF DEFENSE")[1] === "", `P3 a lone value never lands in the office slot`);

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
