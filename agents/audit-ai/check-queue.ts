import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// @ts-expect-error tsx resolves at runtime
const { supabase } = await import("./queue.ts");

const { data, error } = await supabase
  .from("pending_audits")
  .select("notice_id,status,recommendation,compliance_score,error_message,processed_at")
  .order("created_at", { ascending: true });

if (error) { console.error(error); process.exit(1); }
console.table(data);
