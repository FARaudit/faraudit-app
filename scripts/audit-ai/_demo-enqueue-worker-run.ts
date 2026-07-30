// Enqueue a WORKER-path audit for the demo user on a SAM notice — mirrors the front door's
// enqueueAsyncAudit insert shape field-for-field (audits row + pending_audits source='user').
// Why: the refetch route's 200s engine budget cannot host the fully-armed env on a multi-doc
// solicitation (prod 500 "budget exceeded" 2026-07-29); the worker runs the same executeAudit
// pipeline with CLAUDE_TIMEOUT_MS=600000 — the real production async path.
// Usage: npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_demo-enqueue-worker-run.ts <notice_id> [--apply]
import { createClient } from "@supabase/supabase-js";
import { classifyDocType, fetchSolicitationByNoticeId, resolveAgency, resolveOfficeLeaf } from "../../src/lib/sam";

const DEMO_USER = "135cb5c6-f391-4c8b-a5f2-0088004ac797";
const NOTICE = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!NOTICE) { console.error("usage: _demo-enqueue-worker-run.ts <notice_id> [--apply]"); process.exit(1); }

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const sol = await fetchSolicitationByNoticeId(NOTICE);
  if (!sol) { console.error("SAM fetch failed for notice"); process.exit(1); }
  const agency = resolveAgency(sol);
  console.log(`sol=${sol.solicitationNumber} title=${(sol.title ?? "").slice(0, 60)} naics=${sol.naicsCode} setAside=${sol.typeOfSetAside} deadline=${sol.responseDeadLine}`);
  if (!APPLY) { console.log("DRY RUN — pass --apply to enqueue."); return; }

  const { data: audit, error: e1 } = await admin.from("audits").insert({
    notice_id: sol.noticeId,
    solicitation_number: sol.solicitationNumber,
    title: sol.title,
    agency,
    office_leaf: resolveOfficeLeaf(sol),
    naics_code: sol.naicsCode,
    set_aside: sol.typeOfSetAside,
    document_type: classifyDocType(sol.type ?? null),
    posted_date: sol.postedDate,
    response_deadline: sol.responseDeadLine,
    user_id: DEMO_USER,
    status: "processing",
  }).select("id").single();
  if (e1 || !audit) { console.error("audits insert failed:", e1?.message); process.exit(1); }
  console.log(`audits row: ${audit.id}`);

  const { error: e2 } = await admin.from("pending_audits").insert({
    notice_id: sol.noticeId,
    solicitation_number: sol.solicitationNumber,
    title: sol.title,
    agency,
    naics_code: sol.naicsCode,
    set_aside: sol.typeOfSetAside,
    response_deadline: sol.responseDeadLine,
    pdf_url: sol.resourceLinks?.[0] ?? null,
    source: "user",
    status: "pending",
    user_id: DEMO_USER,
    audit_id: audit.id,
    anthropic_file_id: null,
    pdf_filename: null,
    pdf_path: null,
    upload_docs: null,
  });
  if (e2) {
    await admin.from("audits").update({ status: "failed", error_message: `enqueue failed: ${e2.message}` }).eq("id", audit.id);
    console.error("pending_audits insert failed (audits row marked failed):", e2.message);
    process.exit(1);
  }
  console.log(`enqueued — worker claims within its poll. Watch: audit_id=${audit.id}`);
})();
