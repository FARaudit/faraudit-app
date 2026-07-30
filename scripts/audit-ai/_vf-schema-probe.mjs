import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await admin.from("audits").select("*").eq("id","24eeea9b-078f-417d-a3c9-5219ebed6e73").single();
if (error) { console.error(error.message); process.exit(1); }
const cols = Object.keys(data).sort();
console.log("COLUMNS:", cols.join(", "));
// show which are populated + type/length
for (const c of cols) {
  const v = data[c];
  let d;
  if (v === null) d = "null";
  else if (typeof v === "string") d = `str(${v.length})`;
  else if (Array.isArray(v)) d = `arr(${v.length})`;
  else if (typeof v === "object") d = `obj{${Object.keys(v).length}}`;
  else d = `${typeof v}:${v}`;
  console.log(`  ${c} = ${d}`);
}
