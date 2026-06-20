// One-shot: enqueue a prod async re-run of HM047626R0039 (the 4-file demo set)
// to prove FA-196 engine fixes on deploy 0992195: SDVOSB=0 in v2_shadow +
// gate_conditions populated. Mirrors enqueueAsyncAudit's multi-file arm:
// stash each PDF in Storage bucket audit-pdfs, then one pending_audits row
// carrying upload_docs[{path,filename}]. solicitation_number=null so the
// worker derives the sol token + the engine extracts + SAM-cross-refs facts,
// exactly like a real user upload. The resident audit-worker claims it.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { readFileSync } from "fs";
dotenv.config({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("missing supabase env: url=" + !!url + " key=" + !!key); process.exit(1); }
const admin = createClient(url, key);

const USER_ID = "135cb5c6-f391-4c8b-a5f2-0088004ac797";
const DIR = "ceo/Solicitation + Export Reviews";
// Order: primary (SF-1449 Solicitation) first; form-first assembler re-detects anyway.
const FILES = [
  { local: `${DIR}/1. HM047626R0039 - Solicitation.pdf`,                    name: "HM047626R0039 - Solicitation.pdf" },
  { local: `${DIR}/1. HM047626R0039 - Attachment+1_Statement+of+Work.pdf`,  name: "HM047626R0039 - Attachment 1 - Statement of Work.pdf" },
  { local: `${DIR}/1. HM047626R0039 - Attachment+2_DD254.pdf`,             name: "HM047626R0039 - Attachment 2 - DD254.pdf" },
  { local: `${DIR}/1. HM047626R0039 - Attachment+3_Evaluation+Factors.pdf`, name: "HM047626R0039 - Attachment 3 - Evaluation Factors.pdf" },
];

const stamp = Date.now();
const noticeId = `pdf-${stamp}`;
const sanitize = (s) => s.replace(/[^a-zA-Z0-9.\-_]+/g, "_");

const uploadDocs = [];
for (let i = 0; i < FILES.length; i++) {
  const f = FILES[i];
  let buf;
  try { buf = readFileSync(f.local); } catch (e) { console.error("read failed:", f.local, e.message); process.exit(1); }
  const path = `uploads/${stamp}-${i}-${sanitize(f.name)}`;
  const { error: upErr } = await admin.storage.from("audit-pdfs").upload(path, buf, { contentType: "application/pdf", upsert: true });
  if (upErr) { console.error("storage upload failed:", path, upErr.message); process.exit(1); }
  uploadDocs.push({ path, filename: f.name });
  console.log(`stashed ${(buf.length/1024).toFixed(0)}KB → ${path}`);
}

const { data: audit, error: insErr } = await admin.from("audits").insert({
  notice_id: noticeId,
  solicitation_number: null,
  title: "HM047626R0039 — re-run (FA-196 verify)",
  user_id: USER_ID,
  status: "processing",
}).select("id").single();
if (insErr || !audit) { console.error("audits insert failed:", insErr?.message); process.exit(1); }
console.log("audits row:", audit.id);

const { error: enqErr } = await admin.from("pending_audits").insert({
  notice_id: noticeId,
  solicitation_number: null,
  title: "HM047626R0039 — re-run (FA-196 verify)",
  pdf_url: null,
  source: "user",
  status: "pending",
  user_id: USER_ID,
  audit_id: audit.id,
  anthropic_file_id: null,
  pdf_path: null,
  pdf_filename: FILES[0].name,
  upload_docs: uploadDocs,
});
if (enqErr) {
  await admin.from("audits").update({ status: "failed", error_message: "enqueue failed: " + enqErr.message }).eq("id", audit.id);
  console.error("pending_audits insert failed:", enqErr.message);
  process.exit(1);
}
console.log("ENQUEUED · audit_id=" + audit.id + " · notice=" + noticeId + " · 4 files");
