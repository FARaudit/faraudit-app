import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const IDS = {
  "2ababbc3 (headline-defect)": "2ababbc3-9c84-4c02-b9d1-e885265b0262",
  "e63bd1e7 (F/NO-STAMP false-INCOMPLETE)": "e63bd1e7-7de9-4cb6-b7b4-8c716502b113",
  "24eeea9b (latest real record)": "24eeea9b-078f-417d-a3c9-5219ebed6e73",
};
for (const [label, id] of Object.entries(IDS)) {
  const { data, error } = await admin.from("audits").select("id,status,current_stage,bid_recommendation,bid_score,quality_score,quality_flag,model_used,raw_pdf_text,compliance_json,processing_time_ms").eq("id", id).single();
  if (error) { console.log(label, "ERR", error.message); continue; }
  const cj = data.compliance_json || {};
  console.log("\n===== " + label + " =====");
  console.log("  status:", data.status, "| stage:", data.current_stage, "| model:", data.model_used, "| qflag:", data.quality_flag, "| qscore:", data.quality_score);
  console.log("  raw_pdf_text:", data.raw_pdf_text ? `PRESENT (${data.raw_pdf_text.length} chars)` : "NULL");
  console.log("  compliance_json keys:", Object.keys(cj).join(", "));
  console.log("  verdict/pole:", cj.verdict ?? cj.pole ?? cj.overallVerdict ?? "(see bid_recommendation)");
  console.log("  noVerdictCause:", cj.noVerdictCause ?? "(absent)");
  console.log("  bid_recommendation[0:260]:", (data.bid_recommendation||"").slice(0,260).replace(/\n/g," "));
}
