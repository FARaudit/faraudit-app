// Unit tests for audit-display helpers. Run: npx tsx src/lib/audit-display.test.ts
// Locks in the auditDisplayName fallback chain and the displaySolicitationId
// synthetic-ID edge case so future refactors can't silently re-introduce
// UUID/hex/pdf-timestamp leaks across Pipeline / Recent Audits / Past Audits.

import { auditDisplayName, auditHref, displaySolicitationId, isV2Finalizing, shouldGateExport } from "./audit-display";

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
    expected: "Untitled audit" },
  // FA-186 — upload filename titles cleaned; SAM titles untouched.
  { label: "T14 · Upload filename title collapses to clean solicitation number",
    input: { title: "2. AOCSSB26R0039 - Solicitation", notice_id: "pdf-1781665187652", solicitation_number: "AOCSSB26R0039" },
    expected: "AOCSSB26R0039" },
  { label: "T15 · Upload enumeration + suffix stripped (different sol)",
    input: { title: "1. HM047626R0039 - Solicitation", notice_id: "pdf-1778078628046", solicitation_number: "HM047626R0039" },
    expected: "HM047626R0039" },
  { label: "T16 · Upload with a descriptive filename keeps the subject (not collapsed)",
    input: { title: "Aircraft Maintenance Services", notice_id: "pdf-1778078628046", solicitation_number: "FA301626Q0068" },
    expected: "Aircraft Maintenance Services" },
  { label: "T17 · NON-upload (SAM) title is never filename-cleaned",
    input: { title: "Roof Replacement - RFQ 2024", notice_id: "7e13f96a69c04c10ba8a0fd004e9ac1b", solicitation_number: "W912XX24Q0001" },
    expected: "Roof Replacement - RFQ 2024" }
];

const displaySolCases: Case[] = [
  { label: "T11 · displaySolicitationId all-synthetic returns '—'",
    input: { notice_id: "7e13f96a69c04c10ba8a0fd004e9ac1b", title: null, solicitation_number: null },
    expected: "—" },
  { label: "T12 · displaySolicitationId real solicitation_number wins",
    input: { solicitation_number: "FA301626Q0068" },
    expected: "FA301626Q0068" },
  // T13 locks in the runtime contract that CalendarRow (which has no
  // solicitation_number field at all) flows through the helper cleanly:
  // missing field → undefined → priority chain skips the sn step → falls
  // through to notice_id. Without this test, a future refactor making
  // solicitation_number REQUIRED on AuditLike could silently break the
  // calendar without tsc complaining.
  { label: "T13 · row without solicitation_number field falls through to notice_id",
    input: { title: null, notice_id: "FA301626Q0068", created_at: null },
    expected: "FA301626Q0068" }
];

let pass = 0; let fail = 0;
const run = (label: string, got: string, expected: string | RegExp) => {
  const ok = expected instanceof RegExp ? expected.test(got) : got === expected;
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}`);
  if (!ok) console.log(`        expected: ${expected instanceof RegExp ? expected.toString() : JSON.stringify(expected)} · got: ${JSON.stringify(got)}`);
};

// auditHref locks in slug-preference: solicitation_number lowercased wins;
// missing or blank sol# falls through to UUID id. Future regressions on the
// /audit/[id] slug route would let internal UUIDs leak back into share URLs.
const auditHrefCases: Case[] = [
  { label: "T14 · auditHref lowercases solicitation_number slug",
    input: { id: "abc-uuid", solicitation_number: "FA301626Q0068" },
    expected: "/audit/fa301626q0068" },
  { label: "T15 · auditHref falls back to UUID when sol# null",
    input: { id: "11111111-2222-3333-4444-555555555555", solicitation_number: null },
    expected: "/audit/11111111-2222-3333-4444-555555555555" },
  { label: "T16 · auditHref falls back to UUID when sol# is blank string",
    input: { id: "abc", solicitation_number: "  " },
    expected: "/audit/abc" },
  { label: "T17 · auditHref rejects PSC-leak sol# (3990--COMPACT TRACK LOADER)",
    input: { id: "abc", solicitation_number: "3990--COMPACT TRACK LOADER, FULLY ENCLOSED CAB" },
    expected: "/audit/abc" },
  { label: "T18 · auditHref rejects whitespace-containing sol# (descriptive title leak)",
    input: { id: "abc", solicitation_number: "Some Description Title" },
    expected: "/audit/abc" }
];

// Lock in PSC-leak rejection at the display layer too — existing rows in DB
// that pre-date the sanitizer carry leaks; render-time must still produce
// clean output via fallback chain.
const pscLeakDisplayCases: Case[] = [
  { label: "T19 · displaySolicitationId rejects 3990-- PSC leak, falls to notice_id",
    input: { solicitation_number: "3990--COMPACT TRACK LOADER, 12-15K LB", notice_id: "FA301626Q0068" },
    expected: "FA301626Q0068" },
  { label: "T20 · displaySolicitationId rejects long descriptive sol#, falls to notice_id",
    input: { solicitation_number: "VERY LONG DESCRIPTIVE STRING THAT IS NOT A SOL NUMBER", notice_id: "FA301626Q0068" },
    expected: "FA301626Q0068" },
  { label: "T21 · auditDisplayName rejects PSC-leak sol#, falls to notice_id",
    input: { title: null, solicitation_number: "3990--COMPACT TRACK LOADER", notice_id: "FA301626Q0068" },
    expected: "FA301626Q0068" }
];

console.log("── auditDisplayName ──");
for (const c of auditDisplayNameCases) run(c.label, auditDisplayName(c.input), c.expected);
console.log("\n── displaySolicitationId ──");
for (const c of displaySolCases) run(c.label, displaySolicitationId(c.input), c.expected);
console.log("\n── auditHref ──");
for (const c of auditHrefCases) run(c.label, auditHref(c.input), c.expected);
console.log("\n── PSC-leak rejection ──");
for (const c of pscLeakDisplayCases) {
  if (c.label.startsWith("T21")) run(c.label, auditDisplayName(c.input), c.expected);
  else run(c.label, displaySolicitationId(c.input), c.expected);
}

// FIX 5 — export-gate state machine, two SEPARATE questions:
//   shouldGateExport → is the report INCOMPLETE? (greyed/409 until 100% done)
//   isV2Finalizing   → is a V2 run genuinely LIVE? (drives spinner + refresh)
const runBool = (label: string, got: boolean, expected: boolean) => {
  const ok = got === expected;
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}`);
  if (!ok) console.log(`        expected: ${expected} · got: ${got}`);
};
const nowIso = new Date().toISOString();
const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
const complete = { compliance_json: { v2_shadow: { x: 1 }, analysis_phase: "done" } };
const errored = { compliance_json: { v2_error: "timeout", analysis_phase: "done" }, completed_at: nowIso };
const live = { compliance_json: { analysis_phase: "finalizing" }, completed_at: nowIso };
const stalled = { compliance_json: { analysis_phase: "finalizing" }, completed_at: tenMinAgo };
const noV2 = { compliance_json: { analysis_phase: "done" } };

console.log("\n── FIX 5 · export gate (shouldGateExport) — greyed until 100% complete ──");
// Export opens ONLY on a genuinely complete report (deep layer landed) or a
// plain no-V2 report; every incomplete state stays gated.
runBool("T22 · complete (v2_shadow) → export OPEN", shouldGateExport(complete), false);
runBool("T23 · errored (v2_error, no shadow) → export GATED", shouldGateExport(errored), true);
runBool("T24 · live finalizing → export GATED", shouldGateExport(live), true);
runBool("T25 · STALLED past backstop (no shadow) → export GATED (the closed gap)", shouldGateExport(stalled), true);
runBool("T26 · plain V1 done (no V2 arm) → export OPEN", shouldGateExport(noV2), false);

// AGENTIC V3 — the graduated engine owns the report; its completeness axis is
// honest_fail + documents_complete (analysis_phase is always "done"). Gate on
// BOTH (CEO 2026-06-28). These rows carry engine:"agentic_v3" so they take the
// new branch and never the V1 finalizing rules.
const v3Clean = { compliance_json: { engine: "agentic_v3", analysis_phase: "done", honest_fail: false, documents_complete: true } };
const v3HonestFail = { compliance_json: { engine: "agentic_v3", analysis_phase: "done", honest_fail: true, documents_complete: true } };
const v3PartialDocs = { compliance_json: { engine: "agentic_v3", analysis_phase: "done", honest_fail: false, documents_complete: false } };
const v3Both = { compliance_json: { engine: "agentic_v3", analysis_phase: "done", honest_fail: true, documents_complete: false } };
runBool("T32 · agentic grounded + complete docs → export OPEN", shouldGateExport(v3Clean), false);
runBool("T33 · agentic honest_fail (INCOMPLETE/NHR) → export GATED", shouldGateExport(v3HonestFail), true);
runBool("T34 · agentic incomplete documents → export GATED", shouldGateExport(v3PartialDocs), true);
runBool("T35 · agentic honest_fail AND incomplete docs → export GATED", shouldGateExport(v3Both), true);

console.log("\n── FIX 5 · live spinner (isV2Finalizing) — only while genuinely in flight ──");
runBool("T27 · complete → not live (no spinner)", isV2Finalizing(complete), false);
runBool("T28 · errored → not live (no infinite spinner)", isV2Finalizing(errored), false);
runBool("T29 · live finalizing in window → LIVE (spinner+refresh)", isV2Finalizing(live), true);
runBool("T30 · stalled past backstop → not live (no infinite spinner)", isV2Finalizing(stalled), false);
runBool("T31 · plain V1 done → not live", isV2Finalizing(noV2), false);

console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
