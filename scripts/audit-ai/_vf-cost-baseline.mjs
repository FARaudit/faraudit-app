import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// probe usage_events shape + recent cost for the demo user
const USER = "135cb5c6-f391-4c8b-a5f2-0088004ac797";
const { data, error } = await admin.from("usage_events").select("*").order("created_at",{ascending:false}).limit(3);
if (error) { console.error("usage_events err:", error.message); process.exit(1); }
if (data[0]) console.log("usage_events columns:", Object.keys(data[0]).join(", "));
for (const r of data) console.log(JSON.stringify(r).slice(0,300));
