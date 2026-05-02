import { supabase } from "./queue.js";
import type { AuditResult } from "../../src/lib/audit-engine.ts";
import type { Solicitation } from "../../src/lib/sam.ts";

// Bot-driven audit row source — keeps Audit AI runs distinguishable from
// CEO-uploaded audits in the same `audits` table. The route.ts uploads use
// auth.uid() as user_id; agent runs use null + audit_source = 'audit_ai'.
export const AUDIT_SOURCE = "audit_ai";

export interface RecordAuditInput {
  solicitation: Solicitation;
  result: AuditResult;
}

export interface RecordAuditOutput {
  audit_id: string | null;  // audits.id is UUID
  inserted_corpus_rows: number;
}

// LIVE-mode write. DRY_RUN callers should NOT invoke this.
export async function recordAudit(input: RecordAuditInput): Promise<RecordAuditOutput> {
  const { solicitation, result } = input;

  // Insert audits row. user_id stays null for bot runs — note this requires
  // the audits table user_id column to be nullable. If the FK is NOT NULL,
  // this will throw and we fall back gracefully (corpus rows still attempted
  // without an audit_id link).
  const auditPayload = {
    notice_id: solicitation.noticeId,
    solicitation_number: solicitation.solicitationNumber,
    title: solicitation.title,
    agency: solicitation.department,
    naics_code: solicitation.naicsCode,
    set_aside: solicitation.typeOfSetAside,
    posted_date: solicitation.postedDate,
    response_deadline: solicitation.responseDeadLine,
    user_id: null,
    audit_source: AUDIT_SOURCE,
    overview_summary: result.overview.summary,
    overview_json: result.overview.json,
    compliance_summary: result.compliance.summary,
    compliance_json: result.compliance.json,
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

  const { data: auditRow, error: auditErr } = await supabase
    .from("audits")
    .insert(auditPayload)
    .select("id")
    .single();
  if (auditErr) {
    // Hard-fail. Anthropic credits already burned producing the result — if we
    // can't persist, the orchestrator must mark the queue row failed (not
    // processed) so the next run retries cleanly.
    throw new Error(`audits insert failed: ${auditErr.message}`);
  }
  const auditId = (auditRow?.id as string) ?? null;

  // Mirror api/audit/route.ts: write trap detections to fa_intelligence_corpus.
  const flags = (result.compliance.json.dfars_flags ?? []).filter((f) => f.detected);
  let insertedCorpusRows = 0;
  if (flags.length > 0) {
    const corpusRows = flags.map((f) => ({
      audit_id: auditId,
      solicitation_id: solicitation.noticeId,
      trap_type: f.clause,
      was_caught: true,
      outcome: result.recommendation,
      metadata: {
        document_type: result.classification.document_type,
        severity: f.severity,
        title: f.title,
        source: AUDIT_SOURCE
      }
    }));
    const { error: corpusErr, count } = await supabase
      .from("fa_intelligence_corpus")
      .insert(corpusRows, { count: "exact" });
    if (corpusErr) {
      // Hard-fail. The audits row already persisted is fine to keep — but the
      // queue row stays 'failed' so we know corpus is incomplete. Manual repair
      // path: re-insert the corpus rows for that audit_id.
      throw new Error(`fa_intelligence_corpus insert failed: ${corpusErr.message}`);
    }
    insertedCorpusRows = count || corpusRows.length;
  }

  return { audit_id: auditId, inserted_corpus_rows: insertedCorpusRows };
}
