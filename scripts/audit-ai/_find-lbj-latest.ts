import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const { data, error } = await sb.from("audits")
    .select("id, status, current_stage, solicitation_number, created_at, audit_source")
    .order("created_at", { ascending: false }).limit(8);
  if (error) { console.log("ERR:", error.message); return; }
  for (const a of data as any[]) {
    const sol = a.solicitation_number ?? "-";
    console.log(`${a.created_at} | ${a.id} | ${a.status} | stage=${a.current_stage ?? "-"} | sol=${sol} | src=${a.audit_source ?? "-"}`);
  }
})();
