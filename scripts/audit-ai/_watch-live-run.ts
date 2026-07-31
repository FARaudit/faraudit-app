import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
const KNOWN = new Set(["583df921","95698f91","d25b3723"]);
(async () => {
  const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  let id: string | null = null, last = "", waited = 0;
  for (;;) {
    const { data } = await a.from("audits").select("id,solicitation_number,status,current_stage,error_message,created_at")
      .order("created_at", { ascending: false }).limit(5);
    const row = (data || []).find((r: any) => !KNOWN.has(String(r.id).slice(0, 8)));
    if (!row) {
      waited += 5;
      if (waited % 30 === 0) console.log(`[${new Date().toISOString().slice(11,19)}] waiting for the run to appear (${waited}s)`);
      if (waited > 420) { console.log("no new row after 7 min — is the front door dispatching?"); process.exit(1); }
      await new Promise(s => setTimeout(s, 5000)); continue;
    }
    if (!id) { id = String((row as any).id); console.log(`\nRUN DETECTED  ${id.slice(0,8)}  ${(row as any).solicitation_number}\n`); }
    const k = `${(row as any).status}/${(row as any).current_stage}`;
    if (k !== last) {
      console.log(`[${new Date().toISOString().slice(11,19)}] ${k}${(row as any).error_message ? "  ERR=" + String((row as any).error_message).slice(0,110) : ""}`);
      last = k;
    }
    if (["complete","failed","error"].includes(String((row as any).status))) {
      console.log(`\nTERMINAL: ${(row as any).status}   id=${id}`); process.exit(0);
    }
    await new Promise(s => setTimeout(s, 5000));
  }
})();
