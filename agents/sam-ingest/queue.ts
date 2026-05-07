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

  let inserted = 0;
  for (let i = 0; i < fresh.length; i += BATCH) {
    const slice = fresh.slice(i, i + BATCH);
    const { error: insertErr, count } = await supabase
      .from("pending_audits")
      .insert(slice.map((r) => ({ ...r, status: "pending" })), { count: "exact" });
    if (insertErr) throw new Error(`insert (batch ${i}-${i + slice.length}): ${insertErr.message || JSON.stringify(insertErr)}`);
    inserted += count ?? slice.length;
  }

  return { inserted, skipped: existingSet.size };
}
