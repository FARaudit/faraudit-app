import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const USER = "135cb5c6-f391-4c8b-a5f2-0088004ac797";
const SET = [
  ["70B01C26R00000080","c4c9f21e75c7406d8e8b54cab70f099d","DHS Tucson TI Maint (11 docs)"],
  ["W9123626BA006","afcd5910421344b49e470d034c2406e3","Army Fort Lee construction IFB"],
  ["70LGLY26RSSB00022","c7c86cbcd4204118bb062ca5afbe036a","DHS Flood mitigation"],
  ["W51H7226QA009","6d491e66af88409fb023901563a47f00","Army DTS amendment (clauses-file evicted)"],
  ["W15QKN-26-Q-A119","586c444e8d374f42b440ab4dcaca09ab","Army roof RFQ (SF-30 mis-pick)"],
];
const out=[];
for (const [sol,notice,desc] of SET) {
  const { data: a, error: e1 } = await admin.from("audits").insert({ notice_id:notice, solicitation_number:sol, title:desc, user_id:USER, status:"processing" }).select("id").single();
  if (e1||!a) { console.log("insert fail",sol,e1?.message); continue; }
  const { error: e2 } = await admin.from("pending_audits").insert({ notice_id:notice, solicitation_number:sol, title:desc, pdf_url:null, source:"user", status:"pending", user_id:USER, audit_id:a.id, anthropic_file_id:null, pdf_filename:null, upload_docs:null });
  if (e2) { await admin.from("audits").update({status:"failed",error_message:"enqueue:"+e2.message}).eq("id",a.id); console.log("enqueue fail",sol,e2.message); continue; }
  out.push([sol,a.id]); console.log(`  ✓ ${sol} | ${desc} | audit_id=${a.id}`);
}
console.log(`\nRE-ENQUEUED ${out.length}/5 on fixed worker (sha=04593d1) · est ~$${out.length*2} Opus · worker processing.`);
