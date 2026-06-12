// One-shot: enqueue one 5-PDF QA candidate as a prod async audit (STEP 2).
// Usage: node scripts/audit-ai/enqueue-5pdf-qa.mjs <solnum>
// Reads slate from /tmp/fa136-slate.json. Mirrors enqueueAsyncAudit's insert
// pair; pdf_url + anthropic_file_id stay null so the resident worker
// re-fetches the notice by notice_id and audits resourceLinks[0] (FA-136).
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { readFileSync } from "fs";
dotenv.config({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("missing supabase env (presence): url=" + !!url + " key=" + !!key);
  process.exit(1);
}
const admin = createClient(url, key);

const USER_ID = "135cb5c6-f391-4c8b-a5f2-0088004ac797";
const slate = JSON.parse(readFileSync("/tmp/fa136-slate.json", "utf8"));
const sol = process.argv[2];
const c = slate.find((x) => x.sol === sol);
if (!c) {
  console.error("solnum not in slate:", sol);
  process.exit(1);
}

const { data: audit, error: insertError } = await admin
  .from("audits")
  .insert({
    notice_id: c.noticeId,
    solicitation_number: c.sol,
    title: c.title,
    agency: c.agency,
    naics_code: c.naics,
    set_aside: c.setAside,
    posted_date: c.posted,
    response_deadline: c.deadline,
    user_id: USER_ID,
    status: "processing",
  })
  .select("id")
  .single();

if (insertError || !audit) {
  console.error("audits insert failed:", insertError?.message);
  process.exit(1);
}

const { error: enqueueErr } = await admin.from("pending_audits").insert({
  notice_id: c.noticeId,
  solicitation_number: c.sol,
  title: c.title,
  agency: c.agency,
  naics_code: c.naics,
  set_aside: c.setAside,
  response_deadline: c.deadline,
  pdf_url: null,
  source: "user",
  status: "pending",
  user_id: USER_ID,
  audit_id: audit.id,
  anthropic_file_id: null,
  pdf_filename: null,
});

if (enqueueErr) {
  await admin.from("audits").update({ status: "failed", error_message: "enqueue failed: " + enqueueErr.message }).eq("id", audit.id);
  console.error("pending_audits insert failed:", enqueueErr.message);
  process.exit(1);
}
console.log(c.sol + " enqueued audit_id=" + audit.id);
