import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
(async()=>{
  const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const {data}=await a.from("audits").select("compliance_json").eq("id","61aaaa95-b205-43b0-bf41-0a25fdd9265e").single();
  const f=(data as any).compliance_json?.v3?.findings||[];
  console.log("KEYS:", [...new Set(f.flatMap((x:any)=>Object.keys(x)))].join(", "));
  console.log("\n--- finding #18 verbatim ---\n"+JSON.stringify(f[18],null,1).slice(0,1800));
  console.log("\n--- finding #30 verbatim ---\n"+JSON.stringify(f[30],null,1).slice(0,1800));
})();
