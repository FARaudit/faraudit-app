import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
(async () => {
  const { fetchSolicitationByNoticeId } = await import("../../src/lib/sam");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  for (const sol of ["SPRRA2-26-R-0034", "36C24126Q0569"]) {
    const { data, error } = await admin.from("pending_audits").select("notice_id, title, response_deadline").eq("solicitation_number", sol).limit(1);
    console.log(`${sol}: row=${!!data?.[0]} notice_id=${data?.[0]?.notice_id ?? "NONE"} deadline=${data?.[0]?.response_deadline ?? "?"} dbErr=${error?.message ?? "none"}`);
    if (data?.[0]?.notice_id) {
      try {
        const s = await fetchSolicitationByNoticeId(data[0].notice_id);
        console.log(`  fetch: ${s ? "OK title=" + (s.title ?? "").slice(0, 50) : "NULL"}`);
      } catch (e: any) { console.log(`  fetch THREW: ${String(e?.message ?? e).slice(0, 200)}`); }
    }
  }
})();
