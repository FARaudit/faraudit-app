// One-shot: reset all `processed` queue rows back to `pending`.
// Used after a partial-failure run where rows got marked processed despite
// failed downstream writes. Safe and idempotent.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// @ts-expect-error tsx
const { supabase } = await import("./queue.ts");

const { data, error } = await supabase
  .from("pending_audits")
  .update({
    status: "pending",
    audit_id: null,
    recommendation: null,
    compliance_score: null,
    bid_no_bid: null,
    error_message: null,
    processed_at: null
  })
  .eq("status", "processed")
  .select("notice_id");

if (error) { console.error(error); process.exit(1); }
console.log(`reset ${data?.length || 0} row(s) to pending:`, (data || []).map((r: any) => r.notice_id).join(" · "));
