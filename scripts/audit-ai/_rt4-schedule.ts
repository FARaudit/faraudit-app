import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
(async () => {
  const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: row } = await a.from("audits").select("raw_pdf_text").eq("id","95698f91-ddeb-4ed2-b5c4-eda18495219a").single();
  const lines = ((row as any).raw_pdf_text as string).split("\n");
  console.log("===== lines 112-150 (the REAL schedule) =====");
  for (let i = 112; i < 150; i++) console.log(String(i).padStart(4), JSON.stringify((lines[i]||"").slice(0,110)));
  const clinRows = lines.map((l,i)=>({i,l})).filter(({l}) => /^\s*(\d{4})\s+\S/.test(l));
  console.log(`\n===== lines that look like a real CLIN row (NNNN + text): ${clinRows.length} =====`);
  for (const r of clinRows.slice(0,30)) console.log(`  L${String(r.i).padStart(5)}: ${r.l.slice(0,90)}`);
})();
