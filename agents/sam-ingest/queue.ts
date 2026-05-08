// Tiny self-contained Supabase wrapper for the sam-ingest worker.
// Mirrors agents/audit-ai/queue.ts's upsert path; we don't import across
// agents to keep each one independently deployable.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("sam-ingest: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set");
}

export const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

export interface PendingAuditInsert {
  notice_id: string;
  solicitation_number?: string | null;
  title?: string | null;
  agency?: string | null;
  naics_code?: string | null;
  set_aside?: string | null;
  document_type?: string | null;
  risk_level?: string | null;
  response_deadline?: string | null;
  pdf_url?: string | null;
  source: "sam_live";
  notes?: string | null;
}

// Insert new rows; skip rows where notice_id already exists (regardless of
// status). This means once a solicitation is queued, we never re-queue it —
// even if its content updates on SAM.gov. Future enhancement: detect amendments
// and re-queue with status='pending'.
//
// Batches both the existence check (PostgREST IN-clause hits a ~2KB URL limit
// around ~50 UUIDs) and the insert (PostgREST request body cap). Without this
// the upsert silently empties on large feed pulls — the 2026-05-04 backfill
// hit "existence check:" with no error body when passing 2539 IDs at once.
const BATCH = 100;

// Doctrine cap (P0-1, 2026-05-08): pending_audits queue must not exceed
// PENDING_QUEUE_CAP rows in status='pending'. Audit-AI processes 50/day,
// so anything beyond this just sits until its response deadline passes
// and becomes irrelevant — and it falsely inflates the "1,200 pending"
// alarm count on dashboards. Cap is enforced at insert time. Existing
// excess (1,125 rows when this shipped) is trimmed via a one-shot SQL
// purge applied separately via Supabase Studio.
export const PENDING_QUEUE_CAP = 100;

export async function insertNew(rows: PendingAuditInsert[]): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  const existingSet = new Set<string>();
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { data: existing, error: existErr } = await supabase
      .from("pending_audits")
      .select("notice_id")
      .in("notice_id", slice.map((r) => r.notice_id));
    if (existErr) throw new Error(`existence check (batch ${i}-${i + slice.length}): ${existErr.message || JSON.stringify(existErr)}`);
    for (const r of (existing || []) as Array<{ notice_id: string }>) existingSet.add(r.notice_id);
  }

  const fresh = rows.filter((r) => !existingSet.has(r.notice_id));
  if (fresh.length === 0) return { inserted: 0, skipped: rows.length };

  // Cap enforcement: never push the queue past PENDING_QUEUE_CAP. Query
  // current pending count and slice fresh accordingly. If queue is already
  // at/over cap, insert nothing this run.
  const { count: currentPending, error: countErr } = await supabase
    .from("pending_audits")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (countErr) {
    throw new Error(`pending count check: ${countErr.message || JSON.stringify(countErr)}`);
  }
  const capacity = Math.max(0, PENDING_QUEUE_CAP - (currentPending ?? 0));
  const droppedToCap = Math.max(0, fresh.length - capacity);
  const capped = fresh.slice(0, capacity);

  if (droppedToCap > 0) {
    console.log(`[sam-ingest queue] cap enforced · current_pending=${currentPending} cap=${PENDING_QUEUE_CAP} capacity=${capacity} dropped_to_cap=${droppedToCap} · inserting ${capped.length} of ${fresh.length} fresh rows`);
  }

  if (capped.length === 0) {
    return { inserted: 0, skipped: rows.length };
  }

  let inserted = 0;
  for (let i = 0; i < capped.length; i += BATCH) {
    const slice = capped.slice(i, i + BATCH);
    const { error: insertErr, count } = await supabase
      .from("pending_audits")
      .insert(slice.map((r) => ({ ...r, status: "pending" })), { count: "exact" });
    if (insertErr) throw new Error(`insert (batch ${i}-${i + slice.length}): ${insertErr.message || JSON.stringify(insertErr)}`);
    inserted += count ?? slice.length;
  }

  return { inserted, skipped: existingSet.size + droppedToCap };
}
