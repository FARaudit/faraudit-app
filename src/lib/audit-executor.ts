// FA-116 — shared audit execution core.
//
// Extracted verbatim from src/app/api/audit/route.ts's try-block so the sync
// route and the resident audit-worker run the IDENTICAL pipeline: V1 3-call
// engine → persist complete → V2 shadow (inline-bytes or metadata-only,
// errors swallowed) → best-effort corpus inserts. Any future change to audit
// persistence lands in both consumers automatically — the alternative
// (worker re-implementing the block) is the V2-drift class that bit
// agents/audit-ai/audit-engine.ts (vendored copy lacks runAuditV2).
//
// Error contract:
//   - Engine/SAM/content errors THROW — caller marks the audits row failed.
//   - The complete-update persist failure throws AuditPersistError — the sync
//     route preserves its historical behavior (500 with auditId, row left in
//     'processing'); the worker treats it like any failure.
//   - V2 shadow + corpus failures are swallowed (parity with route).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Solicitation } from "@/lib/sam";
import {
  runAudit,
  runAuditV2,
  runAuditV2Metadata,
  AUDIT_V2_ENABLED,
  type PdfSource
} from "@/lib/audit-engine";

export class AuditPersistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditPersistError";
  }
}

export interface AuditExecutionInput {
  solicitation: Solicitation;
  agency: string | null;
  pdfBuffer: Buffer | null;
  pdfBase64: string | null;
  pdfFileId: string | null;
  imageBase64: string | null;
  imageMediaType: "image/jpeg" | "image/png" | null;
  extractedText: string | null;
  extractedFormat: "docx" | "xlsx" | "doc" | "txt" | null;
  pdfSource: PdfSource;
  pdfUnavailableReason: string | null;
}

export interface AuditExecutionResult {
  recommendation: string;
  compliance_score: number | null;
  bid_recommendation: string | null;
}

export async function executeAudit(
  supabase: SupabaseClient,
  auditId: string,
  input: AuditExecutionInput
): Promise<AuditExecutionResult> {
  const {
    solicitation,
    agency,
    pdfBuffer,
    pdfBase64,
    pdfFileId,
    imageBase64,
    imageMediaType,
    extractedText,
    extractedFormat,
    pdfSource,
    pdfUnavailableReason
  } = input;

  // ━━ Run three-call audit (engine sanitizes text + applies SECURITY_DIRECTIVE) ━━
  const result = await runAudit({ solicitation, pdfBase64, pdfFileId, imageBase64, imageMediaType, extractedText, extractedFormat, pdfSource, pdfUnavailableReason });

  // audit-engine 13f4743 emits score_confidence + is_not_solicitation on
  // the result root. Fold them into compliance_json so the renderer can
  // read them directly instead of falling back to its own derivation.
  // Persisted alongside compliance_score per the engine's honesty flags.
  //
  // Also fold notice_type (from the SAM v2 Solicitation interface — e.g.
  // "Sources Sought", "Presolicitation", "Solicitation") so the view-
  // model's prelim-mode classifier can read it. No new column needed.
  const persistedComplianceJson = {
    ...result.compliance.json,
    score_confidence: result.score_confidence ?? null,
    is_not_solicitation: result.is_not_solicitation ?? false,
    notice_type: solicitation.type ?? null
  };

  const { error: updateError } = await supabase
    .from("audits")
    .update({
      overview_summary: result.overview.summary,
      overview_json: result.overview.json,
      compliance_summary: result.compliance.summary,
      compliance_json: persistedComplianceJson,
      risks_summary: result.risks.summary,
      risks_json: result.risks.json,
      compliance_score: result.compliance_score,
      recommendation: result.recommendation,
      bid_recommendation: result.bid_recommendation,
      document_type: result.classification.document_type,
      document_type_rationale: result.classification.rationale,
      document_type_confidence: result.classification.confidence,
      status: "complete",
      completed_at: new Date().toISOString()
    })
    .eq("id", auditId);

  if (updateError) {
    throw new AuditPersistError(updateError.message);
  }

  // ━━ V2 shadow wire-up (AUDIT_ENGINE_V2=true, inline-bytes arms) ━━
  // Runs runAuditV2 after V1 success and persists structured V2 output
  // into compliance_json.v2_shadow. ZERO impact on V1 user response —
  // every error is swallowed; the client has already received V1's JSON
  // shape downstream. Visible in DB for inspection.
  //
  // Hotfix Jun 7 2026 — extended gate to include sam_fetched (the bulk of
  // prod traffic). Original gate only matched user uploads via pdfBuffer;
  // SAM-fetched PDFs land in pdfBase64 and skipped V2 entirely. Now we
  // derive a V2-eligible Buffer from whichever inline arm has bytes locally.
  // FA-130 (Jun 11 2026) — sam_pdf_via_files_api callers now retain the
  // fetched buffer and pass it as pdfBuffer, so that arm reaches V2 too.
  // Still out-of-scope: uploaded_pdf_via_files_api on the async worker (bytes
  // never reach the worker — uploaded at enqueue time), image and text arms.
  const v2Buffer: Buffer | null = pdfBuffer ?? (pdfBase64 ? Buffer.from(pdfBase64, "base64") : null);
  if (AUDIT_V2_ENABLED && v2Buffer) {
    const v2Start = Date.now();
    try {
      const v2Result = await runAuditV2(v2Buffer);
      const v2Shadow = {
        path: "pdf",
        judgment: v2Result.judgment,
        surfaces: {
          work_statement: v2Result.work_statement,
          work_statement_unknown: v2Result.work_statement_unknown,
          matrix_rollup: v2Result.matrix_rollup,
          submission_checklist_filtered: v2Result.submission_checklist_filtered,
          l02_catches: v2Result.l02_catches,
          confidence_notes: v2Result.confidence_notes,
          has_incumbent: v2Result.has_incumbent,
          metadata_brief: v2Result.metadata_brief ?? null,
          submission_preflight: v2Result.submission_preflight ?? null,
          recompete_signal: v2Result.recompete_signal ?? null,
          price_anchor: v2Result.price_anchor ?? null,
        },
        extraction: {
          sections_detected: Object.keys(v2Result.sectionBag.sections),
          missing_sections: v2Result.sectionBag.missingSections,
          warnings: v2Result.warnings,
          extraction_warnings: v2Result.facts.extractionWarnings,
        },
        rendered_at: new Date().toISOString(),
        engine_ms: Date.now() - v2Start,
      };
      const { error: shadowError } = await supabase
        .from("audits")
        .update({ compliance_json: { ...persistedComplianceJson, v2_shadow: v2Shadow } })
        .eq("id", auditId);
      if (shadowError) {
        console.error("[V2-SHADOW] db update failed (non-fatal):", shadowError.message);
      } else {
        console.log("[V2-SHADOW] stored for audit", auditId, "engine_ms=", v2Shadow.engine_ms);
      }
    } catch (err) {
      console.error("[V2-SHADOW] runAuditV2 failed (non-fatal):", err instanceof Error ? err.message : err);
    }
  } else if (AUDIT_V2_ENABLED && pdfSource === "sam_unavailable" && solicitation.description && solicitation.description.length > 50) {
    // ━━ Fix 8 — V2 metadata-only shadow path ━━
    // Fires when SAM returned a notice but no PDF was retrievable. Pure
    // deterministic synthesis: eligibility + deadline math + synopsis +
    // CO contact + missing-intel list. Zero LLM cost. Same v2_shadow
    // envelope as the PDF path so downstream consumers see one shape.
    const v2Start = Date.now();
    try {
      const v2Result = await runAuditV2Metadata({
        noticeId: solicitation.noticeId,
        title: solicitation.title,
        description: solicitation.description,
        naicsCode: solicitation.naicsCode,
        typeOfSetAside: solicitation.typeOfSetAside,
        postedDate: solicitation.postedDate,
        responseDeadLine: solicitation.responseDeadLine,
        noticeType: solicitation.type,
        agency,
      });
      const v2Shadow = {
        path: "metadata_only",
        judgment: v2Result.judgment,
        surfaces: {
          work_statement: null,
          work_statement_unknown: null,
          matrix_rollup: v2Result.matrix_rollup,
          submission_checklist_filtered: v2Result.submission_checklist_filtered,
          l02_catches: v2Result.l02_catches,
          confidence_notes: v2Result.confidence_notes,
          has_incumbent: false,
          metadata_brief: v2Result.metadata_brief ?? null,
          submission_preflight: v2Result.submission_preflight ?? null,
          recompete_signal: v2Result.recompete_signal ?? null,
          price_anchor: v2Result.price_anchor ?? null,
        },
        extraction: {
          sections_detected: [] as string[],
          missing_sections: [] as string[],
          warnings: v2Result.warnings,
          extraction_warnings: v2Result.facts.extractionWarnings,
        },
        rendered_at: new Date().toISOString(),
        engine_ms: Date.now() - v2Start,
      };
      const { error: shadowError } = await supabase
        .from("audits")
        .update({ compliance_json: { ...persistedComplianceJson, v2_shadow: v2Shadow } })
        .eq("id", auditId);
      if (shadowError) {
        console.error("[V2-SHADOW-META] db update failed (non-fatal):", shadowError.message);
      } else {
        console.log("[V2-SHADOW-META] stored for audit", auditId, "engine_ms=", v2Shadow.engine_ms);
      }
    } catch (err) {
      console.error("[V2-SHADOW-META] runAuditV2Metadata failed (non-fatal):", err instanceof Error ? err.message : err);
    }
  }

  // Best-effort intelligence-corpus write — every audit teaches the engine
  // what trap clauses fire on what document types. Failure here doesn't
  // disrupt the audit response.
  try {
    const flags = (result.compliance.json.dfars_flags ?? []).filter((f) => f.detected);
    if (flags.length > 0) {
      await supabase.from("fa_intelligence_corpus").insert(
        flags.map((f) => ({
          audit_id: auditId,
          solicitation_id: solicitation.noticeId,
          trap_type: f.clause,
          was_caught: true,
          outcome: result.recommendation,
          metadata: { document_type: result.classification.document_type, severity: f.severity }
        }))
      );
    }
  } catch {
    /* silent — corpus is best-effort */
  }

  return {
    recommendation: result.recommendation,
    compliance_score: result.compliance_score,
    bid_recommendation: result.bid_recommendation
  };
}
