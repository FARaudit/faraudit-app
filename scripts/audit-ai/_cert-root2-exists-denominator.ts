// ROOT-2 (Brain #648) gauntlet cert — EXISTS denominator. Proves the full invariant chain:
//   existsShortfallEntries(v2 resourceLinks vs v3 manifest) → files_total math → agenticManifestComplete gate.
// Every scenario the panel-on-design raised (redteam + ex-ko), in BOTH directions. $0 — pure functions only.
//   npx tsx scripts/audit-ai/_cert-root2-exists-denominator.ts
import { existsShortfallEntries, type IngestionMeta, type IngestionFileMeta } from "../../src/lib/sam-attachments";
import { agenticManifestComplete } from "../../src/lib/audit-executor-v3";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
};

// Build a minimal IngestionMeta from an ingested-count + the ROOT-2 placeholders, mirroring assembleSamDocumentSet:
//   files_total = distinctTotal + placeholders.length ; files_ingested = ingestedCount.
const ingestedFile = (i: number): IngestionFileMeta => ({ name: `doc${i}.pdf`, role: i === 0 ? "form" : "attachment", bytes: 50_000, ingested: true, has_text: true });
function meta(distinctTotal: number, ingestedCount: number, manifestLen: number, resourceLinksLen: number): IngestionMeta {
  const placeholders = existsShortfallEntries(manifestLen, resourceLinksLen);
  const files: IngestionFileMeta[] = [];
  for (let i = 0; i < ingestedCount; i++) files.push(ingestedFile(i));
  files.push(...placeholders);
  return { files_total: distinctTotal + placeholders.length, files_ingested: ingestedCount, form_identified: ingestedCount > 0, form_name: null, files } as IngestionMeta;
}
// The gate: SAM sol, not truncated. true = COMPLETE, false = INCOMPLETE cap.
const complete = (m: IngestionMeta) => agenticManifestComplete(m, false, true);

console.log("\n=== SCENARIO 1 — #648 reproduction (v3 degraded 1-of-6) → INCOMPLETE ===");
{
  const ph = existsShortfallEntries(1, 6);
  ok("existsShortfallEntries(1,6) yields 5 placeholders", ph.length === 5, `got ${ph.length}`);
  ok("placeholder is ingested:false, role attachment, bytes null", ph.every(p => p.ingested === false && p.role === "attachment" && p.bytes === null));
  ok("placeholder carries not_retrieved:true marker (honest render classification)", ph.every(p => (p as { not_retrieved?: boolean }).not_retrieved === true));
  ok("reason names BOTH counts (6 advertised / 1 enumerated)", /6 resources.*1 enumerated.*degraded retrieval/.test(ph[0].reason ?? ""), ph[0].reason);
  const m = meta(/*distinctTotal*/1, /*ingested*/1, /*manifest*/1, /*resourceLinks*/6);
  ok("files_total reflects EXISTS = 6", m.files_total === 6, `got ${m.files_total}`);
  ok("GATE caps to INCOMPLETE (files_ingested 1 < files_total 6)", complete(m) === false);
}

console.log("\n=== SCENARIO 2 — near-dup, NO degradation → COMPLETE (the near-dup P0) ===");
{
  // v3 manifest enumerated 6, one is a true near-dup collapsed to 5 distinct, all 5 ingested. resourceLinks=6 (counts the dup URL).
  const ph = existsShortfallEntries(6, 6);
  ok("existsShortfallEntries(6,6) = [] (raw counts symmetric, dedup can't fabricate shortfall)", ph.length === 0);
  const m = meta(/*distinctTotal*/5, /*ingested*/5, /*manifest*/6, /*resourceLinks*/6);
  ok("files_total = 5 (dedup honored, no phantom shortfall)", m.files_total === 5, `got ${m.files_total}`);
  ok("GATE = COMPLETE (no false-INCOMPLETE)", complete(m) === true);
}

console.log("\n=== SCENARIO 3 — upload / no resourceLinks → byte-identical ===");
{
  ok("existsShortfallEntries(3,0) = []", existsShortfallEntries(3, 0).length === 0);
  const m = meta(3, 3, 3, 0);
  ok("files_total unchanged = 3", m.files_total === 3, `got ${m.files_total}`);
  ok("GATE = COMPLETE", complete(m) === true);
}

console.log("\n=== SCENARIO 4 — legit lean SINGLE doc (over-fire guard) → COMPLETE ===");
{
  ok("existsShortfallEntries(1,1) = []", existsShortfallEntries(1, 1).length === 0);
  const m = meta(1, 1, 1, 1);
  ok("files_total = 1, ingested 1 → COMPLETE (small real sol not false-INCOMPLETE)", complete(m) === true && m.files_total === 1);
}

console.log("\n=== SCENARIO 5 — overcount (v2 lists 7, v3 has 6) → conservative INCOMPLETE (documented fail-safe) ===");
{
  const ph = existsShortfallEntries(6, 7);
  ok("1 placeholder (fail toward INCOMPLETE)", ph.length === 1);
  const m = meta(6, 6, 6, 7);
  ok("GATE = INCOMPLETE (conservative — measured on gold-set)", complete(m) === false && m.files_total === 7);
}

console.log("\n=== SCENARIO 6 — v3 enumerated MORE than v2 (resourceLinks < manifest) → never REDUCE ===");
{
  ok("existsShortfallEntries(8,6) = [] (never reduces total)", existsShortfallEntries(8, 6).length === 0);
  const m = meta(8, 8, 8, 6);
  ok("files_total = 8 (not reduced to 6)", m.files_total === 8, `got ${m.files_total}`);
  ok("GATE = COMPLETE", complete(m) === true);
}

console.log("\n=== SCENARIO 7 — partial ingest of a degraded package (2 of 6) → INCOMPLETE ===");
{
  const m = meta(/*distinctTotal from manifest*/2, /*ingested*/2, /*manifest*/2, /*resourceLinks*/6);
  ok("files_total = 6 (2 enumerated + 4 shortfall placeholders)", m.files_total === 6, `got ${m.files_total}`);
  ok("GATE = INCOMPLETE (2 < 6)", complete(m) === false);
}

console.log("\n=== SCENARIO 8 — full clean multi-doc SAM package → COMPLETE ===");
{
  const m = meta(6, 6, 6, 6);
  ok("6 of 6, no shortfall → COMPLETE", complete(m) === true && m.files_total === 6);
}

console.log(`\n=== ROOT-2 EXISTS cert: ${pass} pass / ${fail} fail ===`);
if (fail > 0) process.exit(1);
