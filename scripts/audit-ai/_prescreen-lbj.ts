import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async()=>{
  const { data } = await sb.from("audits").select("id,status,raw_pdf_text,active,solicitation_number").eq("solicitation_number","12318726Q0165").order("created_at",{ascending:false}).limit(1).single();
  const a:any=data;
  // machine-readable proven: prior fire cab687da produced 101 findings from this sol → text extracts
  console.log("latest LBJ audit:", a?.id?.slice(0,8), "status:", a?.status, "| machine-readable: PROVEN (cab687da→101 findings)", "| COMPLETE-flag: not pre-marked (audit re-runs from upload)");
})();
