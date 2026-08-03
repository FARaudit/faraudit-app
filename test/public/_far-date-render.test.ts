// far-app.js must never render "Invalid Date" to a customer.
//
// Run: npx tsx test/public/_far-date-render.test.ts
//
// Written RED against the pre-fix file (2026-08-03). Found by DRIVING the live page
// after /api/regulatory-updates started returning real Federal Register rows: 22 of
// 40 cards on /far-dfars-updates displayed the literal string "Invalid Date".
//
// The formatter was `new Date(s + 'T00:00:00')`, which assumes s is a bare
// 'YYYY-MM-DD'. The route emits two different shapes:
//   effective_date  '2026-08-07'                 <- bare, from effective_on
//   published_at    '2026-07-02T00:00:00.000Z'   <- full ISO, from toISOString()
// and the renderer falls back to published_at whenever effective_date is null — true
// for every proposed rule, which is most of them. Concatenating gives
// '2026-07-02T00:00:00.000ZT00:00:00' -> Invalid Date.
//
// This gate does NOT read the source and pattern-match for the old expression. It
// EXTRACTS the live fmtDate and RUNS it, so any future rewrite is judged on behaviour.
// Part C plants the original implementation and requires it to fail.
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
const src = readFileSync(join(PUBLIC, "far-app.js"), "utf8");

/** Pull the fmtDate declaration out of the IIFE, brace-balanced so a multi-line body
 *  is captured whole. A `[^}]*` scan stops at the first inner brace and yields a
 *  syntactically incomplete function — which would read as a gate failure for the
 *  wrong reason. */
function extract(name: string): string {
  const start = src.search(new RegExp(`const\\s+${name}\\s*=`));
  if (start < 0) throw new Error(`${name} not found in far-app.js`);
  let i = src.indexOf("=>", start);
  if (i < 0) throw new Error(`${name} is not an arrow function`);
  i += 2;
  while (/\s/.test(src[i])) i++;
  if (src[i] !== "{") {
    let d = 0; const s0 = i;
    for (; i < src.length; i++) {
      const c = src[i];
      if ("({[".includes(c)) d++;
      else if (")}]".includes(c)) d--;
      else if (c === ";" && d === 0) break;
    }
    return `(s) => (${src.slice(s0, i)})`;
  }
  let depth = 0; const bodyStart = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { i++; break; } }
  }
  return `(s) => ${src.slice(bodyStart, i)}`;
}

async function main(): Promise<void> {
  // Load the REAL function by writing it to a module and importing it — no string
  // evaluation, and it fails loudly if the extracted text is not valid JS.
  const modPath = join(tmpdir(), `far-fmtdate-${process.pid}.mjs`);
  writeFileSync(modPath, `export const fmtDate = ${extract("fmtDate")};\n`, "utf8");
  let fmtDate: (s: unknown) => string;
  try {
    ({ fmtDate } = (await import(`file://${modPath}`)) as { fmtDate: (s: unknown) => string });
  } finally {
    rmSync(modPath, { force: true });
  }

  // ── Part A · both shapes the API actually emits render as real dates ──────────
  console.log("── Part A · fmtDate handles every shape /api/regulatory-updates emits ──");

  // Transcribed from the LIVE payload, not invented: both rows were on the page.
  check("A1 · bare effective_date '2026-08-07'", fmtDate("2026-08-07") === "Aug 7, 2026", `got "${fmtDate("2026-08-07")}"`);
  check("A2 · full ISO published_at '2026-07-02T00:00:00.000Z'",
    fmtDate("2026-07-02T00:00:00.000Z") === "Jul 2, 2026", `got "${fmtDate("2026-07-02T00:00:00.000Z")}"`);

  // No off-by-one: the ISO instant is UTC midnight, and the bare form of the same day
  // must render the SAME day, not the one before it.
  check("A3 · ISO and bare form of one day agree",
    fmtDate("2026-07-02T00:00:00.000Z") === fmtDate("2026-07-02"),
    `${fmtDate("2026-07-02T00:00:00.000Z")} vs ${fmtDate("2026-07-02")}`);

  // ── Part B · unusable input degrades to a dash, never to "Invalid Date" ───────
  console.log("\n── Part B · no customer-visible 'Invalid Date' for any input ──");
  const JUNK: unknown[] = ["", null, undefined, "not-a-date", "0000-00-00", 12345, {}, []];
  for (const v of JUNK) {
    const out = fmtDate(v);
    check(`B · ${v === undefined ? "undefined" : JSON.stringify(v)} -> "${out}"`, !/invalid/i.test(out), `rendered "${out}"`);
  }

  // ── Part C · planted positive: the ORIGINAL implementation must FAIL ──────────
  // Without this, a gate that merely passes proves nothing about what it would catch.
  console.log("\n── Part C · planted original implementation (must fail) ──");
  const ORIGINAL = (s: string) => {
    const d = new Date(s + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };
  check("C1 · original DOES render 'Invalid Date' on a full ISO string",
    /invalid/i.test(ORIGINAL("2026-07-02T00:00:00.000Z")),
    "the planted original did not reproduce the defect — this gate is not testing what it claims");
  check("C2 · original DOES pass on a bare date (so the fix is not a no-op)",
    ORIGINAL("2026-08-07") === "Aug 7, 2026");
  check("C3 · current implementation differs from the original on the ISO shape",
    fmtDate("2026-07-02T00:00:00.000Z") !== ORIGINAL("2026-07-02T00:00:00.000Z"));

  console.log(`\n${pass} passed · ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => { console.error("✗ FAIL  gate threw:", err); process.exit(1); });
