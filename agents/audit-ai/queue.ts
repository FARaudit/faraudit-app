import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("audit-ai: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set");
}

export const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

export interface PendingAudit {
  id: string;
  notice_id: string;
  title: string | null;
  agency: string | null;
  naics_code: string | null;
  set_aside: string | null;
  pdf_url: string | null;
  pdf_path: string | null;
  source: "seed" | "sam_live" | "manual";
  status: "pending" | "processing" | "processed" | "failed";
  audit_id: number | null;
  recommendation: string | null;
  compliance_score: number | null;
  bid_no_bid: string | null;
  notes: string | null;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

export async function fetchPending(limit: number): Promise<PendingAudit[]> {
  const { data, error } = await supabase
    .from("pending_audits")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`fetchPending: ${error.message}`);
  return (data as PendingAudit[]) || [];
}

export async function markProcessing(id: string): Promise<void> {
  const { error } = await supabase
    .from("pending_audits")
    .update({ status: "processing" })
    .eq("id", id);
  if (error) throw new Error(`markProcessing(${id}): ${error.message}`);
}

export async function markProcessed(
  id: string,
  result: { audit_id: number | null; recommendation: string; compliance_score: number; bid_no_bid: string | null }
): Promise<void> {
  const { error } = await supabase
    .from("pending_audits")
    .update({
      status: "processed",
      audit_id: result.audit_id,
      recommendation: result.recommendation,
      compliance_score: result.compliance_score,
      bid_no_bid: result.bid_no_bid,
      processed_at: new Date().toISOString()
    })
    .eq("id", id);
  if (error) throw new Error(`markProcessed(${id}): ${error.message}`);
}

export async function markFailed(id: string, message: string): Promise<void> {
  const { error } = await supabase
    .from("pending_audits")
    .update({
      status: "failed",
      error_message: message.slice(0, 500),
      processed_at: new Date().toISOString()
    })
    .eq("id", id);
  if (error) throw new Error(`markFailed(${id}): ${error.message}`);
}

export async function upsertPending(rows: Array<Partial<PendingAudit> & { notice_id: string }>): Promise<number> {
  const { error, count } = await supabase
    .from("pending_audits")
    .upsert(rows, { onConflict: "notice_id", ignoreDuplicates: false, count: "exact" });
  if (error) throw new Error(`upsertPending: ${error.message}`);
  return count || 0;
}
