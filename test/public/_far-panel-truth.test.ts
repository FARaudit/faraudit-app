// /far-dfars-updates must not state numbers or reasons it never computed.
//
// Run: npx tsx test/public/_far-panel-truth.test.ts
//
// Written RED against the pre-fix files (2026-08-03), from three defects found by
// reading the LIVE page while the feed was healthy and returning 40 rows:
//
//  1. "14 updates this month" was a LITERAL in far-dfars-updates.html. It matched no
//     query and no timeframe; the chart under it showed FAR 28 + DFARS 12 = 40.
//  2. The header stat was labelled "This Month" but assigned D.UPDATES.length — the
//     whole feed, spanning Aug 2025 to Aug 2026. A timeframe it never computed.
//  3. "Effective ≤30d" read 0, always. Nothing populated FARD.EFFECTIVE — the live
//     wiring only ever CLEARED it — so the number was structurally incapable of
//     moving while presenting as a computed enforcement risk. Its panel then fell
//     through to the feed-wide empty state and told the reader "The feeds returned no
//     published changes for this view" while 40 changes were on screen.
//
// Part C runs the real buildEffective over transcribed live rows; Part D plants known
// bad inputs so no probe can pass vacuously.
export {};
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let pass = 0; let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : "  — " + detail}`);
};

const PUBLIC = join(import.meta.dirname ?? __dirname, "..", "..", "public");
const html = readFileSync(join(PUBLIC, "far-dfars-updates.html"), "utf8");
const app = readFileSync(join(PUBLIC, "far-app.js"), "utf8");
const live = readFileSync(join(PUBLIC, "far-dfars-updates-live.js"), "utf8");

/** Brace-balanced extraction of a `function NAME(...) { ... }` declaration. */
function extractFn(src: string, name: string): string {
  const start = src.search(new RegExp(`function\\s+${name}\\s*\\(`));
  if (start < 0) throw new Error(`${name} not found`);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

// ── Part A · no asserted-but-uncomputed number is hardcoded in the markup ───────
console.log("── Part A · the markup states no number it did not compute ──");

// The exact literal that shipped, and the general shape of it.
check("A1 · no literal '<n> updates this month' in the html",
  !/\b\d+\s+updates?\s+this\s+month\b/i.test(html), "a hardcoded month count is present");

// The subtitle must be a slot the script fills, not prose.
check("A2 · the by-type subtitle is a script-filled slot", /id="bytSub"/.test(html), "no #bytSub element to populate");
check("A3 · far-app.js populates that slot", /bytSub/.test(app), "far-app.js never writes #bytSub");

// A label promising a timeframe must not sit on a total. hsTotal is assigned
// D.UPDATES.length, so its label must not claim a period.
const hsTotalLabel = html.match(/id="hsTotal"[^<]*<\/span>\s*<span class="l">([^<]*)</)?.[1] ?? "";
check(`A4 · hsTotal label ("${hsTotalLabel}") claims no timeframe`,
  !/month|week|today|day/i.test(hsTotalLabel),
  "the label promises a period but the value is the whole feed");
check("A5 · hsTotal is still fed the feed total", /hsTotal'\)\.textContent\s*=\s*num\(D\.UPDATES\.length\)/.test(app));

// ── Part B · a panel with an empty slice must not report on the FEED ────────────
console.log("\n── Part B · empty panel states its OWN reason ──");
check("B1 · the effective-dates panel has a panel-scoped empty state",
  /No upcoming effective dates/.test(app),
  "it still falls straight through to the feed-wide blankReason()");
check("B2 · that state is gated on the feed being healthy AND non-empty",
  /D\.UPDATES\.length\s*&&\s*!isDown\(\)\s*&&\s*!isPending\(\)\s*&&\s*!isPartial\(\)/.test(app),
  "an outage would be reported as 'no upcoming effective dates'");

// ── Part C · buildEffective actually computes, over real rows ───────────────────
console.log("\n── Part C · buildEffective runs over transcribed live rows ──");
check("C0 · the live wiring populates EFFECTIVE, not just clears it",
  /FARD\.EFFECTIVE\.push\.apply/.test(live), "EFFECTIVE is still write-only-empty");

async function main(): Promise<void> {
  const modPath = join(tmpdir(), `far-effective-${process.pid}.mjs`);
  writeFileSync(modPath, `${extractFn(live, "buildEffective")}\nexport { buildEffective };\n`, "utf8");
  let buildEffective: (rows: unknown[]) => Array<{ days: number; tone: string; name: string; clause: string }>;
  try {
    ({ buildEffective } = (await import(`file://${modPath}`)) as never);
  } finally {
    rmSync(modPath, { force: true });
  }

  const day = 86400000;
  const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString().slice(0, 10);

  // Shapes transcribed from the live /api/regulatory-updates payload.
  const rows = [
    { title: "Past rule", effective_date: iso(-30), clause: "FAR 52.204-21", affects_clauses: [] },
    { title: "In 3 days", effective_date: iso(3), clause: null, affects_clauses: ["DFARS 252.204-7012"] },
    { title: "In 20 days", effective_date: iso(20), clause: null, affects_clauses: [] },
    { title: "In 200 days", effective_date: iso(200), clause: null, affects_clauses: [] },
    { title: "No date (proposed rule)", effective_date: null, clause: null, affects_clauses: [] },
  ];
  const out = buildEffective(rows);

  check(`C1 · past + undated rows are dropped (${out.length} of 5 kept)`, out.length === 3, JSON.stringify(out.map((o) => o.name)));
  check("C2 · sorted soonest first", out[0].days <= out[1].days && out[1].days <= out[2].days);
  check("C3 · ≤7 days is red", out[0].tone === "red", `got ${out[0].tone}`);
  check("C4 · 8–30 days is amber", out[1].tone === "amber", `got ${out[1].tone}`);
  check("C5 · beyond 30 days is neither red nor amber", out[2].tone === "green", `got ${out[2].tone}`);
  check("C6 · the ≤30d count is now derivable and non-zero", out.filter((e) => e.days <= 30).length === 2);
  check("C7 · clause falls back to affects_clauses[0]", out[0].clause === "DFARS 252.204-7012", out[0].clause);

  // ── Part D · planted bad inputs ───────────────────────────────────────────────
  console.log("\n── Part D · planted inputs (no invented deadlines) ──");
  check("D1 · a row with no effective_date invents no deadline",
    buildEffective([{ title: "x", effective_date: null }]).length === 0);
  check("D2 · an unparseable date is dropped, not defaulted to today",
    buildEffective([{ title: "x", effective_date: "not-a-date" }]).length === 0);
  check("D3 · empty input yields empty output", buildEffective([]).length === 0);
  check("D4 · undefined input does not throw", buildEffective(undefined as never).length === 0);
  // NEGATIVE control: a genuinely upcoming date MUST survive, or C1 passes for the
  // trivial reason that the function drops everything.
  check("D5 · a real upcoming date is KEPT", buildEffective([{ title: "x", effective_date: iso(10) }]).length === 1);

  console.log(`\n${pass} passed · ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => { console.error("✗ FAIL  gate threw:", err); process.exit(1); });
