// $0 HARDENED PRE-SCREEN — INGEST FETCH HEALTH (closes the gap that made T1 return INCOMPLETE on a transient blip).
// Two checks the old item-6 pre-screen missed:
//   (A) MANIFEST RECONCILIATION — v2 resourceLinks (advertised) vs v3 RESOURCES manifest (enumerable) vs what
//       assembleSamDocumentSet actually ingested (files_total/files_ingested + ROOT-2 not_retrieved markers).
//   (B) FETCH-ALL HEALTH PROBE — download EVERY manifest doc K times via the worker's own samFetchWithKey; a doc
//       that fails any pass = TRANSIENT-FLAKY (T1's exact mode), fails all = HARD GAP. Exposes flakiness a single
//       pass hides. Verdict per target: CLEAN | FLAKY | GAP → predicts an INCOMPLETE-on-ingest run BEFORE it costs $.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { fetchSolicitationByNoticeId } from "../../src/lib/sam";
import { fetchAttachmentManifest, assembleSamDocumentSet } from "../../src/lib/sam-attachments";
import { samFetchWithKey } from "../../src/lib/sam-url-guard";
import { createClient } from "@supabase/supabase-js";

const KEY = process.env.SAM_API_KEY!;
const K = 3;                 // download passes per doc
const TIMEOUT = 30000;
const SOLS = process.argv.slice(2).length ? process.argv.slice(2) : ["SPRRA2-26-R-0034", "36C24126Q0569", "36C24426Q0675"];

async function noticeFor(sol: string): Promise<string | null> {
  const s = await fetchSolicitationByNoticeId(sol);
  return s?.noticeId ?? null;
}

async function health(sol: string, admin: any) {
  console.log(`\n════ ${sol} ════`);
  const s = await fetchSolicitationByNoticeId(sol);
  if (!s) { console.log("  ❌ SAM resolve FAILED"); return "GAP"; }
  const v2 = ((s as any).resourceLinks || (s as any).links || []).filter(Boolean);
  const manifest = (await fetchAttachmentManifest(s.noticeId, { maxAttempts: 3 })) || [];
  console.log(`  advertised (v2 resourceLinks): ${v2.length} · enumerable (v3 manifest): ${manifest.length}`);
  const advertisedGap = v2.length > manifest.length;
  if (advertisedGap) console.log(`  ⚠ ADVERTISED-BUT-NOT-ENUMERATED gap: ${v2.length - manifest.length} doc(s) → ROOT-2 INCOMPLETE risk`);

  // (A) worker's own accounting
  const set = await assembleSamDocumentSet(s.noticeId, sol);
  const ing = set?.ingestion;
  const notRetrieved = (ing?.files || []).filter((f: any) => f?.not_retrieved).map((f: any) => f.name);
  console.log(`  ingested: ${ing?.files_ingested ?? "?"} / ${ing?.files_total ?? "?"}${notRetrieved.length ? ` · not_retrieved: ${notRetrieved.join(", ")}` : ""}`);

  // (B) fetch-all health probe — K passes per manifest doc
  let flaky = 0, hardGap = 0;
  for (const e of manifest) {
    let ok = 0, firstBytes = 0;
    for (let p = 0; p < K; p++) {
      try {
        const res = await samFetchWithKey(e.url, KEY, TIMEOUT);
        const buf = Buffer.from(await res.arrayBuffer());
        if (res.ok && buf.length > 0) { ok++; if (!firstBytes) firstBytes = buf.length; }
      } catch { /* counts as a failed pass */ }
    }
    const mark = ok === K ? "✓" : ok === 0 ? "✗HARD" : "~FLAKY";
    if (ok === 0) hardGap++; else if (ok < K) flaky++;
    if (ok < K) console.log(`    ${mark} ${(e.name || e.resourceId).slice(0, 46)}  passes ${ok}/${K}${firstBytes ? ` (${firstBytes}b)` : ""}`);
  }
  const ingestGap = (ing && ing.files_ingested < ing.files_total) || notRetrieved.length > 0;
  const verdict = advertisedGap || hardGap > 0 || ingestGap ? "GAP" : flaky > 0 ? "FLAKY" : "CLEAN";
  console.log(`  ── FETCH-HEALTH: ${verdict}${verdict === "FLAKY" ? ` (${flaky} doc(s) failed a pass → re-fire may hit INCOMPLETE; retry improves odds)` : verdict === "GAP" ? " (a required doc can't be retrieved → INCOMPLETE expected)" : " (all docs fetched cleanly across all passes → re-fire low-risk)"} ──`);
  return verdict;
}

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const out: Record<string, string> = {};
  for (const sol of SOLS) out[sol] = await health(sol, admin);
  console.log(`\n════ SUMMARY ════`);
  for (const [k, v] of Object.entries(out)) console.log(`  ${k}: ${v}`);
})().catch((e) => { console.error("THREW:", e instanceof Error ? e.message : e); process.exit(2); });
