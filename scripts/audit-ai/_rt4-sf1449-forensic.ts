// $0 FORENSIC — REPORT-TRUTH fix #4. The SF-1449 cover form is a BOX layout; naive text extraction emits the block
// LABELS in reading order and strands their VALUES elsewhere. The Gauntlet found blocks 8/9/10/12 came through as
// labels with no values, which killed the size standard, the submission office, and a 52.212-3/52.212-5 ambiguity.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
(async () => {
  const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: row } = await a.from("audits").select("raw_pdf_text").eq("id", "95698f91-ddeb-4ed2-b5c4-eda18495219a").single();
  const full: string = (row as { raw_pdf_text: string }).raw_pdf_text;
  const head = full.slice(0, 6000);
  console.log("===== FIRST 90 LINES OF THE SF-1449 REGION =====");
  head.split("\n").slice(0, 90).forEach((l, i) => console.log(String(i).padStart(3), JSON.stringify(l.slice(0, 110))));
})();
