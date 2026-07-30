// VEHICLE-F front-door PAID fire — FA813726R0033 (card #723, CEO in-words greenlight this conversation).
// Mirrors enqueueAsyncAudit's insert pair EXACTLY (template: rerun-r0220-async.mjs). The resident audit-worker
// claims the pending_audits row (source='user') and runs executeAudit over the FRESH SAM source — the real
// customer path (demo account = real customer path). NOT paid-run.ts (pre-extracted text is FORBIDDEN, Gauntlet).
//
//   node scripts/audit-ai/_vf-fire-fa0033.mjs --confirm-fire
//
// PAID. Requires --confirm-fire. Prints the new audit id to poll.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

if (!process.argv.includes("--confirm-fire")) {
  console.error("refusing to spend — pass --confirm-fire to enqueue the PAID front-door run.");
  process.exit(2);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("missing supabase env: url=" + !!url + " key=" + !!key); process.exit(1); }
const admin = createClient(url, key);

// Recovered live from prior FA813726R0033 audit rows (2ababbc3 / e63bd1e7 / 24eeea9b) — identical across all.
const NOTICE_ID = "f1bd87c034e547eaaaed450afad4dca1";
const SOL = "FA813726R0033";
const TITLE = "TINKER AFB MAC BOA-WWYK260007- Renovate Pratt & Whitney Area - B3001";
const AGENCY = "DEPT OF DEFENSE · DEPT OF THE AIR FORCE";
const NAICS = "236220";
const SET_ASIDE = "SBA";
const POSTED = "2026-07-08";
const DEADLINE = "2026-07-18T14:00:00-05:00";
const USER_ID = "135cb5c6-f391-4c8b-a5f2-0088004ac797"; // demo / CEO account

const { data: audit, error: insertError } = await admin
  .from("audits")
  .insert({
    notice_id: NOTICE_ID,
    solicitation_number: SOL,
    title: TITLE,
    agency: AGENCY,
    naics_code: NAICS,
    set_aside: SET_ASIDE,
    posted_date: POSTED,
    response_deadline: DEADLINE,
    user_id: USER_ID,
    status: "processing"
  })
  .select("id")
  .single();

if (insertError || !audit) { console.error("audits insert failed:", insertError?.message); process.exit(1); }
console.log("AUDIT_ID=" + audit.id);

const { error: enqueueErr } = await admin.from("pending_audits").insert({
  notice_id: NOTICE_ID,
  solicitation_number: SOL,
  title: TITLE,
  agency: AGENCY,
  naics_code: NAICS,
  set_aside: SET_ASIDE,
  response_deadline: DEADLINE,
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
console.log("ENQUEUED pending_audits for audit " + audit.id + " — worker will claim on next poll.");
