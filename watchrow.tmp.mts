import dotenv from "dotenv";
dotenv.config({ path: "/Users/josearodriguezjr./faraudit-app/.env.local" });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const NID = "ff2bdde0444444928658777a6e09d7b9";
const t0 = Date.now();
let last = "";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
while (Date.now() - t0 < 600_000) {
  const { data: pa } = await sb.from("pending_audits").select("id, status, audit_id, claimed_at, attempts, error_message").eq("notice_id", NID).eq("source", "user").order("created_at", { ascending: false }).limit(1).maybeSingle();
  let auStatus = null, auStage = null, auErr = null;
  if (pa?.audit_id) {
    const { data: au } = await sb.from("audits").select("status, current_stage, error_message").eq("id", pa.audit_id).maybeSingle();
    auStatus = au?.status; auStage = au?.current_stage; auErr = au?.error_message;
  }
  const line = pa
    ? `row=${pa.status} claimed=${!!pa.claimed_at} attempts=${pa.attempts ?? 0} audit=${auStatus}/${auStage}${pa.error_message ? ` rowErr=${pa.error_message.slice(0,80)}` : ""}${auErr ? ` auErr=${auErr.slice(0,80)}` : ""} audit_id=${pa.audit_id}`
    : "no row";
  if (line !== last) { console.log(`[${Math.round((Date.now()-t0)/1000)}s] ${line}`); last = line; }
  if (pa && ["processed", "failed"].includes(pa.status)) { console.log("TERMINAL"); process.exit(0); }
  if (pa && auStatus && ["completed", "failed"].includes(auStatus) && pa.status !== "processing") { console.log("TERMINAL"); process.exit(0); }
  await sleep(8000);
}
console.log("TIMEOUT 10min");
