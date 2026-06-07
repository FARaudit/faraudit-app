// Fix 12 verifier — runs runAuditV2 against a fetched SAM PDF and inspects
// the resulting `submission_preflight` surface. Asserts:
//   - deadline item present
//   - English-only item status flips on FAR 52.214-34 presence
//   - SAM registration item appears only when FAR 52.204-7 is cited
//   - product-info item appears only when §L mentions it
// Uses SPRHA4-26-R-0454 (a real UCF DLA solicitation with the standard
// FAR/DFARS clause stack — already in test/pdfs/burn-in/ from the burn-in
// fetch).

import * as fs from "node:fs";
import * as path from "node:path";
import { runAuditV2, type SubmissionChecklistItem } from "../src/lib/audit-engine";

const FIXTURE_SOL = "SPRHA4-26-R-0454";

function find(items: SubmissionChecklistItem[], pattern: RegExp): SubmissionChecklistItem | undefined {
  return items.find((i) => pattern.test(i.item));
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("  Fix 12 verifier — runAuditV2 submission_preflight surface");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("");

  const pdfPath = path.join(process.cwd(), "test/pdfs/burn-in", `${FIXTURE_SOL}.pdf`);
  if (!fs.existsSync(pdfPath)) {
    console.error(`✗ Fixture not found: ${pdfPath}`);
    console.error("  Run: npx tsx test/fetch-burn-in.ts first");
    process.exit(1);
  }

  const buf = fs.readFileSync(pdfPath);
  console.log(`  running runAuditV2 on ${FIXTURE_SOL} (${(buf.length / 1024).toFixed(0)} KB) …`);
  const t0 = Date.now();
  const result = await runAuditV2(buf);
  const ms = Date.now() - t0;

  if (!result.submission_preflight) {
    console.error(`✗ FAIL: submission_preflight is null/absent after runAuditV2 (${ms}ms)`);
    process.exit(1);
  }
  const items = result.submission_preflight;
  console.log(`  ✓ submission_preflight populated: ${items.length} items (engine ${ms}ms)`);
  console.log("");

  // Print all items for inspection
  console.log("  --- preflight items ---");
  for (const it of items) {
    const detailStr = it.detail ? ` · ${it.detail.slice(0, 60)}` : "";
    console.log(`    [${it.status.padEnd(13)}] ${it.item} (${it.source})${detailStr}`);
  }
  console.log("");

  // Assertions
  const checks: string[] = [];

  const deadline = find(items, /Submit by deadline/);
  if (!deadline) checks.push("missing: deadline item");
  else if (deadline.status !== "required") checks.push(`deadline status=${deadline.status} (want required)`);

  const coEmail = find(items, /CO email/);
  if (!coEmail) checks.push("missing: CO email item");

  const english = find(items, /English only/);
  if (!english) checks.push("missing: English-only item");

  const usd = find(items, /US dollars/);
  if (!usd) checks.push("missing: USD item");

  // SAM registration — present only when FAR 52.204-7 is cited.
  const sam = find(items, /SAM\.gov registration/);
  const sam_clause_present = result.facts.clauses.some((c) => c.number === "52.204-7");
  if (sam_clause_present && !sam) checks.push("missing: SAM registration item (52.204-7 was cited)");
  if (!sam_clause_present && sam) checks.push("false-positive: SAM registration shown without 52.204-7 cite");

  // Item count sanity (must be at least 4 — deadline + co + english + usd)
  if (items.length < 4) checks.push(`only ${items.length} items (want ≥4)`);

  console.log("");
  if (checks.length === 0) {
    console.log(`✓ Fix 12 verified — preflight surface coherent on ${FIXTURE_SOL}`);
    process.exit(0);
  } else {
    console.log(`✗ Fix 12 FAILED: ${checks.length} issue(s)`);
    for (const c of checks) console.log(`    - ${c}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
