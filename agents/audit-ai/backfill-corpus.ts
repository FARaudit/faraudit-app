// One-shot recovery: corpus.ts threw on insert before the audit_id type
// migration landed, leaving 3 'audit_source=audit_ai' audits rows persisted
// but no fa_intelligence_corpus rows + 3 pending_audits rows marked 'failed'.
//
// This script reads the 3 audits rows directly, parses compliance_json.dfars_flags,
// inserts the corpus rows, and updates pending_audits to status='processed'.
// Zero new Anthropic spend.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// @ts-expect-error tsx
const { supabase } = await import("./queue.ts");

const NOTICE_IDS = ["FA301626Q0068", "N0017426Q1021", "FA251726Q0024"];

console.log(`[backfill] reading 'audit_ai' audits for ${NOTICE_IDS.join(" · ")}`);

const { data: audits, error: auditsErr } = await supabase
  .from("audits")
  .select("id,notice_id,recommendation,compliance_score,compliance_json,document_type,bid_recommendation,risks_json")
  .eq("audit_source", "audit_ai")
  .in("notice_id", NOTICE_IDS);

if (auditsErr) { console.error("audits read failed:", auditsErr); process.exit(1); }
if (!audits || audits.length === 0) { console.error("no audits rows found"); process.exit(1); }

console.log(`[backfill] found ${audits.length} audit row(s)`);

let totalCorpusRows = 0;
for (const a of audits) {
  const flags = (a.compliance_json?.dfars_flags || []).filter((f: any) => f.detected);
  if (flags.length === 0) {
    console.log(`  · ${a.notice_id} · 0 traps detected · skipping corpus insert`);
    continue;
  }
  const corpusRows = flags.map((f: any) => ({
    audit_id: a.id,
    solicitation_id: a.notice_id,
    trap_type: f.clause,
    was_caught: true,
    outcome: a.recommendation,
    metadata: { document_type: a.document_type, severity: f.severity, title: f.title, source: "audit_ai" }
  }));
  const { error: corpusErr, count } = await supabase
    .from("fa_intelligence_corpus")
    .insert(corpusRows, { count: "exact" });
  if (corpusErr) { console.error(`  ✗ ${a.notice_id} corpus insert failed: ${corpusErr.message}`); continue; }
  totalCorpusRows += count || corpusRows.length;
  console.log(`  ✓ ${a.notice_id} · audit_id=${a.id} · ${count || corpusRows.length} corpus rows inserted`);

  // Update pending_audits row to processed.
  const r = a.risks_json || {};
  const { error: queueErr } = await supabase
    .from("pending_audits")
    .update({
      status: "processed",
      audit_id: a.id,
      recommendation: a.recommendation,
      compliance_score: a.compliance_score,
      bid_no_bid: r.bid_no_bid_recommendation || null,
      error_message: null,
      processed_at: new Date().toISOString()
    })
    .eq("notice_id", a.notice_id);
  if (queueErr) console.warn(`  ! ${a.notice_id} pending_audits update failed: ${queueErr.message}`);
  else console.log(`    queue row marked processed`);
}

console.log(`\n[backfill] done · ${totalCorpusRows} fa_intelligence_corpus row(s) inserted across ${audits.length} audit(s)`);
