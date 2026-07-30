import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await admin.from("usage_events").select("audit_id,verdict,cost_usd,cost_source,input_tokens,output_tokens,cache_read_tokens,created_at");
if (error) { console.error(error.message); process.exit(1); }
let total=0, custTotal=0; for (const r of data){ total+=Number(r.cost_usd||0); if(r.cost_source==='customer') custTotal+=Number(r.cost_usd||0); }
console.log("usage_events rows:", data.length);
console.log("CUMULATIVE cost_usd (all):  $" + total.toFixed(2));
console.log("CUMULATIVE cost_usd (customer-source): $" + custTotal.toFixed(2));
const anchors={"2ababbc3":"2ababbc3-9c84-4c02-b9d1-e885265b0262","e63bd1e7":"e63bd1e7-7de9-4cb6-b7b4-8c716502b113","24eeea9b":"24eeea9b-078f-417d-a3c9-5219ebed6e73"};
for (const [lbl,id] of Object.entries(anchors)){ const r=data.find(x=>x.audit_id===id); if(r) console.log(`  ${lbl}: ${r.verdict} · $${Number(r.cost_usd).toFixed(4)} · src=${r.cost_source} · in=${r.input_tokens} out=${r.output_tokens} cache_r=${r.cache_read_tokens}`); }
