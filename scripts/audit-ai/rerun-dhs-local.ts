// Local re-run of the DHS Tucson audit (sol 70B01C26R00000080) through the
// LOCAL (fixed) engine — verifies the FACTS-law agency fix (SAM agency wins over
// the doc-keyword scan that mislabeled CBP as "National Geospatial-Intelligence
// Agency"). Replicates the worker's SAM-fetch branch of buildInput verbatim
// then calls executeAudit on local code (no deploy/worker-version ambiguity).
// Writes a NEW audit row (preserves the old NGA one for before/after).
//
// IMPORTANT: src/lib/sam{,-attachments}.ts capture process.env.SAM_API_KEY at
// MODULE-LOAD time. ESM hoists static imports above dotenv.config(), so the app
// modules MUST be dynamically imported AFTER env is loaded, or they run with an
// undefined key. (Same applies to the Anthropic key inside audit-executor.)
// Run: npx tsx scripts/audit-ai/rerun-dhs-local.ts
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { AuditExecutionInput } from "@/lib/audit-executor";
import type { PdfSource } from "@/lib/audit-engine";
import type { Solicitation } from "@/lib/sam";

dotenv.config({ path: ".env.local", quiet: true });
// The agency/NAICS bug lives in V2's metadata_brief (bindExternalFacts), so V2
// MUST be on to verify. Set before the dynamic import (module-load capture).
process.env.AUDIT_ENGINE_V2 = "true";

// Audit id to re-run (reads its notice/sol/agency, re-fetches docs, re-audits on
// LOCAL fixed code into a NEW row). Pass as argv[2]; defaults to the DHS NGA run.
const OLD_ID = process.argv[2] || "bbcbb971-d857-4f8b-bf60-237bc7957403";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // Dynamic import AFTER dotenv so module-load env capture sees the keys.
  const { fetchSolicitationByNoticeId } = await import("@/lib/sam");
  const { assembleSamDocumentSet } = await import("@/lib/sam-attachments");
  const { executeAudit } = await import("@/lib/audit-executor");

  const { data: old, error: e0 } = await admin
    .from("audits")
    .select("notice_id, solicitation_number, agency, naics_code, set_aside, posted_date, response_deadline, title, user_id")
    .eq("id", OLD_ID)
    .single();
  if (e0 || !old) throw new Error("cannot read source row: " + (e0?.message ?? "missing"));
  console.log(`source: sol=${old.solicitation_number} notice=${old.notice_id}`);
  console.log(`        agency(SAM/row)=${JSON.stringify(old.agency)}`);

  // --- buildInput, SAM-fetch branch (worker.ts:438-607, non-upload path) ---
  let solicitation = await fetchSolicitationByNoticeId(old.notice_id).catch((err) => {
    console.warn("SAM re-fetch threw:", err instanceof Error ? err.message : err);
    return null;
  });
  if (!solicitation) {
    console.warn("SAM search returned null — synthesizing solicitation from row (worker parity)");
    solicitation = {
      noticeId: old.notice_id,
      solicitationNumber: old.solicitation_number,
      title: old.title || "Untitled solicitation",
      department: null,
      subTier: null,
      fullParentPathName: null,
      naicsCode: old.naics_code,
      type: null,
      typeOfSetAside: old.set_aside,
      postedDate: null,
      responseDeadLine: old.response_deadline,
      description: "",
      resourceLinks: [],
    } as Solicitation;
  }

  const assembled = await assembleSamDocumentSet(old.notice_id, old.solicitation_number).catch((err) => {
    console.warn("doc-set assembly failed:", err instanceof Error ? err.message : err);
    return null;
  });
  if (!assembled?.primary) throw new Error("no ingestible primary from SAM — aborting (no $ spent)");
  console.log(
    `assembled: ${assembled.ingestion.files_ingested}/${assembled.ingestion.files_total} ingested · primary=${assembled.primary.name}`
  );

  const { data: created, error: e1 } = await admin
    .from("audits")
    .insert({
      notice_id: old.notice_id,
      solicitation_number: old.solicitation_number,
      title: old.title,
      agency: old.agency,
      naics_code: old.naics_code,
      set_aside: old.set_aside,
      posted_date: old.posted_date,
      response_deadline: old.response_deadline,
      user_id: old.user_id,
      status: "processing",
    })
    .select("id")
    .single();
  if (e1 || !created) throw new Error("insert failed: " + (e1?.message ?? "no row"));
  const auditId = created.id as string;
  console.log(`new audit row: ${auditId}`);

  const input: AuditExecutionInput = {
    solicitation,
    agency: old.agency,
    pdfBuffer: assembled.primary.buffer,
    pdfBase64: assembled.primary.base64,
    pdfFileId: null,
    imageBase64: null,
    imageMediaType: null,
    extractedText: null,
    extractedFormat: null,
    pdfSource: "sam_fetched" as PdfSource,
    pdfUnavailableReason: null,
    attachmentPdfs: assembled.attachments,
    primaryDocName: assembled.primary.name,
    ingestion: assembled.ingestion,
  };

  console.log("running executeAudit (Opus, ~$2)...");
  await executeAudit(admin, auditId, input);

  const { data: done } = await admin
    .from("audits")
    .select("status, agency, compliance_json")
    .eq("id", auditId)
    .single();
  const v2 = (done?.compliance_json as Record<string, unknown> | null)?.["v2_shadow"] as Record<string, unknown> | undefined;
  const mb = (v2?.["surfaces"] as Record<string, unknown> | undefined)?.["metadata_brief"] as Record<string, unknown> | undefined;
  console.log("\n=== RESULT ===");
  console.log("status:", done?.status);
  console.log("audits.agency:", JSON.stringify(done?.agency));
  console.log("metadata_brief.agency:", JSON.stringify(mb?.["agency"]));
  console.log("metadata_brief.naics_code:", JSON.stringify(mb?.["naics_code"]), "(DHS principal 237990)");
  console.log("NEW_AUDIT_ID=" + auditId);
}

main().catch((e) => {
  console.error("FATAL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
