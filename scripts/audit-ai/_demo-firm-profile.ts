// $0 — read the demo firm's capability_statements (certs) → what set-asides it can WIN. Drives whether an
// archetype-2 set-aside target is a false-INELIGIBLE TRAP (firm qualifies → engine must BID) or a genuine INELIGIBLE.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const DEMO_USER = "135cb5c6-f391-4c8b-a5f2-0088004ac797"; // owner of FA813726R0033 (demo@)
  // try common capability tables
  for (const tbl of ["capability_statements", "capabilities", "company_profiles", "firm_profiles"]) {
    const { data, error } = await admin.from(tbl).select("*").limit(5);
    if (error) { console.log(`  ${tbl}: (${error.message})`); continue; }
    console.log(`\n=== ${tbl} — ${data?.length ?? 0} row(s) ===`);
    if (data?.[0]) console.log("  cols:", Object.keys(data[0]).join(", "));
    for (const r of data || []) {
      console.log(`  user=${r.user_id ?? "?"} certs=${JSON.stringify(r.certifications ?? r.certs ?? r.set_asides ?? "?")} naics=${JSON.stringify(r.naics ?? r.naics_codes ?? "?")}`);
    }
  }
})();
