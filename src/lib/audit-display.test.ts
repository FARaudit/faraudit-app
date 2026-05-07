// Unit tests for audit-display helpers. Run: npx tsx src/lib/audit-display.test.ts
// Locks in the auditDisplayName fallback chain and the displaySolicitationId
// synthetic-ID edge case so future refactors can't silently re-introduce
// UUID/hex/pdf-timestamp leaks across Pipeline / Recent Audits / Past Audits.

import { auditDisplayName, displaySolicitationId } from "./audit-display";

interface Case<T = string | RegExp> { label: string; input: any; expected: T }

const auditDisplayNameCases: Case[] = [
  { label: "T1 · Real title returns title",
    input: { title: "Replace Roof of Visitor Center" },
    expected: "Replace Roof of Visitor Center" },
  { label: "T2 · Stranded title falls through to bare 'Untitled audit' (no created_at)",
    input: { title: "Stranded notice 7e13f96a69c04c10ba8a0fd004e9ac1b" },
    expected: "Untitled audit" },
  { label: "T3 · Synthetic pdf-timestamp title falls through",
    input: { title: "pdf-1778078628046" },
    expected: "Untitled audit" },
  { label: "T4 · Bare hex title falls through",
    input: { title: "7e13f96a69c04c10ba8a0fd004e9ac1b" },
    expected: "Untitled audit" },
  { label: "T5 · Solicitation number wins when no clean title",
    input: { title: null, solicitation_number: "FA301626Q0068" },
    expected: "FA301626Q0068" },
  { label: "T6 · Clean notice_id wins when no title + no sol#",
    input: { title: null, notice_id: "FA301626Q0068" },
    expected: "FA301626Q0068" },
  { label: "T7 · Synthetic notice_id falls through (no created_at)",
    input: { title: null, notice_id: "pdf-1778078628046" },
    expected: "Untitled audit" },
  { label: "T8 · Hex notice_id falls through (no created_at)",
    input: { title: null, notice_id: "7e13f96a69c04c10ba8a0fd004e9ac1b" },
    expected: "Untitled audit" },
  { label: "T9 · Created_at present produces humanized timestamp",
    input: { title: null, notice_id: null, created_at: "2026-05-07T17:32:00Z" },
    // Allow optional comma after day, regular space or non-breaking space
    // before AM/PM (Intl in modern Node uses U+202F NARROW NO-BREAK SPACE).
    expected: /^Untitled audit · [A-Z][a-z]{2,} \d+,? \d+:\d{2}[\s  ]?(AM|PM)$/ },
  { label: "T10 · All null falls to bare 'Untitled audit'",
    input: { title: null, notice_id: null, solicitation_number: null, created_at: null },
    expected: "Untitled audit" }
];

const displaySolCases: Case[] = [
  { label: "T11 · displaySolicitationId all-synthetic returns '—'",
    input: { notice_id: "7e13f96a69c04c10ba8a0fd004e9ac1b", title: null, solicitation_number: null },
    expected: "—" },
  { label: "T12 · displaySolicitationId real solicitation_number wins",
    input: { solicitation_number: "FA301626Q0068" },
    expected: "FA301626Q0068" }
];

let pass = 0; let fail = 0;
const run = (label: string, got: string, expected: string | RegExp) => {
  const ok = expected instanceof RegExp ? expected.test(got) : got === expected;
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}`);
  if (!ok) console.log(`        expected: ${expected instanceof RegExp ? expected.toString() : JSON.stringify(expected)} · got: ${JSON.stringify(got)}`);
};

console.log("── auditDisplayName ──");
for (const c of auditDisplayNameCases) run(c.label, auditDisplayName(c.input), c.expected);
console.log("\n── displaySolicitationId ──");
for (const c of displaySolCases) run(c.label, displaySolicitationId(c.input), c.expected);

console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
