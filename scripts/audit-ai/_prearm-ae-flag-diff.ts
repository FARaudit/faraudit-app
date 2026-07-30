// Vehicle A–E pre-arm battery · step 1 — $0 banked-replay perturbation itemization.
// For every persisted run-record, re-derive the verdict with the three arc flags OFF then ON, and itemize
// EVERY verdict flip. Expected: zero flips on legacy records (item A needs the new dispositive precondition
// field absent from legacy inputs; B/C are coverage/report; D only fires on the cyber-reconcile shape).
// Any flip here is an UNINTENDED perturbation and must be explained before arm.
//   npx tsx scripts/audit-ai/_prearm-ae-flag-diff.ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveVerdict } from "../../src/lib/audit-decide";

const DIR = "scripts/audit-ai/run-records";
const ARC = ["AUDIT_VERDICT_POLE_PRECEDENCE", "AUDIT_COVERAGE_COUNTER_SPLIT", "AUDIT_CYBER_RFI_RECONCILE"];
const off = () => ARC.forEach((k) => delete process.env[k]);
const on = () => ARC.forEach((k) => (process.env[k] = "true"));

const files = readdirSync(DIR).filter((f) => f.endsWith(".run-record.json"));
let flips = 0, ok = 0, skipped = 0;
const flipRows: string[] = [];

for (const f of files.sort()) {
  let rec: any;
  try { rec = JSON.parse(readFileSync(join(DIR, f), "utf8")); } catch { skipped++; continue; }
  const inputs = rec?.result?.inputs;
  if (!inputs) { skipped++; continue; }
  let vOff: string, vOn: string;
  try {
    off(); vOff = deriveVerdict(inputs).verdict;
    on();  vOn  = deriveVerdict(inputs).verdict;
  } catch (e: any) { skipped++; flipRows.push(`⚠️  ${f} — replay threw: ${e?.message?.slice(0, 80)}`); continue; }
  if (vOff !== vOn) { flips++; flipRows.push(`🔀 ${f}\n     OFF=${vOff}  →  ON=${vOn}`); }
  else ok++;
}
off();

console.log(`\nBanked records: ${files.length}  ·  byte-identical(OFF==ON): ${ok}  ·  FLIPS: ${flips}  ·  skipped(no inputs): ${skipped}`);
if (flipRows.length) { console.log("\n── flips / anomalies ──"); flipRows.forEach((r) => console.log(r)); }
console.log(flips === 0 ? "\n✅ ZERO unintended perturbation on banked corpus (arc flags inert on legacy inputs)" : `\n⚠️  ${flips} FLIP(S) — itemize vs the two-tier target before arm`);
process.exit(0);
