import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await admin.from("audits").select("*").eq("id","496a9a21-8391-41b4-9e24-cff212971fd3").single();
delete data.raw_pdf_text; // lean fixture — render doesn't need the 276K source
writeFileSync("scripts/audit-ai/fixtures/fa0033-496a9a21-row.json", JSON.stringify(data));
console.log("fixture written · findings:", (data.compliance_json?.v3?.findings||[]).length, "· showStoppers:", (data.compliance_json?.v3?.showStoppers||[]).length);
