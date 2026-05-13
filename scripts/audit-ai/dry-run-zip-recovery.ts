/**
 * DRY_RUN validator for the DOCX/XLSX recovery path.
 *
 * Pulls every status='failed' audit row whose error_message contains the
 * 504b0304 ZIP magic byte string, re-fetches the SAM.gov source document
 * through the new fetchDocumentFromSam path, and runs the full runAudit
 * pipeline against the extracted text. Does NOT write to Supabase.
 *
 * Output: per-row outcome (success / extraction-fail / audit-fail) plus
 * aggregate summary. Cost: ~$0.04/row × 53 rows ≈ $2.12.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ROW_LIMIT = parseInt(process.env.DRY_RUN_LIMIT || "5", 10);
const SKIP_AUDIT = process.env.SKIP_AUDIT === "true";

type Outcome =
  | { row: string; status: "extracted"; format: string; bytes: number; textLen: number }
  | { row: string; status: "extract_fail"; reason: string }
  | { row: string; status: "audit_ok"; format: string; textLen: number; ms: number }
  | { row: string; status: "audit_fail"; format: string; reason: string };

async function main() {
  console.log(`=== DRY_RUN ZIP recovery · limit=${ROW_LIMIT} · skipAudit=${SKIP_AUDIT} ===\n`);

  const { data: rows } = await supabase
    .from("pending_audits")
    .select("notice_id, pdf_url, error_message")
    .eq("status", "failed")
    .like("error_message", "%504b0304%")
    .order("processed_at", { ascending: false })
    .limit(ROW_LIMIT);

  if (!rows || rows.length === 0) {
    console.log("No ZIP-failed rows found.");
    return;
  }

  console.log(`Processing ${rows.length} rows...\n`);

  // Dynamic imports AFTER dotenv.config — both modules capture env at load time.
  const pdfNs: any = await import("../../agents/audit-ai/pdf.ts");
  const fetchDocumentFromSam = pdfNs.fetchDocumentFromSam;
  const engineNs: any = await import("../../agents/audit-ai/audit-engine.ts");
  const runAudit = engineNs.runAudit;
  const outcomes: Outcome[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const label = `[${i + 1}/${rows.length}] ${r.notice_id?.slice(0, 12) || "?"}...`;
    console.log(label);

    // 1. Extract document
    let doc;
    try {
      doc = await fetchDocumentFromSam(r.pdf_url);
    } catch (e: any) {
      console.log(`  🟥 extract_fail: ${e.message.slice(0, 120)}`);
      outcomes.push({ row: r.notice_id, status: "extract_fail", reason: e.message.slice(0, 200) });
      continue;
    }

    if (doc.kind !== "text") {
      console.log(`  ⚠️  expected text, got ${doc.kind} — not in scope`);
      outcomes.push({ row: r.notice_id, status: "extract_fail", reason: "non-text kind: " + doc.kind });
      continue;
    }

    console.log(`  ✅ extracted: ${doc.format} · ${doc.bytes}B → ${doc.extractedText.length} chars`);

    if (SKIP_AUDIT) {
      outcomes.push({ row: r.notice_id, status: "extracted", format: doc.format, bytes: doc.bytes, textLen: doc.extractedText.length });
      continue;
    }

    // 2. Run audit
    const solicitation = {
      notice_id: r.notice_id,
      title: "(unknown — DRY_RUN)",
      sol_number: r.notice_id,
      pdf_url: r.pdf_url
    };

    const t0 = Date.now();
    try {
      const result = await runAudit({
        solicitation,
        pdfBase64: null,
        extractedText: doc.extractedText,
        extractedFormat: doc.format,
        pdfSource: "sam_text_extracted"
      });
      const ms = Date.now() - t0;
      const score = result?.compliance?.compliance_score ?? "?";
      console.log(`  ✅ audit_ok: score=${score} · ${ms}ms`);
      outcomes.push({ row: r.notice_id, status: "audit_ok", format: doc.format, textLen: doc.extractedText.length, ms });
    } catch (e: any) {
      const ms = Date.now() - t0;
      console.log(`  🟥 audit_fail (${ms}ms): ${e.message.slice(0, 120)}`);
      outcomes.push({ row: r.notice_id, status: "audit_fail", format: doc.format, reason: e.message.slice(0, 200) });
    }
  }

  // Summary
  console.log("\n=== SUMMARY ===");
  const buckets: Record<string, number> = {};
  outcomes.forEach(o => {
    buckets[o.status] = (buckets[o.status] || 0) + 1;
  });
  Object.entries(buckets)
    .sort(([, a], [, b]) => b - a)
    .forEach(([k, v]) => console.log(`  ${v.toString().padStart(3)} × ${k}`));

  // Write audit JSON for inspection
  const fs = await import("node:fs/promises");
  const out = `/Users/josearodriguezjr./faraudit-app/ceo/dry-run-zip-recovery-${Date.now()}.json`;
  await fs.writeFile(out, JSON.stringify(outcomes, null, 2));
  console.log(`\nFull outcomes: ${out}`);
}

main().catch(e => { console.error(e); process.exit(1); });
