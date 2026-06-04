// One-shot: backfill audits.agency from pending_audits.agency where the
// audit row has agency=NULL and a pending_audits row with matching
// notice_id has a non-null agency.
//
// Why: historical user-uploaded audits (audit_source='user', May 5-7 2026)
// landed with agency=NULL because the live SAM call at write-time returned
// a solicitation with no fullParentPathName/department/subTier. The
// sam-ingest cron later populated those notice_ids' agency in
// pending_audits. This script copies that value over so the Run Audit
// row-list UI renders the bold .agency span on those rows.
//
// Idempotent: re-running is a no-op (only updates rows still NULL).
// Excludes PDF-only uploads (notice_id starts with "pdf-") — those have
// synthetic notice_ids that never match a pending_audits row.
//
// Run:   npx dotenv -e .env.local -- tsx scripts/audit-ai/backfill-agency-from-pending.ts

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Pull every audits row with null agency and a real (non-pdf-) notice_id.
  const { data: targets, error: tErr } = await supabase
    .from("audits")
    .select("id, notice_id")
    .is("agency", null)
    .not("notice_id", "is", null)
    .not("notice_id", "ilike", "pdf-%");
  if (tErr) throw new Error(`audits scan failed: ${tErr.message}`);
  if (!targets || targets.length === 0) {
    console.log("[backfill-agency] no candidate audits (all already have agency or no notice_id)");
    return;
  }
  console.log(`[backfill-agency] ${targets.length} candidate audit row(s) with null agency`);

  const noticeIds = Array.from(new Set(targets.map(t => t.notice_id as string)));

  // Look up agency from pending_audits for each notice_id. Single round-trip.
  const { data: paRows, error: paErr } = await supabase
    .from("pending_audits")
    .select("notice_id, agency")
    .in("notice_id", noticeIds)
    .not("agency", "is", null);
  if (paErr) throw new Error(`pending_audits lookup failed: ${paErr.message}`);

  const agencyByNoticeId = new Map<string, string>();
  for (const r of (paRows || [])) {
    const nid = r.notice_id as string;
    const ag  = r.agency as string;
    if (nid && ag && !agencyByNoticeId.has(nid)) agencyByNoticeId.set(nid, ag);
  }
  console.log(`[backfill-agency] resolved agency from pending_audits for ${agencyByNoticeId.size}/${noticeIds.length} notice_ids`);

  let updated = 0;
  let skipped = 0;
  for (const t of targets) {
    const ag = agencyByNoticeId.get(t.notice_id as string);
    if (!ag) { skipped++; continue; }
    const { error: uErr } = await supabase
      .from("audits")
      .update({ agency: ag })
      .eq("id", t.id);
    if (uErr) {
      console.error(`  ✗ ${t.id}: ${uErr.message}`);
      continue;
    }
    updated++;
    console.log(`  ✓ ${t.id} · ${t.notice_id} → ${ag}`);
  }
  console.log(`[backfill-agency] done · updated=${updated} skipped=${skipped} (no matching pending_audits row with agency)`);
}

main().catch(err => { console.error(err); process.exit(1); });
