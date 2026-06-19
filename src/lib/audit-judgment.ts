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

// Cycle 2 v2 — L02 catches and confidence notes upgraded from string[] to
// structured object[] per Design spec. Render surfaces need category/title/
// why_invisible/move + field/uncertain/assumption/resolve to populate the new
// templates without VM having to parse free-text. snake_case key convention
// matches Design HTML data-field attributes for 1:1 wire-up.
export interface AuditL02Catch {
  category: string;
  title: string;
  why_invisible: string;
  move: string;
}

export interface AuditConfidenceNote {
  field: string;
  uncertain: string;
  assumption: string;
  resolve: string;
}

export interface AuditJudgment {
  documentClassification: {
    type: "SOW" | "PWS" | "SOO" | "combined" | "unknown" | "wrong_doc" | "metadata_only";
    confidence: "high" | "medium" | "low";
    evidence: string;
    bidStrategy: string;
    // Fix 7 — populated only on the runAuditV2 wrong-doc short-circuit
    // path. Schema (LLM responses) never emits these; they're synthesized
    // by the engine for the pre-extraction detector exit.
    detected_form?: string;
    extracted_piid?: string | null;
  };
  risks: AuditRisk[];
  verdict: {
    bottomLine: string;
    goNoGoRecommendation: "go" | "no_go" | "conditional" | "wrong_doc";
    keyRisks: string[];
    complianceStatus: "compliant" | "risks_identified" | "critical_gaps";
    urgencyScore: number;
  };
  l02Catches: AuditL02Catch[];
  confidenceNotes: AuditConfidenceNote[];
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
    l02Catches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "title", "why_invisible", "move"],
        properties: {
          category: { type: "string" },
          title: { type: "string" },
          why_invisible: { type: "string" },
          move: { type: "string" },
        },
      },
    },
    confidenceNotes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "uncertain", "assumption", "resolve"],
        properties: {
          field: { type: "string" },
          uncertain: { type: "string" },
          assumption: { type: "string" },
          resolve: { type: "string" },
        },
      },
    },
  },
} as const;

// ── FA-131 — fact-binding provenance ──────────────────────────────────────
// Scalar header facts can be bound from three sources: deterministic local
// text extraction ("document"), the V1 vision pass ("v1_vision"), or SAM.gov
// notice metadata ("sam_metadata"). The engine fuses them (document wins,
// external sources fill gaps) and passes per-field provenance here so the
// prompt can mark each value and confine uncertainty notes to fields that
// are unbound across ALL sources.

export type ScalarFactKey =
  | "solicitorNumber"
  | "naicsCode"
  | "setAside"
  | "offerDueDate"
  | "contractType"
  | "issuingOffice";

// FA-139 — structured LISTS can also be externally bound (V1 vision fills
// V2 list gaps the same way FA-131 fills scalars). Tracking the source lets
// the prompt mark a vision-bound list as CONFIRMED, keeping the
// contradiction guard's "non-unknown ⇒ confirmed" rule consistent.
export type ListFactKey = "clins" | "clauses" | "submissionRequirements" | "evaluationFactors";

export type FactBindingSource = "document" | "v1_vision" | "sam_metadata";

export type BoundFactSources = Partial<Record<ScalarFactKey | ListFactKey, FactBindingSource>>;

function bindingLabel(boundSources: BoundFactSources | undefined, key: ScalarFactKey | ListFactKey): string {
  const s = boundSources?.[key];
  if (s === "v1_vision") return " [bound: vision extraction]";
  if (s === "sam_metadata") return " [bound: SAM.gov notice metadata]";
  return "";
}

// ── Prompt builder ────────────────────────────────────────────────────────

function buildJudgmentPrompt(facts: ExtractedFacts, boundSources?: BoundFactSources): string {
  const trapClauses = facts.clauses.filter((c) => c.isTrap);
  const criticalReqs = facts.submissionRequirements.filter((r) => r.isCritical);
  const lbl = (key: ScalarFactKey | ListFactKey) => bindingLabel(boundSources, key);
  // §03 FIX (FA-119): surface Section C / PWS body so the SOW/PWS/SOO classifier
  // can actually read the work statement instead of defaulting to "unknown".
  const scopeBlock = facts.workStatementText
    ? `\n\nWORK STATEMENT (Section C / attached PWS — read this to determine the document type SOW/PWS/SOO):\n${facts.workStatementText}\n`
    : "";

  return `You are a defense contract compliance expert. Analyze this solicitation and produce a structured audit judgment.

## Bound Facts (fused: deterministic local extraction · vision extraction · SAM.gov notice metadata)

A value marked [bound: …] was confirmed from that source. Every non-"unknown" value below is a CONFIRMED fact regardless of source.

**Solicitation:** ${facts.solicitorNumber ?? "unknown"}${facts.solicitorNumber ? lbl("solicitorNumber") : ""}
**NAICS:** ${facts.naicsCode ?? "unknown"}${facts.naicsCode ? lbl("naicsCode") : ""}
**Set-aside:** ${facts.setAside ?? "unknown"}${facts.setAside ? lbl("setAside") : ""}
**Offer due:** ${facts.offerDueDate ?? "unknown"}${facts.offerDueDate ? lbl("offerDueDate") : ""}
**Contract type:** ${facts.contractType ?? "unknown"}${facts.contractType ? lbl("contractType") : ""}
**Issuing office:** ${facts.issuingOffice ?? "unknown"}${facts.issuingOffice ? lbl("issuingOffice") : ""}

**CLINs (${facts.clins.length} found):**${facts.clins.length > 0 ? lbl("clins") : ""}
${facts.clins.map((c) => `- ${c.lineItem}: ${c.description.slice(0, 150)}${c.ambiguityFlag ? ` ⚠ ${c.ambiguityFlag}` : ""}`).join("\n") || "(none extracted)"}

**Delivery (${facts.delivery.length} items):**
${facts.delivery.map((d) => `- CLIN ${d.lineItem}: ${d.deliveryDate ?? "no date"} · FOB: ${d.fobType ?? "unspecified"} · DoDAAC: ${d.dodaac ?? "none"}`).join("\n") || "(none extracted)"}

**Clauses (${facts.clauses.length} total, ${trapClauses.length} traps):**${facts.clauses.length > 0 ? lbl("clauses") : ""}
${trapClauses.map((c) => `- TRAP: ${c.number} — ${c.title || "(title not extracted)"} — ${c.trapReason}`).join("\n")}
${facts.clauses.filter((c) => !c.isTrap).slice(0, 12).map((c) => `- ${c.number}${c.title ? " — " + c.title : ""}`).join("\n")}

**Submission requirements (${facts.submissionRequirements.length} found):**${facts.submissionRequirements.length > 0 ? lbl("submissionRequirements") : ""}
${criticalReqs.slice(0, 12).map((r) => `- [CRITICAL/${r.bucket}] ${r.text.slice(0, 140)}`).join("\n")}
${facts.submissionRequirements.filter((r) => !r.isCritical).slice(0, 5).map((r) => `- [${r.bucket}] ${r.text.slice(0, 100)}`).join("\n")}

**Evaluation factors:**${facts.evaluationFactors.length > 0 ? lbl("evaluationFactors") : ""}
${facts.evaluationFactors.map((e) => `- ${e.factor.slice(0, 100)}${e.weight ? ` (${e.weight})` : ""} [${e.method}]`).join("\n") || "(none extracted)"}

**Extraction warnings (pre-verified issues):**
${facts.extractionWarnings.length > 0 ? facts.extractionWarnings.map((w) => `- ${w}`).join("\n") : "None"}
${scopeBlock}
## Your task

1. Classify the document type (SOW / PWS / SOO / combined / unknown) — this changes the bid strategy.
   • SOW = Statement of Work (prescriptive — how to do the work)
   • PWS = Performance Work Statement (outcomes-based)
   • SOO = Statement of Objectives (offeror proposes approach)
   • combined = explicit hybrid
   • unknown = governing work statement was NOT in the extracted text (likely in an un-parsed attachment).
2. Identify all risks. Do NOT cap the list — surface every real risk, including P2s. Use 'id' = 'R01', 'R02', etc.
3. For DFARS traps already flagged above, confirm severity and add mitigation specifics.
4. Identify L02-class catches: items that pass clause checking but fail in contract execution. EACH catch is a STRUCTURED OBJECT:
     category      — short tag, e.g. "Lead-time · base access", "FOB · cost inclusion", "Submission · single point of failure"
     title         — one-sentence trap title
     why_invisible — why it passes clause-check but fails at execution (the "looks fine on paper" gap)
     move          — the SPECIFIC neutralizing action (verb-led, ≤2 sentences)
   L02 HARD CONSTRAINTS:
   • Every catch MUST be anchored to a specific item in the Bound Facts above — cite the exact CLIN, clause number, requirement text, or date it derives from inside why_invisible or move.
   • Execution-failure AREAS worth checking include payment-system document routing, installation/site access lead time, deadline timezone ambiguity, inspection-point/freight cost conflicts, supplier-performance-rating posting lag, and technical-data access gating. These are AREAS TO CHECK, not catches to copy — NEVER emit a catch that merely restates one of these areas without a document-specific anchor. If this document gives no evidence for an area, emit NOTHING for that area.
   • NEVER emit a catch premised on a fact that contradicts a bound fact above (e.g., no cost-reimbursement or accounting-system catches when Contract type is bound to FFP; no eligibility catches contradicting the bound Set-aside).
5. Each confidence note (CONDITION 1 fail-loud) is also a STRUCTURED OBJECT:
     field      — the specific field that's uncertain (e.g. "NAICS code", "Contract type", "CLIN list")
     uncertain  — one sentence stating WHAT couldn't be confirmed from the document
     assumption — one sentence stating WHAT was assumed in its place
     resolve    — one sentence stating HOW to confirm (e.g. "Verify against SF-1449 block 10")
6. Produce a plain-language verdict with urgency score 0-100.

Be precise. Cite section/clause references. Do not invent facts not present in the extracted data. For risks where the source data lacks a specific clause, set trapClause to null.

CONTRADICTION GUARD (FA-113 / FA-131):
Header facts may be bound from local text extraction, vision extraction, or SAM.gov notice metadata — a bound value is CONFIRMED regardless of source. DO NOT emit risks, l02Catches, or confidenceNotes claiming a field listed above is "missing", "not present", "not extracted", "unextractable", "could not be determined", "could not be confirmed", or "Unknown" when that field shows a non-"unknown" value in the Bound Facts header. Specifically: if Solicitation, NAICS, Set-aside, Offer due, Contract type, or Issuing office shows a non-"unknown" value above, do NOT generate a risk/note/catch asserting it is missing or unconfirmed. The ONLY fields you may flag as uncertain are those literally shown as "unknown" or "(none extracted)" above — i.e., unbound across ALL sources.
The same rule applies to the LISTS above (FA-139): if CLINs, Clauses, Submission requirements, or Evaluation factors show one or more entries — regardless of binding source — do NOT emit a risk/note/catch claiming that list is missing, empty, zero, or unextracted.

PLATFORM-NAME GUARD:
Never name a specific weapon system, aircraft, ship, or vehicle platform (e.g. "F/A-18", "H-60", "M1 Abrams") in any risk, catch, note, or verdict UNLESS that platform name appears verbatim in the Bound Facts or extracted document text above. Do NOT infer a platform from an NSN, FSC, part number, or agency name — if the document does not name the platform, refer to it generically ("the end item", "the supported platform").`;
}

// ── Main judgment function ────────────────────────────────────────────────

export async function runJudgment(facts: ExtractedFacts, boundSources?: BoundFactSources, modelOverride?: string): Promise<AuditJudgment> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set — judgment call cannot proceed");

  // MI-1 (2026-06-19): single-source the judgment model from the engine's
  // CLAUDE_MODEL (threaded via modelOverride) so the V2 verdict/score/catches
  // layer — the user-visible product — can never silently diverge from the V1
  // model again. AUDIT_MODEL stays as an explicit override hook; the literal
  // default tracks the engine decision (opus-4-8), no longer Sonnet.
  const model = modelOverride ?? process.env.AUDIT_MODEL ?? "claude-opus-4-8";
  const timeoutMs = Number(process.env.CLAUDE_TIMEOUT_MS) || 240000;

  const body = {
    // Cycle 2 v2: max_tokens raised 6000 → 10000. The schema upgrade
    // (l02Catches + confidenceNotes string[] → object[] with 4 keys each)
    // plus the unbounded risk list pushed real-world outputs past 6000-token
    // ceiling — F1 truncation observed at ~25K chars. 10000 leaves headroom
    // for 20+ risks · 10+ L02 catches · 8 confidence notes without truncation.
    model,
    max_tokens: 10000,
    // MI-1: temperature:0 is a Sonnet-only determinism lock — Opus 4.8 rejects
    // it with HTTP 400 ("temperature is deprecated for this model"). Gate it to
    // Sonnet, mirroring callClaude's /^claude-sonnet-/i gate in audit-engine.ts.
    ...(/^claude-sonnet-/i.test(model) ? { temperature: 0 } : {}),
    system:
      "You are a defense contract compliance expert. Respond only with the structured JSON requested. Be thorough on risks — do not cap the list.",
    messages: [{ role: "user", content: buildJudgmentPrompt(facts, boundSources) }],
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

// ── FA-141 — judgment self-consistency ─────────────────────────────────────
// A report may never assert two different values for the same fact. When a
// vnote hedges ("CMMC level not stated — assuming L2") while the judgment's
// own risks/L02 catches — or the bound facts / notice title — assert a
// concrete value (§05 risk: "CMMC Level 1 per PWS 1.6.21.1"), the assertion
// wins and the hedge dies. KO asks derive from risks (riskToClarificationAsk)
// so scanning risks covers them. Shared by the engine (fresh runs, post
// FA-113 filter) and the render-side FA-139 suppressor (historical corpus).

const FA141_MATCHERS: Array<{ id: string; subjectRe: RegExp; assertionRe: RegExp }> = [
  {
    id: "cmmc_level",
    subjectRe: /\bcmmc\b/i,
    assertionRe: /\bcmmc\b[\s\S]{0,30}?\b(?:level|lvl|l)\s*-?\s*[123]\b/i,
  },
  {
    id: "set_aside",
    subjectRe: /set.aside/i,
    assertionRe:
      /\b(?:total\s+small\s+business|8\s*\(\s*a\s*\)|(?:ed)?wosb|sdvosb|vosb|hubzone|unrestricted|full\s+and\s+open|small\s+business\s+set.aside)\b/i,
  },
  {
    id: "naics",
    subjectRe: /\bnaics\b/i,
    assertionRe: /\bnaics\b[\s\S]{0,30}?\b\d{6}\b/i,
  },
  {
    id: "deadline",
    subjectRe: /due\s*date|deadline|response\s*date|closing\s*date|offer\s*due/i,
    assertionRe:
      /(?:due|deadline|close[sd]?|closing|responses?\s+by|submit(?:ted)?\s+by|no\s+later\s+than|\bnlt\b)[\s\S]{0,60}?(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+\d{4})/i,
  },
  {
    id: "doc_type",
    subjectRe: /work\s*statement\s*type|document\s*type|\btype\b[\s\S]{0,20}\b(?:sow|pws|soo)\b|\b(?:sow|pws|soo)\b[\s\S]{0,20}\btype\b/i,
    assertionRe: /document\s*type\s*[:=]\s*(?:sow|pws|soo|combined)\b/i,
  },
  // FA-143 — delivery family. Hedges like "no delivery dates extracted" /
  // "zero delivery items" / "no FOB confirmed" die when §03 CLIN bodies,
  // §04 rows, or §05 risks quote a Section-F schedule, a DoDAAC, or an FOB
  // designation (ROV: 6-week cite + DoDAACs in §04; DOJ: "FOB: Destination"
  // in §05; DLA: CLIN "Required Delivery: 15 DEC 2026").
  {
    id: "delivery",
    subjectRe: /delivery[\s\S]{0,30}?(?:date|schedule|timeline|period|item|line)|(?:date|schedule)[\s\S]{0,30}?delivery/i,
    assertionRe:
      /delivery[\s\S]{0,60}?(?:\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s*\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s*\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d+\s*[\s-]?(?:week|day|month)s?|\baro\b)|\d+[\s-]*(?:week|day|month)s?[\s\S]{0,30}?delivery/i,
  },
  {
    id: "dodaac",
    subjectRe: /\bdodaac/i,
    // Case-SENSITIVE code shape with a required digit — /i would let an
    // uppercase word like "STATED" pass for a DoDAAC.
    assertionRe: /D[oO]DAAC[\s\S]{0,30}?\b[A-Z](?=[A-Z0-9]*\d)[A-Z0-9]{5}\b/,
  },
  {
    id: "fob",
    subjectRe: /\bfob\b/i,
    assertionRe: /\bfob\b[\s\S]{0,15}?(?:origin|destination|government|contractor)/i,
  },
];

function titleDefinesAcronym(subject: string, title: string): string | null {
  const acronyms = subject.match(/\b[A-Z]{3,6}\b/g) ?? [];
  if (acronyms.length === 0) return null;
  const upperTitle = title.toUpperCase();
  const initials = (title.match(/\b[A-Za-z]/g) ?? []).join("").toUpperCase();
  for (const a of acronyms) {
    if (upperTitle.includes(`(${a})`)) return a;
    if (initials.includes(a)) return a;
  }
  return null;
}

export function dropSelfContradictedNotes(
  notes: AuditConfidenceNote[],
  assertionTexts: Array<string | null | undefined>,
  title: string | null | undefined,
  context: string
): AuditConfidenceNote[] {
  if (notes.length === 0) return notes;
  const corpus = assertionTexts
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .join("\n");
  return notes.filter((n) => {
    const subject =
      typeof n.field === "string" && n.field.trim().length > 0
        ? n.field
        : typeof n.uncertain === "string"
          ? n.uncertain
          : "";
    if (!subject) return true;
    for (const m of FA141_MATCHERS) {
      if (m.subjectRe.test(subject) && m.assertionRe.test(corpus)) {
        console.warn(`[FA-141] ${context} dropped vnote (${m.id} asserted elsewhere): "${subject}"`);
        return false;
      }
    }
    if (title && title.trim().length > 0) {
      const acr = titleDefinesAcronym(subject, title);
      if (acr) {
        console.warn(`[FA-141] ${context} dropped vnote (acronym ${acr} defined by title): "${subject}"`);
        return false;
      }
    }
    return true;
  });
}
