// One-shot: enqueue a prod async re-run of SPRTA1-26-R-0081 (directive G
// evidence step). Mirrors enqueueAsyncAudit's insert pair exactly; the
// resident audit-worker claims it and runs executeAudit.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("missing supabase env (presence): url=" + !!url + " key=" + !!key);
  process.exit(1);
}
const admin = createClient(url, key);

const NOTICE_ID = "dac64ebd8f7c48a285c4d2ddbf40f540";
const USER_ID = "135cb5c6-f391-4c8b-a5f2-0088004ac797";

const { data: audit, error: insertError } = await admin
  .from("audits")
  .insert({
    notice_id: NOTICE_ID,
    solicitation_number: "SPRTA1-26-R-0081",
    title: "Frame, Front Aircraft",
    agency: "DEPT OF DEFENSE · DEFENSE LOGISTICS AGENCY",
    naics_code: "336412",
    set_aside: null,
    posted_date: "2026-06-02",
    response_deadline: "2026-07-31T15:00:00-05:00",
    user_id: USER_ID,
    status: "processing"
  })
  .select("id")
  .single();

if (insertError || !audit) {
  console.error("audits insert failed:", insertError?.message);
  process.exit(1);
}
console.log("audits row:", audit.id);

const { error: enqueueErr } = await admin.from("pending_audits").insert({
  notice_id: NOTICE_ID,
  solicitation_number: "SPRTA1-26-R-0081",
  title: "Frame, Front Aircraft",
  agency: "DEPT OF DEFENSE · DEFENSE LOGISTICS AGENCY",
  naics_code: "336412",
  set_aside: null,
  response_deadline: "2026-07-31T15:00:00-05:00",
  pdf_url: null,
  source: "user",
  status: "pending",
  user_id: USER_ID,
  audit_id: audit.id,
  anthropic_file_id: null,
  pdf_filename: null
});

if (enqueueErr) {
  await admin.from("audits").update({ status: "failed", error_message: "enqueue failed: " + enqueueErr.message }).eq("id", audit.id);
  console.error("pending_audits insert failed:", enqueueErr.message);
  process.exit(1);
}
console.log("enqueued pending_audits for audit", audit.id);
