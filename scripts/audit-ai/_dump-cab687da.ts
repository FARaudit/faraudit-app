import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ID = "cab687da-11a4-4b6e-8820-20516f293a1c";
(async () => {
  const { data, error } = await sb.from("audits").select("*").eq("id", ID).single();
  if (error){ console.log("ERR:", error.message); return; }
  const a:any = data;
  console.log("=== columns present ===");
  console.log(Object.keys(a).join(", "));
  console.log("\n=== verdict-relevant ===");
  for (const k of Object.keys(a)) {
    if (/verdict|recommend|bid|score|conf|shadow|verif|quality|status|stage|proc|complete|finding|show|stopper|nhr|pole/i.test(k)) {
      let v = a[k];
      if (v && typeof v === "object") v = JSON.stringify(v).slice(0, 500);
      else if (typeof v === "string") v = v.slice(0, 300);
      console.log(`${k} = ${v}`);
    }
  }
})();
