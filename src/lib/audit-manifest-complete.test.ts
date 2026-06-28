// $0 proof for agenticManifestComplete — the verdict-cap completeness signal, including
// the panel BLOCKER fix: a SAM sol whose manifest assembly FAILED (null ingestion) must
// read INCOMPLETE for the verdict, not green BID. Run: npx tsx src/lib/audit-manifest-complete.test.ts
import { agenticManifestComplete } from "./audit-executor-v3";
import type { IngestionMeta } from "./sam-attachments";

const ing = (o: Partial<IngestionMeta>): IngestionMeta => ({ files_total: 0, files_ingested: 0, files: [], form_identified: true, form_name: "primary", ...(o as object) } as unknown as IngestionMeta);

let pass = 0; let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = got === want; if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : `  — got ${got} want ${want}`}`);
};

// truncation always wins → incomplete
eq("T1 · truncated (docs dropped) → incomplete", agenticManifestComplete(null, true, false), false);
eq("T2 · truncated even with a full manifest → incomplete", agenticManifestComplete(ing({ files_total: 3, files_ingested: 3 }), true, true), false);

// manifest present → reconcile counts
eq("T3 · manifest all ingested, no overflow → complete", agenticManifestComplete(ing({ files_total: 5, files_ingested: 5 }), false, true), true);
eq("T4 · manifest short (read 4 of 7) → incomplete", agenticManifestComplete(ing({ files_total: 7, files_ingested: 4 }), false, true), false);
eq("T5 · manifest overflow set → incomplete", agenticManifestComplete(ing({ files_total: 5, files_ingested: 5, overflow: "trimmed" }), false, true), false);
eq("T6 · manifest 0 files → incomplete (can't reconcile)", agenticManifestComplete(ing({ files_total: 0, files_ingested: 0 }), false, true), false);

// THE BLOCKER: null ingestion means OPPOSITE things for SAM vs upload
eq("T7 · null ingestion + SAM sol (manifest assembly failed) → INCOMPLETE (was the false-green BID)", agenticManifestComplete(null, false, true), false);
eq("T8 · null ingestion + genuine upload (user supplied docs) → complete", agenticManifestComplete(null, false, false), true);
eq("T9 · undefined ingestion + SAM sol → incomplete", agenticManifestComplete(undefined, false, true), false);

console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
