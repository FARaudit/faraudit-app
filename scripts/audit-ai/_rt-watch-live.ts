import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
const ID = "583df921";
(async () => {
  const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  let last = "";
  for (;;) {
    const { data } = await a.from("audits").select("id,status,current_stage,error_message,bid_recommendation").order("created_at",{ascending:false}).limit(5);
    const r = (data||[]).find((x:any)=>String(x.id).startsWith(ID));
    if (!r) { console.log("row not found"); process.exit(1); }
    const k = `${r.status}/${r.current_stage}`;
    if (k !== last) { console.log(`[${new Date().toISOString().slice(11,19)}] ${k}${r.error_message?" ERR="+String(r.error_message).slice(0,120):""}`); last = k; }
    if (["complete","failed","error"].includes(String(r.status))) { console.log("TERMINAL: "+r.status); process.exit(0); }
    await new Promise(s=>setTimeout(s,5000));
  }
})();
