// $0 INGEST REPRODUCTION — drives assembleSamDocumentSet ALONE for one notice and prints the
// per-file disposition. NO model call, NO audit, NO paid run. Downloads only.
//
// WHY THIS AND NOT A RE-FIRE: the 08-05 live run (58c612f5, W911SG27BA002) logged
//   "FA-136: document set assembled · 36/55 ingested"
// and then stalled on the 360s budget. The abort path persists NOTHING (raw_pdf_text absent, no
// run record), so the per-file reasons — which the code DOES record — were lost with it. Rule 68
// forbids re-firing the audit to see them again. This reaches the same ingest through the same
// entry point the worker calls, for $0.
//
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_ingest-repro-w911sg.ts

import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import { assembleSamDocumentSet } from "../../src/lib/sam-attachments";

const NOTICE = process.env.REPRO_NOTICE_ID ?? "8799e548c40f4ecb91187408ce877023";
const SOL = process.env.REPRO_SOL ?? "W911SG27BA002";

async function resourceLinks(): Promise<string[]> {
  const KEY = process.env.SAM_API_KEY;
  if (!KEY) return [];
  const u = `https://sam.gov/api/prod/opportunities/v2/search?api_key=${KEY}&postedFrom=07/15/2026&postedTo=08/05/2026&limit=100&offset=0&ptype=o,k,r&solnum=${SOL}`;
  const r = await fetch(u, { headers: { Accept: "application/json" } });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.opportunitiesData ?? [])[0]?.resourceLinks ?? [];
}

(async () => {
  const links = await resourceLinks();
  console.log(`v2 resourceLinks (what the notice ADVERTISES): ${links.length}`);

  const t0 = Date.now();
  const set = await assembleSamDocumentSet(NOTICE, SOL, links);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (!set) { console.error("assembleSamDocumentSet returned null — manifest fetch failed"); process.exit(1); }

  const ing = set.ingestion;
  console.log(`\n── FA-136 COUNTERS (what the worker logs) ──`);
  console.log(`  files_ingested / files_total : ${ing.files_ingested}/${ing.files_total}`);
  console.log(`  form_identified              : ${ing.form_identified} (${ing.form_name ?? "—"})`);
  console.log(`  overflow                     : ${ing.overflow ?? "(none)"}`);
  console.log(`  assembly wall-clock          : ${secs}s`);

  // THE POINT OF THE WHOLE EXERCISE: the reasons exist per-file and are never logged.
  const dropped = ing.files.filter((f) => !f.ingested);
  const kept = ing.files.filter((f) => f.ingested);
  console.log(`\n── DISPOSITION: ${kept.length} ingested · ${dropped.length} NOT ingested · ${ing.files.length} listed ──`);

  const byReason = new Map<string, string[]>();
  for (const f of dropped) {
    const r = f.reason ?? "(NO REASON RECORDED)";
    if (!byReason.has(r)) byReason.set(r, []);
    byReason.get(r)!.push(f.name);
  }
  for (const [reason, names] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n  ${names.length}× ${reason}`);
    for (const n of names.slice(0, 8)) console.log(`      · ${n}`);
    if (names.length > 8) console.log(`      … and ${names.length - 8} more`);
  }

  // Binding-doc exposure: a dropped BINDING document is the one that produces a wrong answer.
  const { isBindingDoc } = await import("../../src/lib/sam-attachments");
  const droppedBinding = dropped.filter((f) => isBindingDoc({ role: f.role, name: f.name }));
  console.log(`\n── BINDING DOCUMENTS AMONG THE DROPPED: ${droppedBinding.length} ──`);
  for (const f of droppedBinding.slice(0, 15)) console.log(`   · ${f.name}  — ${f.reason ?? "(no reason)"}`);

  const noText = kept.filter((f) => f.has_text === false);
  console.log(`\n── INGESTED BUT NO EXTRACTED TEXT: ${noText.length} ──`);
  for (const f of noText.slice(0, 10)) console.log(`   · ${f.name}`);

  console.log(`\nRECONCILIATION`);
  console.log(`  v2 advertises      ${links.length}`);
  console.log(`  files_total        ${ing.files_total}`);
  console.log(`  files_ingested     ${ing.files_ingested}`);
  console.log(`  unexplained        ${ing.files.length - kept.length - dropped.length} (must be 0)`);
})();
