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
  type PdfSource,
  type ExternalBoundFacts
} from "@/lib/audit-engine";
import { fetchNaicsAppealAnchor, UNKNOWN_ANCHOR } from "@/lib/sam-history";

export class AuditPersistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditPersistError";
  }
}

// FA-147 — a structurally collapsed run must never persist as complete.
export class DegradedRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DegradedRunError";
  }
}

// FA-147 — minimum-shape assertion, the net for degradation modes we haven't
// met yet. THRESHOLD RATIONALE: this is deliberately the UNAMBIGUOUS
// structural floor — each of the three call outputs must exist as parsed,
// non-empty JSON. callWithRetry already retried (Sonnet → Opus escalation)
// before falling back to {}, so an empty object here means BOTH models failed
// to produce parseable output for that call: never a legitimate product, on
// any arm (full-doc, image, text, and the deliberate metadata-only path all
// populate all three). Anything stricter — minimum risk counts, clause-list
// floors, checklist lengths — would be a PRODUCT judgment about acceptable
// thinness and is explicitly NOT made here (Brain call, per FA-147 filing).
export function assertMinimumAuditShape(result: {
  overview: { json: object | null };
  compliance: { json: object | null };
  risks: { json: object | null };
}): void {
  const collapsed: string[] = [];
  for (const call of ["overview", "compliance", "risks"] as const) {
    const j = result[call].json;
    if (!j || typeof j !== "object" || Object.keys(j).length === 0) collapsed.push(call);
  }
  if (collapsed.length > 0) {
    throw new DegradedRunError(
      `degraded_run_shape: call output collapsed for [${collapsed.join(", ")}] — refusing to persist a thin report as complete`
    );
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

  // FA-147 — refuse to persist a structurally collapsed run as complete.
  // Throws DegradedRunError; the worker routes it to the FA-149 release path
  // (re-run, bounded by the attempt cap), the sync route surfaces a failure.
  assertMinimumAuditShape(result);

  // audit-engine 13f4743 emits score_confidence + is_not_solicitation on
  // the result root. Fold them into compliance_json so the renderer can
  // read them directly instead of falling back to its own derivation.
  // Persisted alongside compliance_score per the engine's honesty flags.
  //
  // Also fold notice_type (from the SAM v2 Solicitation interface — e.g.
  // "Sources Sought", "Presolicitation", "Solicitation") so the view-
  // model's prelim-mode classifier can read it. No new column needed.
  // FA-153 — capture the NAICS-appeal anchor from SAM version history.
  // posted_date is the LATEST version's date (amendments overwrite it); the
  // 10-day OHA clock runs from ORIGINAL issuance, restarting only for
  // NAICS/size-standard amendments (FAR 19.103(a)(1)). Best-effort: failure
  // yields nulls, and the view-model then says "verify issuance date on
  // SAM.gov" — it never falls back to posted_date.
  const appealAnchor = await fetchNaicsAppealAnchor(solicitation.noticeId).catch(() => UNKNOWN_ANCHOR);

  const persistedComplianceJson = {
    ...result.compliance.json,
    score_confidence: result.score_confidence ?? null,
    is_not_solicitation: result.is_not_solicitation ?? false,
    notice_type: solicitation.type ?? null,
    // FA-153 — JSON copy needs no migration; audits.original_posted_date is
    // the queryable column once 20260612150000 is applied.
    naics_appeal: {
      original_posted_date: appealAnchor.originalPostedDate,
      anchor_date: appealAnchor.anchorDate,
      naics_changed_by_amendment: appealAnchor.naicsChangedByAmendment,
      version_count: appealAnchor.versionCount,
      fetched_at: new Date().toISOString()
    }
  };

  const completeUpdate = {
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
  };

  let { error: updateError } = await supabase
    .from("audits")
    .update({ ...completeUpdate, original_posted_date: appealAnchor.originalPostedDate })
    .eq("id", auditId);

  // PGRST204 = column not in schema cache — migration 20260612150000 not yet
  // applied. Retry without the column so the audit still completes; the JSON
  // copy in compliance_json.naics_appeal carries the same fact.
  if (updateError && updateError.code === "PGRST204") {
    console.warn("[FA-153] audits.original_posted_date missing (migration pending) — persisting JSON copy only");
    ({ error: updateError } = await supabase.from("audits").update(completeUpdate).eq("id", auditId));
  }

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
  // FA-132 (Jun 12 2026) — uploaded_pdf_via_files_api on the async worker now
  // reaches V2 as well: the worker downloads the bytes back from the Files
  // API at claim time (see worker buildInput). Still out-of-scope: image and
  // text arms (no PDF bytes exist).
  const v2Buffer: Buffer | null = pdfBuffer ?? (pdfBase64 ? Buffer.from(pdfBase64, "base64") : null);
  if (AUDIT_V2_ENABLED && v2Buffer) {
    const v2Start = Date.now();
    try {
      // FA-131 — V1 vision output + SAM notice metadata are both in scope
      // here; pass them so V2's judgment never sees "unknown" for a fact
      // either source already bound (image-scan PDFs yield zero local facts).
      const v2External: ExternalBoundFacts = {
        v1: {
          solicitorNumber:
            result.overview.json.solicitation_number_canonical ??
            (typeof persistedComplianceJson.solicitation_number_canonical === "string"
              ? persistedComplianceJson.solicitation_number_canonical
              : null),
          contractType: result.overview.json.contract_type ?? null,
          issuingOffice: result.overview.json.customer ?? null,
          setAside:
            (typeof persistedComplianceJson.set_aside_type === "string" && persistedComplianceJson.set_aside_type
              ? persistedComplianceJson.set_aside_type
              : null) ?? persistedComplianceJson.set_aside_text ?? null,
        },
        sam: {
          title: solicitation.title,
          solicitorNumber: solicitation.solicitationNumber,
          naicsCode: solicitation.naicsCode,
          setAside: solicitation.typeOfSetAside,
          offerDueDate: solicitation.responseDeadLine,
          issuingOffice: agency,
        },
        // FA-139 — V1 vision's STRUCTURED lists fill V2 list gaps the same
        // way the scalars above do. Without this, image-scan PDFs leave V2's
        // clins/clauses/§L/§M empty → judgment vnotes contradict the rendered
        // report and §09 collapses to the 1-item due-date fallback.
        v1Structured: {
          clins: Array.isArray(persistedComplianceJson.clins) ? persistedComplianceJson.clins : [],
          clauses: [
            ...(Array.isArray(persistedComplianceJson.dfars_clauses) ? persistedComplianceJson.dfars_clauses : []),
            ...(Array.isArray(persistedComplianceJson.far_clauses) ? persistedComplianceJson.far_clauses : []),
          ],
          submissionRequirements: Array.isArray(result.overview.json.submission_requirements_raw)
            ? result.overview.json.submission_requirements_raw
            : [],
          evaluationFactors: Array.isArray(result.overview.json.evaluation_factors_raw)
            ? result.overview.json.evaluation_factors_raw
            : [],
        },
      };
      const v2Result = await runAuditV2(v2Buffer, v2External);
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
  // FA-149 — delete-before-insert so a reclaimed run that re-executes after
  // a worker death cannot duplicate corpus rows (the table has no unique
  // constraint to upsert against). Every other write in this pipeline is an
  // UPDATE keyed on auditId and tolerates retry; this insert was the one
  // non-idempotent step.
  try {
    const flags = (result.compliance.json.dfars_flags ?? []).filter((f) => f.detected);
    if (flags.length > 0) {
      await supabase.from("fa_intelligence_corpus").delete().eq("audit_id", auditId);
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
