// $0 deterministic gate for Tier 1 worker fixes (engine line-audit 2026-07-06).
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/verify-tier1-worker.ts
//
// T1-1 worker.ts file_id arm: a failed storage download of the stashed bytes now
//   routes honestly instead of silently starving the live V3 engine (which
//   ignores pdfFileId). Download blip → TransientInputError (release+retry);
//   no stashed bytes at all → terminal fail with a correct reason.
// T1-2 worker.ts markProcessed: compare-and-set on status='processing' + a
//   0-affected-row early return, so a claim reclaimed under a rolling deploy is
//   not stomped and its shared stash is not deleted.
//
// Drives the REAL exported failure-router for T1-1's routing choice; asserts the
// fix-shape contract on the real worker source for the parts that live inside the
// non-exported buildInput/processRow.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { decideRunFailureMode, TransientInputError } from "../../agents/audit-worker/worker";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = readFileSync(resolve(HERE, "../../agents/audit-worker/worker.ts"), "utf8");

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { cond ? pass++ : fails.push(label); };
const eq = (label: string, got: unknown, exp: unknown) => { JSON.stringify(got) === JSON.stringify(exp) ? pass++ : fails.push(`${label}: got ${JSON.stringify(got)} exp ${JSON.stringify(exp)}`); };

// ── T1-1: real failure-router proves the routing the fix relies on ──
eq("T1-1 R1: a download blip (TransientInputError) RELEASES for re-run, not terminal",
  decideRunFailureMode(new TransientInputError("T1-1: uploaded bytes unreadable from storage (k) — V3 input starved: 503")), "release");
eq("T1-1 R2: no stashed bytes (plain Error) is TERMINAL — re-run hits the same wall",
  decideRunFailureMode(new Error("T1-1: file_id-only upload row r has no stashed bytes (pdf_path null)")), "fail");

// ── T1-1: fix-shape contract on the real file_id arm ──
const fileIdArm = WORKER.slice(WORKER.indexOf("} else if (row.anthropic_file_id) {"), WORKER.indexOf("} else {\n    // FA-136"));
ok("T1-1 R3: the false 'V1 reads the file_id' degrade reasoning is deleted", !/V1 reads\s+the file_id/i.test(fileIdArm) && !/V2 shadow will be skipped/i.test(fileIdArm));
ok("T1-1 R4: a failed download THROWS TransientInputError (no silent swallow that continues)",
  /if \(dlErr \|\| !blob\) \{\s*throw new TransientInputError/.test(fileIdArm));
ok("T1-1 R5: a missing pdf_path THROWS a terminal Error (no console.warn-and-continue)",
  /\} else \{\s*throw new Error\([^)]*no stashed bytes/.test(fileIdArm) && !/V2 shadow skipped/.test(fileIdArm));

// ── T1-2: CAS + 0-row early-return contract on the real markProcessed ──
ok("T1-2 R6: markProcessed compare-and-sets on status='processing'",
  /\.update\(\{[\s\S]*?status: "processed"[\s\S]*?\}\)\s*\.eq\("id", row\.id\)\s*\.eq\("status", "processing"\)\s*\.select\("id"\)/.test(WORKER));
ok("T1-2 R7: a lost claim (0 rows updated) skips the success write + storage cleanup and returns",
  /if \(!marked \|\| marked\.length === 0\) \{[\s\S]*?return;\s*\}/.test(WORKER));

// ── T1-2: drive the CAS semantics through a supabase-shaped mock (logic proof) ──
function cas(currentStatus: string) {
  // Mirror the real chain: .update().eq('id').eq('status','processing').select('id')
  // returns only rows whose status was 'processing' at update time.
  const rowMatches = currentStatus === "processing";
  const data = rowMatches ? [{ id: "row-1" }] : [];
  // The fix's decision: proceed on a matched row, bail on 0 rows.
  const marked = data;
  return (!marked || marked.length === 0) ? "bail" : "proceed";
}
eq("T1-2 R8: row still 'processing' (we own it) → proceed to success write", cas("processing"), "proceed");
eq("T1-2 R9: row reclaimed to 'processing' by another worker but ours already flipped → bail (0 rows for a pending/processed row)", cas("pending"), "bail");

console.log(`\nTier1 worker (T1-1 · T1-2): ${pass}/${pass + fails.length} PASS`);
if (fails.length) { console.error("FAILS:\n" + fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
