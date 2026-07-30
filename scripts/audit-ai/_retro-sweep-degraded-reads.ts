// RETRO-SWEEP (Brain #648 step 4) — flag completed audits that ran on a DEGRADED read (ingested << expected).
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_retro-sweep-degraded-reads.ts
// For every completed audit: expected doc count (links[] / compliance_json.ingestion.files_total) vs what ingested,
// + a src-size sanity. Flag: (a) multi-doc notice (links>1) that ran with ingestion=NONE (single-doc fallback),
// (b) ingestion.files_ingested < files_total for a NON-budget reason. Report; no writes.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
(async () => {
  if (!url || !key) { console.log("ENV_MISSING"); process.exit(2); }
  // page through completed audits
  const rows: any[] = [];
  for (let off = 0; off < 4000; off += 1000) {
    const q = `${url}/rest/v1/audits?status=eq.complete&select=id,solicitation_number,created_at,audit_source,links,compliance_json,raw_pdf_text&order=created_at.desc&limit=1000&offset=${off}`;
    const res = await fetch(q, { headers: { apikey: key!, Authorization: `Bearer ${key}` } });
    if (!res.ok) { console.log(`HTTP_${res.status} at offset ${off}`); break; }
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;
    rows.push(...page);
    if (page.length < 1000) break;
  }
  console.log(`Scanned ${rows.length} completed audits.\n`);

  const degraded: any[] = [];
  let multiDocTotal = 0;
  for (const r of rows) {
    const links = Array.isArray(r.links) ? r.links.length : 0;
    const cj = r.compliance_json || {};
    const ing = cj && typeof cj === "object" ? cj.ingestion : null;
    const filesTotal = ing?.files_total ?? null;
    const filesIngested = ing?.files_ingested ?? null;
    const expected = Math.max(links, filesTotal ?? 0);
    if (expected <= 1) continue; // single-doc notices are out of scope
    multiDocTotal++;
    // Flag A: multi-doc notice but NO ingestion meta → single-doc fallback path (the #648 signature).
    if (!ing && links > 1) {
      degraded.push({ id: r.id, sol: r.solicitation_number, when: r.created_at?.slice(0,10), reason: `NO ingestion meta + links=${links} → single-doc fallback`, src: r.audit_source });
      continue;
    }
    // Flag B: ingested < total for a NON-budget reason (download/extraction failure = degraded, not honest budget skip).
    if (filesTotal != null && filesIngested != null && filesIngested < filesTotal) {
      const files = Array.isArray(ing?.files) ? ing.files : [];
      // TRUE degraded = a RETRIEVAL/EXTRACTION FAILURE (the #648 class), NOT an honest capacity/type exclusion.
      // HONEST (exclude): document cap / budget / page / token / MB / oversize / near-dup / non-PDF-attachment-not-inline.
      // DEFECT (keep): "download failed" · "not a PDF" · "text extraction failed".
      const nonBudgetDrops = files.filter((f: any) => {
        if (f?.ingested !== false || !f?.reason) return false;
        const reason = String(f.reason);
        const honest = /budget|page|token|\bMB\b|oversize|near-dup|duplicate|document cap|cap \(|not inline|non-PDF attachment/i.test(reason);
        const failure = /download failed|not a (valid )?PDF|text extraction failed/i.test(reason);
        return failure && !honest;
      });
      if (nonBudgetDrops.length > 0) {
        degraded.push({ id: r.id, sol: r.solicitation_number, when: r.created_at?.slice(0,10), reason: `${filesIngested}/${filesTotal} ingested · non-budget drops: ${nonBudgetDrops.map((f:any)=>`${(f.name||"?").slice(0,20)}:${(f.reason||"").slice(0,30)}`).join("; ")}`, src: r.audit_source });
      }
    }
  }

  console.log(`Multi-doc audits (expected>1): ${multiDocTotal}`);
  console.log(`DEGRADED (ran on a partial read): ${degraded.length}\n`);
  degraded.forEach((d) => console.log(`  ⚠ ${d.when} ${d.sol} (${d.src}) [${d.id.slice(0,8)}] — ${d.reason}`));
  console.log(`\n=== ${degraded.length} of ${multiDocTotal} multi-doc audits flagged for ESTIMATED-class ===`);
})();
