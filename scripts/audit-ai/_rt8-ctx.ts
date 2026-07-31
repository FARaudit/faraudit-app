import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
(async()=>{
  const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const {data}=await a.from("audits").select("raw_pdf_text").eq("id","61aaaa95-b205-43b0-bf41-0a25fdd9265e").single();
  const src:string=(data as any).raw_pdf_text||"";
  for (const pat of ["must attend","is required","are required"]) {
    const re=new RegExp(pat.replace(/ /g,"\\s+"),"gi"); let m;
    while((m=re.exec(src))) console.log(`\n[${pat}] @${m.index}\n  ...${src.slice(Math.max(0,m.index-300),m.index+220).replace(/\s+/g," ")}...`);
  }
  console.log("\n--- 52.237-1 region ---");
  const i=src.search(/52\.237-1\s+Site\s+Visit/i);
  console.log(src.slice(Math.max(0,i-600), i+800).replace(/\s+/g," "));
})();
