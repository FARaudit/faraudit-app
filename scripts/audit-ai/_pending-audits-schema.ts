// $0 — inspect pending_audits: columns + recent sample, to source CERT-5 stress-test candidates from the real pipeline.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error, count } = await admin
    .from("pending_audits")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) { console.error("ERR", error.message); process.exit(1); }
  console.log(`pending_audits total rows: ${count}`);
  if (data?.[0]) {
    console.log("COLUMNS:", Object.keys(data[0]).join(", "));
    const r = data[0];
    // show a compact view of the newest row's meaningful fields
    for (const k of Object.keys(r)) {
      const v = r[k];
      const s = typeof v === "string" ? `${v.slice(0, 90)}${v.length > 90 ? "…(" + v.length + "c)" : ""}` : JSON.stringify(v)?.slice(0, 90);
      console.log(`  ${k}: ${s}`);
    }
  }
})();
