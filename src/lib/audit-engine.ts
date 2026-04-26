// Three-call audit engine — Overview, Compliance, Risks run in parallel.
// Each call returns strict JSON which is parsed defensively.
// Optional PDF attachment is passed natively to Claude (no parsing library needed).

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = "claude-sonnet-4-6";

export interface OverviewJSON {
  summary?: string;
  scope?: string;
  primary_objective?: string;
  customer?: string;
  contract_type?: string;
  ceiling_value_estimate?: string | null;
  period_of_performance?: string;
}

export interface ComplianceJSON {
  far_clauses?: string[];
  dfars_clauses?: string[];
  required_certifications?: string[];
  set_aside_type?: string;
  small_business_eligibility?: string;
  key_compliance_actions?: string[];
  deadlines?: string[];
}

export interface RisksJSON {
  technical_risks?: string[];
  schedule_risks?: string[];
  price_risks?: string[];
  evaluation_risks?: string[];
  severity_score?: number;
  top_3_risks?: string[];
}

export interface AuditResult {
  overview: { summary: string; json: OverviewJSON };
  compliance: { summary: string; json: ComplianceJSON };
  risks: { summary: string; json: RisksJSON };
  compliance_score: number;
  recommendation: "PROCEED" | "PROCEED_WITH_CAUTION" | "DECLINE";
  bid_recommendation: string;
}

export interface AuditInput {
  solicitation: unknown;
  pdfBase64?: string | null;
}

function extractJSON(text: string | undefined): Record<string, unknown> | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch { /* fallthrough */ }
  }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)); } catch { /* fallthrough */ }
  }
  return null;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string } };

async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 1000,
  pdfBase64?: string | null
): Promise<string> {
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY not set");

  const content: ContentBlock[] = [];
  if (pdfBase64) {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: pdfBase64 }
    });
  }
  content.push({ type: "text", text: userPrompt });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content }]
    }),
    signal: AbortSignal.timeout(50000)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || "";
}

export async function runAudit(input: AuditInput): Promise<AuditResult> {
  const { solicitation, pdfBase64 } = input;
  const solText = JSON.stringify(solicitation).slice(0, 4000);
  const pdfNote = pdfBase64 ? "The full solicitation PDF is attached as a document — read it directly." : "";

  const overviewPrompt = `${pdfNote}

SAM.gov metadata:
${solText}

Return STRICT JSON in this exact shape:
{
  "summary": "2-3 sentence executive summary",
  "scope": "what is being procured",
  "primary_objective": "core deliverable or outcome",
  "customer": "buying agency / program office",
  "contract_type": "FFP / CPFF / IDIQ / BPA / etc",
  "ceiling_value_estimate": "$X-Y million OR null if not stated",
  "period_of_performance": "duration with start/end if known"
}`;

  const compliancePrompt = `${pdfNote}

SAM.gov metadata:
${solText}

Return STRICT JSON in this exact shape:
{
  "far_clauses": ["52.212-1", "52.212-4"],
  "dfars_clauses": ["252.204-7012"],
  "required_certifications": ["SAM.gov registration", "UEI", "..."],
  "set_aside_type": "Total SB / 8(a) / WOSB / SDVOSB / HUBZone / None",
  "small_business_eligibility": "yes / no / depends on NAICS size standard",
  "key_compliance_actions": ["specific action items a small business must do"],
  "deadlines": ["question deadline: YYYY-MM-DD", "proposal due: YYYY-MM-DD"]
}`;

  const risksPrompt = `${pdfNote}

SAM.gov metadata:
${solText}

Return STRICT JSON in this exact shape:
{
  "technical_risks": ["specific technical challenge 1", "..."],
  "schedule_risks": ["timeline pressure 1", "..."],
  "price_risks": ["margin or pricing risk 1", "..."],
  "evaluation_risks": ["how proposals are evaluated and where to lose points"],
  "severity_score": 0,
  "top_3_risks": ["the three deal-breakers in priority order"]
}
severity_score is 0-10 where 10 is highest overall risk.`;

  const [overviewText, complianceText, risksText] = await Promise.all([
    callClaude(
      "You are a federal contract analyst. Output ONLY valid JSON in the requested shape — no prose, no markdown commentary outside the JSON.",
      overviewPrompt,
      800,
      pdfBase64
    ),
    callClaude(
      "You are a federal procurement compliance officer. Extract every FAR/DFARS clause, certification, and eligibility requirement explicitly named in the solicitation. Output ONLY valid JSON.",
      compliancePrompt,
      1200,
      pdfBase64
    ),
    callClaude(
      "You are a senior capture manager scoring risks on a federal opportunity. Identify the highest-impact risks for a small defense contractor. Output ONLY valid JSON.",
      risksPrompt,
      1000,
      pdfBase64
    )
  ]);

  const overviewJson = (extractJSON(overviewText) as OverviewJSON) || {};
  const complianceJson = (extractJSON(complianceText) as ComplianceJSON) || {};
  const risksJson = (extractJSON(risksText) as RisksJSON) || {};

  // Composite scoring
  const farCount = complianceJson.far_clauses?.length || 0;
  const dfarsCount = complianceJson.dfars_clauses?.length || 0;
  const certCount = complianceJson.required_certifications?.length || 0;
  const severity = typeof risksJson.severity_score === "number" ? risksJson.severity_score : 5;

  const complexityPenalty = Math.min(40, (farCount + dfarsCount + certCount) * 1.5);
  const riskPenalty = severity * 5;
  const compliance_score = Math.max(0, Math.min(100, Math.round(100 - complexityPenalty - riskPenalty)));

  let recommendation: AuditResult["recommendation"];
  if (compliance_score >= 70) recommendation = "PROCEED";
  else if (compliance_score >= 40) recommendation = "PROCEED_WITH_CAUTION";
  else recommendation = "DECLINE";

  const topRisk = risksJson.top_3_risks?.[0] || "—";
  const bid_recommendation = `${recommendation}. Score ${compliance_score}/100. Top risk: ${topRisk}.`;

  return {
    overview: {
      summary: overviewJson.summary || "",
      json: overviewJson
    },
    compliance: {
      summary: `${farCount} FAR · ${dfarsCount} DFARS · ${certCount} certifications · ${complianceJson.set_aside_type || "no set-aside"}`,
      json: complianceJson
    },
    risks: {
      summary: `Severity ${severity}/10 · top: ${topRisk.slice(0, 80)}`,
      json: risksJson
    },
    compliance_score,
    recommendation,
    bid_recommendation
  };
}
