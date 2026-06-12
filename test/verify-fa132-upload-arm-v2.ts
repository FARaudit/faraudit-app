// FA-132 gate — V2 shadow reaches the worker upload arm (anthropic_file_id).
// Run: set -a && source <(grep -E "^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SAM_API_KEY|ANTHROPIC_API_KEY|CLAUDE_TIMEOUT_MS)=" .env.local) && set +a && npx tsx test/verify-fa132-upload-arm-v2.ts
//
// CONTEXT: the original FA-132 approach (download the bytes back from the
// Anthropic Files API) is impossible — uploads are not downloadable (400,
// req_011CbytNVFqgY1KeB5HG8Rq2). The shipped design stashes bytes in Supabase
// Storage (bucket "audit-pdfs") at enqueue and the worker reads pdf_path.
//
// COST NOTE: U-layer runs a REAL audit (3 engine calls + V2 shadow) on the
// 536KB SPRRA126Q0034.pdf fixture — one paid end-to-end run, by design.
//
// Layers:
//   R — storage round-trip: stash → download → byte-identical (the exact
//       enqueue→worker channel), plus Files API upload for the V1 file_id.
//   U — upload-arm E2E: executeAudit with pdfFileId + storage-downloaded
//       buffer (exactly what worker buildInput now assembles) → audits row
//       complete with compliance_json.v2_shadow present, path "pdf", shaped.
//   S — sam_fetched arm unchanged: stored production row 8aa2bab9 keeps its
//       v2_shadow; the FA-132 diff touches only the anthropic_file_id branch.
//   G — FA-147 shape gate: missing-shadow-by-design (legacy rows) is NOT
//       degraded — the gate never inspects v2_shadow.

process.env.AUDIT_ENGINE_V2 = "true"; // engine reads at module init — set before imports
process.env.WORKER_SOURCE = "fa132_test";

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  console.log(`${cond ? "PASS" : "FAIL"} · ${name}${cond ? "" : " — " + detail}`);
  if (!cond) failures++;
}

async function main(): Promise<void> {
  const { uploadPdfToFilesApi, deletePdfFromFilesApi } = await import("../src/lib/anthropic-files");
  const { executeAudit, assertMinimumAuditShape } = await import("../src/lib/audit-executor");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

  // ── R · the enqueue→worker bytes channel ───────────────────────────────────
  const original = readFileSync("test/pdfs/SPRRA126Q0034.pdf");
  const pdfPath = `uploads/fa132-test-${original.length}.pdf`;
  await supabase.storage.from("audit-pdfs").remove([pdfPath]); // idempotent re-runs
  const { error: stashErr } = await supabase.storage.from("audit-pdfs").upload(pdfPath, original, { contentType: "application/pdf" });
  check("R1 storage stash (enqueue side)", !stashErr, stashErr?.message ?? "");
  const { data: blob, error: dlErr } = await supabase.storage.from("audit-pdfs").download(pdfPath);
  const downloaded = blob ? Buffer.from(await blob.arrayBuffer()) : Buffer.alloc(0);
  check("R2 storage download (worker side)", !dlErr && downloaded.length > 0, dlErr?.message ?? `len=${downloaded.length}`);
  check("R3 round-trip byte-identical", downloaded.equals(original), `up=${original.length} down=${downloaded.length}`);
  const { fileId } = await uploadPdfToFilesApi(original, "fa132-fixture.pdf");
  console.log("Files API file_id (V1 arm) →", fileId);

  let auditId: string | null = null;
  try {
    // ── U · upload-arm end-to-end (real engine run) ──────────────────────────
    const { data: ins, error: insErr } = await supabase
      .from("audits")
      .insert({ notice_id: "pdf-fa132-test", title: "FA-132 upload-arm fixture", status: "processing", audit_source: "user", solicitation_number: "SPRRA126Q0034" })
      .select("id")
      .single();
    if (insErr) throw new Error(`audits insert: ${insErr.message}`);
    auditId = ins.id as string;
    console.log("fixture audit row →", auditId, "· running executeAudit (real engine, ~1-2 min)…");

    await executeAudit(supabase, auditId, {
      solicitation: {
        noticeId: "pdf-fa132-test",
        solicitationNumber: "SPRRA126Q0034",
        title: "FA-132 upload-arm fixture",
        department: null, subTier: null, fullParentPathName: null,
        naicsCode: null, type: null, typeOfSetAside: null,
        postedDate: null, responseDeadLine: null,
        description: "(PDF upload: fa132-fixture.pdf — Claude reads attached document directly.)",
        resourceLinks: []
      },
      agency: null,
      pdfBuffer: downloaded,       // ← FA-132: bytes via the storage channel
      pdfBase64: null,
      pdfFileId: fileId,           // ← V1 reads the file_id, V2 reads the buffer
      imageBase64: null, imageMediaType: null,
      extractedText: null, extractedFormat: null,
      pdfSource: "uploaded_pdf_via_files_api",
      pdfUnavailableReason: null
    });

    const { data: row } = await supabase.from("audits").select("status,compliance_json").eq("id", auditId).single();
    const v2 = row?.compliance_json?.v2_shadow;
    check("U1 audit completed", row?.status === "complete", `status=${row?.status}`);
    check("U2 v2_shadow PRESENT on upload arm", !!v2, "v2_shadow missing — FA-132 not effective");
    check("U3 v2_shadow path is pdf (not metadata_only)", v2?.path === "pdf", `path=${v2?.path}`);
    check("U4 v2_shadow surfaces shaped", !!v2?.surfaces && "work_statement" in (v2.surfaces ?? {}) && "matrix_rollup" in (v2.surfaces ?? {}), `surface keys=${Object.keys(v2?.surfaces ?? {}).join(",")}`);
    check("U5 extraction block present", Array.isArray(v2?.extraction?.sections_detected));

    // ── S · sam_fetched arm unchanged (stored production evidence) ───────────
    const { data: sam } = await supabase.from("audits").select("compliance_json").eq("id", "8aa2bab9-485b-4abb-ad4e-70681380bdf0").single();
    check("S1 sam_fetched production row keeps its v2_shadow", !!sam?.compliance_json?.v2_shadow && sam.compliance_json.v2_shadow.path === "pdf");
    check("S2 sam_fetched row pdf_source unchanged", sam?.compliance_json?.pdf_source === "sam_fetched");

    // ── G · FA-147 gate: missing shadow ≠ degraded ───────────────────────────
    let gErr: unknown = null;
    try {
      assertMinimumAuditShape({ overview: { json: { summary: "x" } }, compliance: { json: { far_clauses: [] } }, risks: { json: { risk_findings: [] } } });
    } catch (e) { gErr = e; }
    check("G1 missing-shadow-by-design passes the shape gate", gErr === null, String(gErr));
  } finally {
    if (auditId) {
      await supabase.from("fa_intelligence_corpus").delete().eq("audit_id", auditId);
      await supabase.from("audits").delete().eq("id", auditId);
    }
    await supabase.storage.from("audit-pdfs").remove([pdfPath]);
    await deletePdfFromFilesApi(fileId);
    console.log("cleanup done (audit row + corpus + storage object + Files API file)");
  }

  console.log(failures === 0 ? "\nFA-132 gate: ALL PASS" : `\nFA-132 gate: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("FA-132 gate crashed:", e.message); process.exit(2); });
