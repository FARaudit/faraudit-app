import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const SOL="12318726Q0165", ID="cab687da-11a4-4b6e-8820-20516f293a1c";
(async()=>{
  const path=`${SOL}/${ID}.json`;
  const { data, error } = await sb.storage.from("run-records").download(path);
  if(error){ console.log("DL ERR:", error.message, "— listing bucket for sol:"); 
    const l = await sb.storage.from("run-records").list(SOL); console.log(JSON.stringify(l.data?.map(x=>x.name),null,0)); return; }
  const buf = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(`scripts/audit-ai/run-records/_new-cab687da.json`, buf);
  console.log(`downloaded ${buf.length} bytes → _new-cab687da.json`);
})();
