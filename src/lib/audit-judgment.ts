// Component 5 — Audit Judgment (Cycle 2)
//
// Single LLM call. Anthropic Structured Outputs (beta header still accepted,
// GA as of 2025-11-13). Schema-enforced output via output_config.format —
// eliminates the silent-{}-on-truncation failure class that plagued the
// 3-call baseline.
//
// Input: ExtractedFacts (already deterministic; no LLM saw the doc text yet)
// Output: AuditJudgment — typed, schema-validated
//
// Brain Condition 2 (FAIL LOUD on judgment failure):
//   - JSON parse failure throws (engine catches + flags)
//   - Schema mismatch throws (engine catches + flags)
//   - HTTP failure throws (engine catches + flags)
// No silent {} fallback at this layer.

import type { ExtractedFacts } from "./section-extractors";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_BETA = "structured-outputs-2025-11-13,pdfs-2024-09-25";

// ── Output types ──────────────────────────────────────────────────────────

export interface AuditRisk {
  id: string;
  title: string;
  severity: "P0" | "P1" | "P2";
  description: string;
  mitigation: string;
  sectionReference: string;
  isDfarsTrap: boolean;
  trapClause: string | null;
}

export interface AuditJudgment {
  documentClassification: {
    type: "SOW" | "PWS" | "SOO" | "combined" | "unknown";
    confidence: "high" | "medium" | "low";
    evidence: string;
    bidStrategy: string;
  };
  risks: AuditRisk[];
  verdict: {
    bottomLine: string;
    goNoGoRecommendation: "go" | "no_go" | "conditional";
    keyRisks: string[];
    complianceStatus: "compliant" | "risks_identified" | "critical_gaps";
    urgencyScore: number;
  };
  l02Catches: string[];
  confidenceNotes: string[];
}

// ── Strict JSON schema for Structured Outputs ─────────────────────────────
// Per Anthropic docs: every object needs additionalProperties: false +
// required listing every property name.

const JUDGMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["documentClassification", "risks", "verdict", "l02Catches", "confidenceNotes"],
  properties: {
    documentClassification: {
      type: "object",
      additionalProperties: false,
      required: ["type", "confidence", "evidence", "bidStrategy"],
      properties: {
        type: { type: "string", enum: ["SOW", "PWS", "SOO", "combined", "unknown"] },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        evidence: { type: "string" },
        bidStrategy: { type: "string" },
      },
    },
    risks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "severity", "description", "mitigation", "sectionReference", "isDfarsTrap", "trapClause"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          severity: { type: "string", enum: ["P0", "P1", "P2"] },
          description: { type: "string" },
          mitigation: { type: "string" },
          sectionReference: { type: "string" },
          isDfarsTrap: { type: "boolean" },
          trapClause: { type: ["string", "null"] },
        },
      },
    },
    verdict: {
      type: "object",
      additionalProperties: false,
      required: ["bottomLine", "goNoGoRecommendation", "keyRisks", "complianceStatus", "urgencyScore"],
      properties: {
        bottomLine: { type: "string" },
        goNoGoRecommendation: { type: "string", enum: ["go", "no_go", "conditional"] },
        keyRisks: { type: "array", items: { type: "string" } },
        complianceStatus: { type: "string", enum: ["compliant", "risks_identified", "critical_gaps"] },
        urgencyScore: { type: "integer" },
      },
    },
    l02Catches: { type: "array", items: { type: "string" } },
    confidenceNotes: { type: "array", items: { type: "string" } },
  },
} as const;

// ── Prompt builder ────────────────────────────────────────────────────────

function buildJudgmentPrompt(facts: ExtractedFacts): string {
  const trapClauses = facts.clauses.filter((c) => c.isTrap);
  const criticalReqs = facts.submissionRequirements.filter((r) => r.isCritical);

  return `You are a defense contract compliance expert. Analyze this solicitation and produce a structured audit judgment.

## Extracted Facts (deterministic — verified against source document)

**Solicitation:** ${facts.solicitorNumber ?? "unknown"}
**NAICS:** ${facts.naicsCode ?? "unknown"}
**Set-aside:** ${facts.setAside ?? "unknown"}
**Offer due:** ${facts.offerDueDate ?? "unknown"}
**Contract type:** ${facts.contractType ?? "unknown"}
**Issuing office:** ${facts.issuingOffice ?? "unknown"}

**CLINs (${facts.clins.length} found):**
${facts.clins.map((c) => `- ${c.lineItem}: ${c.description.slice(0, 150)}${c.ambiguityFlag ? ` ⚠ ${c.ambiguityFlag}` : ""}`).join("\n") || "(none extracted)"}

**Delivery (${facts.delivery.length} items):**
${facts.delivery.map((d) => `- CLIN ${d.lineItem}: ${d.deliveryDate ?? "no date"} · FOB: ${d.fobType ?? "unspecified"} · DoDAAC: ${d.dodaac ?? "none"}`).join("\n") || "(none extracted)"}

**Clauses (${facts.clauses.length} total, ${trapClauses.length} traps):**
${trapClauses.map((c) => `- TRAP: ${c.number} — ${c.title || "(title not extracted)"} — ${c.trapReason}`).join("\n")}
${facts.clauses.filter((c) => !c.isTrap).slice(0, 12).map((c) => `- ${c.number}${c.title ? " — " + c.title : ""}`).join("\n")}

**Submission requirements (${facts.submissionRequirements.length} found):**
${criticalReqs.slice(0, 12).map((r) => `- [CRITICAL/${r.bucket}] ${r.text.slice(0, 140)}`).join("\n")}
${facts.submissionRequirements.filter((r) => !r.isCritical).slice(0, 5).map((r) => `- [${r.bucket}] ${r.text.slice(0, 100)}`).join("\n")}

**Evaluation factors:**
${facts.evaluationFactors.map((e) => `- ${e.factor.slice(0, 100)}${e.weight ? ` (${e.weight})` : ""} [${e.method}]`).join("\n") || "(none extracted)"}

**Extraction warnings (pre-verified issues):**
${facts.extractionWarnings.length > 0 ? facts.extractionWarnings.map((w) => `- ${w}`).join("\n") : "None"}

## Your task

1. Classify the document type (SOW / PWS / SOO / combined) — this changes the bid strategy.
2. Identify all risks. Do NOT cap the list — surface every real risk, including P2s. Use 'id' = 'R01', 'R02', etc.
3. For DFARS traps already flagged above, confirm severity and add mitigation specifics.
4. Identify L02-class catches: items that pass clause checking but fail in contract execution (wrong WAWF document type, base access escort/credential lead time, timezone deadline traps, FOB conflicts, SPRS posting lag, JCP-required TDP access, etc.).
5. Produce a plain-language verdict with urgency score 0-100.

Be precise. Cite section/clause references. Do not invent facts not present in the extracted data. For risks where the source data lacks a specific clause, set trapClause to null.`;
}

// ── Main judgment function ────────────────────────────────────────────────

export async function runJudgment(facts: ExtractedFacts): Promise<AuditJudgment> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set — judgment call cannot proceed");

  const model = process.env.AUDIT_MODEL ?? "claude-sonnet-4-6";
  const timeoutMs = Number(process.env.CLAUDE_TIMEOUT_MS) || 240000;

  const body = {
    model,
    max_tokens: 6000,
    temperature: 0,
    system:
      "You are a defense contract compliance expert. Respond only with the structured JSON requested. Be thorough on risks — do not cap the list.",
    messages: [{ role: "user", content: buildJudgmentPrompt(facts) }],
    output_config: {
      format: {
        type: "json_schema",
        schema: JUDGMENT_SCHEMA,
      },
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-beta": ANTHROPIC_BETA,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic judgment call ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = await res.json();
  const textBlock = (data?.content as Array<{ type?: string; text?: string }> | undefined)?.find(
    (b) => b?.type === "text"
  );
  if (!textBlock || typeof textBlock.text !== "string") {
    throw new Error(
      `Structured output returned no text block — Condition 2 failure. Response keys: ${Object.keys(data ?? {}).join(", ")}`
    );
  }

  try {
    return JSON.parse(textBlock.text) as AuditJudgment;
  } catch (e) {
    throw new Error(
      `Structured output parse failed (schema enforcement may have silently failed): ${(e as Error).message} · first 200 chars: ${textBlock.text.slice(0, 200)}`
    );
  }
}
