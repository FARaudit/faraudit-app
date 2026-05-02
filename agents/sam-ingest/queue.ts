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
  title?: string | null;
  agency?: string | null;
  naics_code?: string | null;
  set_aside?: string | null;
  pdf_url?: string | null;
  source: "sam_live";
  notes?: string | null;
}

// Insert new rows; skip rows where notice_id already exists (regardless of
// status). This means once a solicitation is queued, we never re-queue it —
// even if its content updates on SAM.gov. Future enhancement: detect amendments
// and re-queue with status='pending'.
export async function insertNew(rows: PendingAuditInsert[]): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  // Read existing notice_ids in this batch so we can report skip count.
  const { data: existing, error: existErr } = await supabase
    .from("pending_audits")
    .select("notice_id")
    .in("notice_id", rows.map((r) => r.notice_id));
  if (existErr) throw new Error(`existence check: ${existErr.message}`);
  const existingSet = new Set((existing || []).map((r: any) => r.notice_id));
  const fresh = rows.filter((r) => !existingSet.has(r.notice_id));

  if (fresh.length === 0) return { inserted: 0, skipped: rows.length };

  const { error: insertErr, count } = await supabase
    .from("pending_audits")
    .insert(fresh.map((r) => ({ ...r, status: "pending" })), { count: "exact" });
  if (insertErr) throw new Error(`insert: ${insertErr.message}`);

  return { inserted: count ?? fresh.length, skipped: existingSet.size };
}
