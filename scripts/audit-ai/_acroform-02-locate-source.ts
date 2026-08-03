// $0 read-only. Find the download URL for the REAL SF-30 amendments of W50S6U26QA019, using what we already
// hold, before reaching outside. Prints URLs only — never a key, never a token (Rules 32/46).
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";

const AUDIT = "eab43ada-2baf-49e2-b224-a968df7864f3";

(async () => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: a } = await db.from("audits").select("notice_id, solicitation_number").eq("id", AUDIT).single();
  const noticeId = (a as any)?.notice_id;
  console.log(`audit ${AUDIT}\n  solicitation = ${(a as any)?.solicitation_number}\n  notice_id    = ${noticeId}`);

  const { data: p, error } = await db
    .from("pending_audits")
    .select("id, notice_id, pdf_url, pdf_path, pdf_filename, upload_docs, audit_id, status")
    .or(`audit_id.eq.${AUDIT},notice_id.eq.${noticeId}`)
    .limit(5);
  if (error) console.log("  pending_audits query error:", error.message);
  for (const r of (p ?? []) as any[]) {
    console.log(`\n  pending_audits ${r.id} status=${r.status}`);
    console.log(`    pdf_url      = ${r.pdf_url ?? "(null)"}`);
    console.log(`    pdf_path     = ${r.pdf_path ?? "(null)"}`);
    console.log(`    pdf_filename = ${r.pdf_filename ?? "(null)"}`);
    const docs = r.upload_docs;
    if (docs) {
      const s = typeof docs === "string" ? docs : JSON.stringify(docs);
      console.log(`    upload_docs  = ${s.length} chars`);
      for (const u of [...new Set([...s.matchAll(/https?:\/\/[^"'\\\s,\]}]{10,240}/g)].map((m) => m[0]))]) {
        console.log(`      ${u}`);
      }
    }
  }

  console.log("\n  SAM key present in env:", process.env.SAM_API_KEY ? "yes" : "NO");
  console.log("  Canonical SAM download shape: https://api.sam.gov/opportunities/v3/opportunities/<noticeId>/resources/download/zip?api_key=<key>");
  console.log("  Per-resource shape:           https://api.sam.gov/opportunities/v3/opportunities/resources/files/<resourceId>/download?api_key=<key>");
})();
