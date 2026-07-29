// One-time cleanup: backfill audits.document_type where NULL (74/103 rows as of
// 2026-07-28) so the Past Audits Type column + fType slicer populate.
//
// Method (Rule 61/64 class — deterministic source data only, never guessed from
// sol#-letter heuristics): for each audits row with document_type IS NULL and a
// real SAM notice_id, re-fetch the notice through the src/lib/sam.ts library
// path (fetchSolicitationByNoticeId — notice_id → solnum → hyphen-stripped
// fallbacks) and stamp classifyDocType(sol.type) — the exact normalizer the
// sam-ingest path uses, so audits.document_type and pending_audits.document_type
// share one slicer vocabulary.
//
// Behavior contract:
//   - DRY by default; pass --apply to write. Dry and apply both emit a full
//     audit JSON to ceo/ (per-row before/after + skip/miss reasons).
//   - Idempotent: scans only NULL rows; the UPDATE re-asserts document_type IS
//     NULL so a re-run (or a concurrent engine write) never overwrites a value.
//   - SAM miss / synthetic pdf-% notice_id → row is REPORTED and left NULL.
//     No fallback guessing — an absent fact stays absent (compute-or-absent).
//   - SAM_API_KEY stays server-side (Rule 60): read from .env.local here,
//     never emitted into the audit JSON or logs.
//
// Run:   npx tsx scripts/cleanup-backfill-audit-doctype.ts          (dry)
//        npx tsx scripts/cleanup-backfill-audit-doctype.ts --apply  (write)

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const APPLY = process.argv.includes("--apply");

// Fail-closed env gate: fetchSolicitationByNoticeId silently returns null when
// SAM_API_KEY is unset — 74 quiet "SAM misses" would read as a clean no-op run.
for (const k of ["SAM_API_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const) {
  if (!process.env[k]) { console.error(`[cleanup-doctype] missing env ${k} — aborting`); process.exit(1); }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface AuditRow {
  id: string;
  notice_id: string | null;
  solicitation_number: string | null;
  title: string | null;
  document_type: string | null;
}

async function main() {
  // Dynamic import AFTER dotenv ran: src/lib/sam.ts snapshots SAM_API_KEY at
  // module scope, and top-level await is unavailable under tsx's CJS output.
  const { fetchSolicitationByNoticeId, classifyDocType } = await import("../src/lib/sam");

  const startedAt = new Date();
  console.log(`[cleanup-doctype] start ${startedAt.toISOString()} · mode=${APPLY ? "APPLY" : "DRY"}`);

  // Scan all NULL-document_type rows. Paginate — Supabase caps select at 1000.
  const PAGE = 1000;
  const rows: AuditRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("audits")
      .select("id, notice_id, solicitation_number, title, document_type")
      .is("document_type", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`audits scan failed: ${error.message}`);
    const batch = (data || []) as AuditRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  console.log(`[cleanup-doctype] ${rows.length} audits row(s) with document_type IS NULL`);

  const skipped: Array<{ id: string; notice_id: string | null; reason: string }> = [];
  const fetchable: AuditRow[] = [];
  for (const r of rows) {
    if (!r.notice_id) skipped.push({ id: r.id, notice_id: null, reason: "no notice_id" });
    else if (/^pdf-/i.test(r.notice_id)) skipped.push({ id: r.id, notice_id: r.notice_id, reason: "synthetic pdf-only notice_id (no SAM record)" });
    else fetchable.push(r);
  }
  console.log(`[cleanup-doctype] ${fetchable.length} fetchable · ${skipped.length} skipped (no SAM source)`);

  // One SAM fetch per unique notice_id (several audits can share a notice).
  // Fallback: stored notice_ids are often STALE version UUIDs — SAM v2 search
  // only serves the current version's UUID (probed 2026-07-29: 6 of 9 tail
  // notices missed by notice_id but hit via the row's solicitation_number).
  // fetchSolicitationByNoticeId already runs the noticeid → solnum →
  // hyphen-stripped chain on whatever key it's given, so passing the sol# is
  // the same library path keyed on the family's deterministic identifier.
  const groups = new Map<string, string[]>(); // notice_id → distinct sol#s in the group
  for (const r of fetchable) {
    const nid = r.notice_id as string;
    if (!groups.has(nid)) groups.set(nid, []);
    const g = groups.get(nid)!;
    if (r.solicitation_number && !g.includes(r.solicitation_number)) g.push(r.solicitation_number);
  }
  const samType = new Map<string, { type: string | null; via: string }>();
  let n = 0;
  for (const [noticeId, sols] of groups) {
    n++;
    let sol = await fetchSolicitationByNoticeId(noticeId);
    let via = `noticeid ${noticeId}`;
    for (const s of sols) {
      if (sol) break;
      await new Promise((r) => setTimeout(r, 250));
      sol = await fetchSolicitationByNoticeId(s);
      via = `solnum ${s}`;
    }
    if (sol) {
      samType.set(noticeId, { type: sol.type, via });
      console.log(`  [${n}/${groups.size}] ${noticeId} → type=${JSON.stringify(sol.type)} → ${classifyDocType(sol.type)} (via ${via})`);
    } else {
      console.log(`  [${n}/${groups.size}] ${noticeId} (sol# ${sols.join(",") || "—"}) → SAM MISS (left NULL)`);
    }
    await new Promise((r) => setTimeout(r, 250)); // pace well under SAM hourly quota
  }

  const updates: Array<{ id: string; notice_id: string; sam_type: string | null; recovered_via: string; new_document_type: string }> = [];
  const unmatched: Array<{ id: string; notice_id: string; solicitation_number: string | null }> = [];
  for (const r of fetchable) {
    const nid = r.notice_id as string;
    const hit = samType.get(nid);
    if (!hit) { unmatched.push({ id: r.id, notice_id: nid, solicitation_number: r.solicitation_number }); continue; }
    updates.push({ id: r.id, notice_id: nid, sam_type: hit.type, recovered_via: hit.via, new_document_type: classifyDocType(hit.type) });
  }

  const dist: Record<string, number> = {};
  for (const u of updates) dist[u.new_document_type] = (dist[u.new_document_type] || 0) + 1;
  console.log(`[cleanup-doctype] plan: ${updates.length} update(s) · ${unmatched.length} SAM miss(es) · ${skipped.length} skipped`);
  console.log(`[cleanup-doctype] new-type distribution:`);
  for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(10)} ${v}`);

  let written = 0;
  const writeErrors: Array<{ id: string; message: string }> = [];
  if (APPLY) {
    for (const u of updates) {
      // .is("document_type", null) → idempotent + never clobbers a value the
      // engine wrote between scan and apply.
      const { error } = await supabase
        .from("audits")
        .update({ document_type: u.new_document_type })
        .eq("id", u.id)
        .is("document_type", null);
      if (error) writeErrors.push({ id: u.id, message: error.message });
      else written++;
    }
    console.log(`[cleanup-doctype] wrote ${written}/${updates.length} · ${writeErrors.length} error(s)`);
  } else {
    console.log("[cleanup-doctype] DRY — no DB write. Re-run with --apply to persist.");
  }

  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const auditPath = path.join("ceo", `cleanup-backfill-audit-doctype-${APPLY ? "apply" : "dry"}-${stamp}.json`);
  await mkdir("ceo", { recursive: true });
  await writeFile(auditPath, JSON.stringify({
    ran_at: startedAt.toISOString(),
    mode: APPLY ? "apply" : "dry",
    scanned_null_rows: rows.length,
    updates,
    written: APPLY ? written : 0,
    write_errors: writeErrors,
    sam_misses: unmatched,
    skipped,
    new_type_distribution: dist
  }, null, 2) + "\n");
  console.log(`[cleanup-doctype] audit JSON → ${auditPath}`);
}

main().catch((e) => { console.error("[cleanup-doctype] fatal", e); process.exit(1); });
