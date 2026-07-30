import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ID = "496a9a21-8391-41b4-9e24-cff212971fd3";
const sleep = ms => new Promise(r=>setTimeout(r,ms));
for (let i=1;i<=40;i++){
  const { data } = await admin.from("audits").select("status,current_stage,bid_recommendation,processing_time_ms,completed_at").eq("id",ID).single();
  const pa = await admin.from("pending_audits").select("status,attempts").eq("audit_id",ID).maybeSingle();
  const ts = new Date().toISOString().slice(11,19);
  console.log(`poll ${i} ${ts}Z: audit.status=${data?.status} stage=${data?.current_stage} | pending=${pa.data?.status ?? "gone"} attempts=${pa.data?.attempts ?? "-"}`);
  if (data?.status === "complete" || data?.status === "failed") { console.log("RESOLVED="+data.status); break; }
  await sleep(20000);
}
