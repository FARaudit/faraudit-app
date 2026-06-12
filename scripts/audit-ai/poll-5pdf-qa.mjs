// One-shot: poll 5-PDF QA audits to complete + v2_shadow (STEP 2).
// Usage: node scripts/audit-ai/poll-5pdf-qa.mjs <audit_id> [<audit_id>...]
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ids = process.argv.slice(2);
if (ids.length === 0) { console.error("no audit ids"); process.exit(1); }

const deadline = Date.now() + 30 * 60_000;
const done = new Set();

while (done.size < ids.length && Date.now() < deadline) {
  for (const id of ids) {
    if (done.has(id)) continue;
    const { data, error } = await admin
      .from("audits")
      .select("id,status,error_message,solicitation_number,created_at,completed_at,compliance_json")
      .eq("id", id)
      .single();
    if (error) { console.log(id, "select err:", error.message); continue; }
    const shadow = !!data.compliance_json?.v2_shadow;
    const tag = `${data.solicitation_number} ${id.slice(0, 8)}`;
    if (data.status === "failed") {
      console.log(`${tag} FAILED: ${data.error_message}`);
      done.add(id);
    } else if (data.status === "complete" && shadow) {
      const ms = data.completed_at && data.created_at ? new Date(data.completed_at) - new Date(data.created_at) : null;
      const meta = data.compliance_json?.v2_shadow?.meta ?? {};
      console.log(`${tag} COMPLETE+SHADOW elapsed=${ms ? (ms / 1000).toFixed(0) + "s" : "?"} shadow_keys=${Object.keys(data.compliance_json.v2_shadow).join(",")} meta=${JSON.stringify(meta).slice(0, 200)}`);
      done.add(id);
    } else {
      console.log(`${tag} ${data.status}${data.status === "complete" ? " (awaiting shadow)" : ""}`);
    }
  }
  if (done.size < ids.length) await new Promise((r) => setTimeout(r, 20_000));
}
if (done.size < ids.length) console.log("TIMEOUT with pending:", ids.filter((i) => !done.has(i)).join(","));
