// CANONICAL PAID-RUN ENTRY (Brain card 197 Part 2). The reusable successor to the one-shot card191-paid-run.ts:
// run the live agentic engine over a source file and — CRUCIALLY — AUTO-PERSIST a complete, replayable run
// record so the NEXT paid divergence is diagnosable at $0 (npx tsx scripts/audit-ai/replay-run-record.ts).
// The record captures run-env flags, models, the full findings array, the section manifest +
// formatDetected/procurementPart, coverage inputs/outputs (obligations, grounding per section, coreMissing),
// and the terminal verdict + eligibility + billable decision. This is the wire-in "behind the run path":
// every future paid run invoked through here persists automatically.
//
//   npx tsx scripts/audit-ai/paid-run.ts <source.txt> [sol-label] --confirm-paid
//
// PAID. Requires --confirm-paid to spend. NO retry on divergence (Rule 68) — assert, capture, exit.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import fs from "fs";
import type { UsageCall } from "./cost-ledger";

const DETERMINISTIC_FLAGS = [
  "AUDIT_PROCUREMENT_TYPE_SECTIONS", "AUDIT_SECTION_M_DEPTH", "AUDIT_SETASIDE_OVERTYPE_GUARD",
  "AUDIT_HONESTFAIL_NO_CHARGE", "AUDIT_PERSONA_DIVERSITY", "AUDIT_TEMPORAL_CONFLICT",
  "AUDIT_UCF_UPPERCASE_GUARD", "AUDIT_ELIGIBLE_TRISTATE",
];

async function main() {
  const srcPath = process.argv[2];
  const solLabel = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : undefined;
  const confirmed = process.argv.includes("--confirm-paid");
  if (!srcPath) { console.error("usage: npx tsx scripts/audit-ai/paid-run.ts <source.txt> [sol-label] --confirm-paid"); process.exit(2); }
  if (!confirmed) { console.error("❌ refusing to spend — pass --confirm-paid to run the live PAID engine."); process.exit(2); }
  if (!fs.existsSync(srcPath)) { console.error(`❌ source not found: ${srcPath}`); process.exit(2); }

  const { auditPackage } = await import("../../src/lib/audit-package");
  const { isHonestFail, billable, HONEST_FAIL_VERDICTS } = await import("../../src/lib/audit-billing");
  const { setExpertUsageSink } = await import("../../src/lib/audit-expert");
  const { setStructuredUsageSink } = await import("../../src/lib/anthropic-structured");
  const { modelFor } = await import("../../src/lib/model-registry");
  const { aggregate, appendLedgerRow } = await import("./cost-ledger");
  const { buildRunRecord } = await import("../../src/lib/audit-run-record");
  const { persistRunRecord } = await import("./run-record-io");

  const usageCalls: UsageCall[] = [];
  setExpertUsageSink((u) => usageCalls.push(u));
  setStructuredUsageSink((u) => usageCalls.push(u));

  const flags: Record<string, string | undefined> = {};
  for (const f of DETERMINISTIC_FLAGS) flags[f] = process.env[f];
  const sol = solLabel ?? srcPath.split("/").pop()!.replace(/\.[^.]+$/, "");
  const src = fs.readFileSync(srcPath, "utf8");
  const startedAt = new Date().toISOString();
  console.log(`source: ${srcPath} (${src.length} bytes) · sol: ${sol}`);
  console.log("run-env deterministic flags →", flags);

  const signal = AbortSignal.timeout(6 * 60 * 1000); // wall-clock guard; abort → run fails → STOP
  const t0 = Date.now();
  console.log("▶ launching auditPackage (PAID)…");
  const res = await auditPackage({ fullSource: src, bidderProfile: null, naics: null, setAside: null, signal });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  const verdict = res.decision.verdict;
  const eligible = res.decision.eligible;
  const honestFail = isHonestFail({ verdict });
  const noChargeOn = process.env.AUDIT_HONESTFAIL_NO_CHARGE === "true";
  const bill = billable(honestFail, noChargeOn);

  setExpertUsageSink(null); setStructuredUsageSink(null);
  const { perModel, totals } = aggregate(usageCalls);

  // Cost ledger (source=code → R&D, not COGS) — same sink the cost cockpit reads.
  const ledRow = {
    id: `paid-run-${sol}-${Date.now()}`,
    ts: startedAt, source: "code" as const, cogs: false, sol,
    verdict, eligible, billable: bill, perModel, totals, console_usd: null as number | null,
    note: `paid-run.ts. wallClock ${secs}s. Token-derived $${totals.usd.toFixed(4)} (${totals.calls} calls${totals.unpriced_calls ? `, ${totals.unpriced_calls} UNPRICED` : ""}).`,
  };
  appendLedgerRow(ledRow);

  // AUTO-PERSIST the replayable run record — the whole point of this entry.
  const rec = buildRunRecord({
    meta: {
      runId: ledRow.id, startedAt, wallClockSec: Number(secs), flags,
      models: { lens: modelFor("lens"), judge: modelFor("judge") }, sol,
      note: `${totals.calls} calls, token-derived $${totals.usd.toFixed(4)}`,
    },
    input: { fullSource: src, bidderProfile: null, naics: null, setAside: null, manifestComplete: null },
    result: res,
    billing: { honestFail, billable: bill },
    commercialHonestFail: process.env.AUDIT_PROCUREMENT_TYPE_SECTIONS === "true",
  });
  const recPath = persistRunRecord(rec);

  console.log("\n──────── RESULT ────────");
  console.log(JSON.stringify({
    verdict, eligible, honestFail, billable: bill, honestFailVerdictSet: [...HONEST_FAIL_VERDICTS],
    coverageComplete: res.inputs?.coverageComplete, conflict: res.conflict,
    findings: res.findings?.length, sectionsRead: res.sectionsRead, reason: res.decision.reason, wallClockSecs: Number(secs),
  }, null, 2));
  console.log(`\n[LEDGER] appended ${ledRow.id} · ${totals.calls} calls · token-derived $${totals.usd.toFixed(4)}`);
  console.log(`[RUN-RECORD] persisted → ${recPath}`);
  console.log(`   diagnose at $0:  npx tsx scripts/audit-ai/replay-run-record.ts ${recPath}`);
  process.exit(0);
}

main().catch((e) => { console.error("❌ RUN ERROR (STOP, no retry):", e?.message || e); process.exit(1); });
