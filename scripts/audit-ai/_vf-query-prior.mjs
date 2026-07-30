import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await admin
  .from("audits")
  .select("id,notice_id,solicitation_number,title,agency,naics_code,set_aside,posted_date,response_deadline,user_id,status,created_at")
  .eq("solicitation_number", "FA813726R0033")
  .order("created_at", { ascending: false })
  .limit(5);
if (error) { console.error("query error:", error.message); process.exit(1); }
for (const r of data) {
  console.log(JSON.stringify({ id:r.id, notice_id:r.notice_id, sol:r.solicitation_number, title:r.title, agency:r.agency, naics:r.naics_code, set_aside:r.set_aside, posted:r.posted_date, deadline:r.response_deadline, user_id:r.user_id, status:r.status, created:r.created_at }));
}
