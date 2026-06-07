// Structured Outputs viability probe (2026-06-07).
//
// Brain ruling: before deciding between (a) document-extraction rebuild and
// (b) ship-with-variance + VM canonicalization, test (c) Anthropic Structured
// Outputs (GA as of 2025-11-13, beta header `structured-outputs-2025-11-13`
// deprecated but functional; output_config.format on the Messages API).
//
// Hypothesis: grammar-based sampling may sharply constrain the prose-
// enumeration drift we observed (submission_requirements_raw 25/22/19 on
// cycle-2 fixtures 56f90242 / 9ec53722 / 9562add9).
//
// This harness is PURE RESEARCH — no DB writes, no audit rows created. It
// makes 3 direct Anthropic API calls against the same source PDF the engine
// fetches, using the same cycle-2 facts-only overview prompt, with the
// structured-outputs JSON schema added. Reports counts + fingerprint overlap.
//
// Run:   npx dotenv -e .env.local -- tsx test/structured-outputs-probe.ts
// Env:   SAM_API_KEY + ANTHROPIC_API_KEY required (loaded via dotenv-cli)

import { fetchSolicitationByNoticeId } from "../src/lib/sam";
import { fetchPdfFromSamUrl } from "../src/lib/sam-pdf";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = "claude-sonnet-4-6";
const NOTICE_ID = "SPRRA126Q0034";
const NUM_RUNS = 3;

if (!ANTHROPIC_KEY) {
  console.error("ANTHROPIC_API_KEY not set in env");
  process.exit(1);
}

// Cycle-2 facts-only schema — Structured Outputs JSON Schema dialect.
// Constraints: additionalProperties: false on every object, required arrays
// list every property. No minLength/maxLength/min/max. Enum on contract_type.
const OVERVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary", "scope", "primary_objective", "customer", "contract_type",
    "ceiling_value_estimate", "period_of_performance",
    "solicitation_number_canonical", "bottom_line_item",
    "eval_basis_text", "evaluation_factors_raw",
    "submission_requirements_raw", "section_l_summary", "section_m_summary"
  ],
  properties: {
    summary: { type: "string" },
    scope: { type: "string" },
    primary_objective: { type: "string" },
    customer: { type: "string" },
    contract_type: { type: "string" },
    ceiling_value_estimate: { type: ["string", "null"] },
    period_of_performance: { type: "string" },
    solicitation_number_canonical: { type: ["string", "null"] },
    bottom_line_item: { type: ["string", "null"] },
    eval_basis_text: { type: ["string", "null"] },
    evaluation_factors_raw: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["rank", "name", "importance_text"],
        properties: {
          rank: { type: "integer" },
          name: { type: "string" },
          importance_text: { type: "string" }
        }
      }
    },
    submission_requirements_raw: {
      type: "array",
      items: { type: "string" }
    },
    section_l_summary: { type: "string" },
    section_m_summary: { type: "string" }
  }
};

// Verbatim copy of the Cycle-2 overview prompt body (sans SAM metadata header
// which we splice in per run). Source: src/lib/audit-engine.ts (8a233eb tip).
const OVERVIEW_PROMPT_BODY = `You are extracting FACTS from a federal solicitation. Output ONLY a JSON object with these keys — verbatim or factual paraphrase, no interpretive scoring:

- summary (string): 2-3 sentence factual paraphrase of what is being procured. No verdicts, no recommendations.
- scope (string): verbatim scope-of-work statement (or close paraphrase).
- primary_objective (string): the core deliverable or outcome as stated.
- customer (string): buying agency / program office name AS PRINTED (raw caps OK; downstream normalization is automated).
- contract_type (string): FFP, CPFF, CPIF, IDIQ, BPA, etc. Empty string "" if not stated.
- ceiling_value_estimate (string or null): "$X-Y million" if stated; null if not.
- period_of_performance (string): verbatim duration / start-end date range.
- solicitation_number_canonical (string or null): the exact solicitation number as it appears on the SF-18/SF-1449 cover page, hyphens and punctuation PRESERVED. Example: "SPRRA1-26-Q-0034" (with hyphens), not "SPRRA126Q0034" (squashed). null for metadata-only.
- bottom_line_item (string or null): ≤ 60 chars. ONE plain-English noun phrase describing what is being acquired, including quantity if specified. STRICT RULES (feeds the exec summary "is buying ___" frame — wrong shape breaks the sentence):
  • NO procurement verbs at start ("deliver", "provide", "supply", "procure", "furnish", "manufacture", "buy"). The sentence frame already has the verb.
  • NO clause numbers (FAR/DFARS), NO NSN, NO CAGE, NO P/N codes.
  • Plain lowercase noun phrase (except proper nouns + acronyms like UH-60, IDIQ).
  Good: "8 UH-60 actuator housings" · "5-year IDIQ for predictive-maintenance analytics" · "$2M ceiling for software development services".
  Bad: "Deliver 8 each Housing Assembly Actuator NSN:1680-01-137-3534" · "Predictive maintenance" (too vague).
  Null when no clean phrase is extractable.

§M / §L — RAW FACTS ONLY (status, meta, coverage, tone, fit-score are TS-derived):

- eval_basis_text (string or null): VERBATIM 1-2 sentence award-method statement from Section M as printed in the document (e.g. "Award will be made on a best-value tradeoff basis under FAR 15.101-1"). null if Section M is absent or this is metadata-only. (TS derives the rule citation + label from this text.)
- evaluation_factors_raw (object[]): one entry per evaluation factor stated in Section M, in stated order. Shape per entry: {rank: 1-indexed int, name: string, importance_text: string}. The importance_text is whatever the document literally says about the factor's weight or rank ("Most important", "Equal weight", "Least important · tradeoff lever", "30 points", or just the rank position if no weight is stated). NO coverage / coverage_pct / tone / note fields — those are TS-derived from the user's capability profile downstream. Empty array if §M is absent or metadata-only.
- submission_requirements_raw (string[]): EXHAUSTIVELY enumerate every concrete Section L requirement as a verbatim or close-verbatim imperative string. Include all of: page limits, submission portal + deadline, required volumes, format/font rules, reps & certs, oral presentation rules, demo requirements, past performance reference count, security clearance requirements, any "the offeror shall" / "the offeror must" statement that imposes a discrete submission action. This array is the SOLE source feeding the §09 Pre-flight Checklist surface — completeness is the acceptance gate. Empty array ONLY if §L is absent. NO status / meta fields — those are TS-derived via 6 regex buckets + a catch-all default.
- section_l_summary (string): verbatim 2-3 sentence summary of Section L proposal preparation instructions, or empty string "" if no §L.
- section_m_summary (string): verbatim 2-3 sentence summary of Section M evaluation criteria with weights/factors, or empty string "" if no §M.

NEVER FABRICATE §M or §L:
- Metadata-only (no PDF) → evaluation_factors_raw=[], submission_requirements_raw=[], eval_basis_text=null.
- Document is not a solicitation (Award Notice, attachment, sources-sought without §L/§M) → same empty/null shape.
- Section M absent → evaluation_factors_raw=[] and eval_basis_text=null.
- Section L absent → submission_requirements_raw=[].
- Never invent factors or requirements not in the document. Better empty than padded.

No prose, no markdown, JSON only.`;

interface RunResult {
  index: number;
  subreqCount: number;
  subreqs: string[];
  factorsCount: number;
  bottomLine: string | null;
  customer: string;
  scopeChars: number;
  sectionLChars: number;
  sectionMChars: number;
  apiMs: number;
  inputTokens?: number;
  outputTokens?: number;
  errored: boolean;
}

async function callAnthropicStructured(
  pdfBase64: string,
  systemPrompt: string,
  userPrompt: string
): Promise<{ json: any; usage: { input_tokens?: number; output_tokens?: number }; ms: number }> {
  const t0 = Date.now();
  const body = {
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    temperature: 0,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64
            }
          },
          { type: "text", text: userPrompt }
        ]
      }
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: OVERVIEW_SCHEMA
      }
    }
  };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY!,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "structured-outputs-2025-11-13,pdfs-2024-09-25",
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const ms = Date.now() - t0;
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 500)}`);
  }
  const data = await res.json();
  const textBlock = data.content?.find((b: any) => b.type === "text");
  if (!textBlock) throw new Error(`No text block in response: ${JSON.stringify(data).slice(0, 300)}`);
  return {
    json: JSON.parse(textBlock.text),
    usage: data.usage ?? {},
    ms
  };
}

function fingerprint(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════════════════════");
  console.log(`  STRUCTURED OUTPUTS VIABILITY PROBE — ${NOTICE_ID} · ${NUM_RUNS} runs`);
  console.log("═══════════════════════════════════════════════════════════════════════════════");
  console.log();

  // 1. Fetch SAM record
  console.log("Step 1 — fetching SAM record");
  const sol = await fetchSolicitationByNoticeId(NOTICE_ID);
  if (!sol) { console.error("SAM fetch failed"); process.exit(1); }
  console.log(`  noticeId=${sol.noticeId}  solnum=${sol.solicitationNumber}  resourceLinks=${sol.resourceLinks.length}`);

  // 2. Fetch PDF
  console.log("Step 2 — fetching PDF");
  const pdfUrl = sol.resourceLinks[0];
  if (!pdfUrl) { console.error("No PDF URL in resourceLinks"); process.exit(1); }
  const doc = await fetchPdfFromSamUrl(pdfUrl);
  if (doc.kind !== "pdf" || !doc.base64) { console.error(`PDF fetch unexpected kind=${doc.kind}`); process.exit(1); }
  const sizeMB = (doc.base64.length * 0.75 / 1024 / 1024).toFixed(2);
  console.log(`  PDF fetched · ${sizeMB} MB · ${doc.base64.length} base64 chars`);
  console.log();

  // 3. Build prompts
  const samText = `SAM.gov metadata:\nnoticeId: ${sol.noticeId}\nsolnum: ${sol.solicitationNumber}\ntitle: ${sol.title}\nfullParentPathName: ${sol.fullParentPathName}\nnaicsCode: ${sol.naicsCode}\npostedDate: ${sol.postedDate}\nresponseDeadLine: ${sol.responseDeadLine}\ntypeOfSetAside: ${sol.typeOfSetAside}\n\n`;
  const userPrompt = `${samText}${OVERVIEW_PROMPT_BODY}`;
  const systemPrompt = "You are a federal contract analyst. You output ONE valid JSON object — nothing before, nothing after, no markdown commentary.";

  // 4. Run N times
  const results: RunResult[] = [];
  for (let i = 0; i < NUM_RUNS; i++) {
    console.log(`Step 3.${i + 1} — Anthropic call ${i + 1}/${NUM_RUNS}`);
    try {
      const { json, usage, ms } = await callAnthropicStructured(doc.base64, systemPrompt, userPrompt);
      const sr = Array.isArray(json.submission_requirements_raw) ? json.submission_requirements_raw : [];
      const ef = Array.isArray(json.evaluation_factors_raw) ? json.evaluation_factors_raw : [];
      results.push({
        index: i,
        subreqCount: sr.length,
        subreqs: sr,
        factorsCount: ef.length,
        bottomLine: json.bottom_line_item ?? null,
        customer: String(json.customer ?? ""),
        scopeChars: String(json.scope ?? "").length,
        sectionLChars: String(json.section_l_summary ?? "").length,
        sectionMChars: String(json.section_m_summary ?? "").length,
        apiMs: ms,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        errored: false
      });
      console.log(`  ✓ ${ms} ms · subreq=${sr.length} · factors=${ef.length} · in=${usage.input_tokens} out=${usage.output_tokens}`);
    } catch (e: any) {
      console.log(`  ✗ ${e.message}`);
      results.push({
        index: i, subreqCount: -1, subreqs: [], factorsCount: -1, bottomLine: null, customer: "",
        scopeChars: 0, sectionLChars: 0, sectionMChars: 0, apiMs: 0, errored: true
      });
    }
  }
  console.log();

  // 5. Report
  console.log("═══════════════════════════════════════════════════════════════════════════════");
  console.log("  RESULTS");
  console.log("═══════════════════════════════════════════════════════════════════════════════");
  console.log();
  const pad = (s: any, n: number) => String(s).padStart(n);
  console.log(`  ${pad('run', 4)} | ${pad('subreq', 7)} | ${pad('factors', 8)} | ${pad('scope', 6)} | ${pad('§L sum', 7)} | ${pad('§M sum', 7)} | ${pad('ms', 6)} | bottom_line_item`);
  console.log(`  ${'-'.repeat(4)} | ${'-'.repeat(7)} | ${'-'.repeat(8)} | ${'-'.repeat(6)} | ${'-'.repeat(7)} | ${'-'.repeat(7)} | ${'-'.repeat(6)} | ${'-'.repeat(40)}`);
  for (const r of results) {
    const bli = (r.bottomLine ?? "").slice(0, 50);
    console.log(`  ${pad(r.index + 1, 4)} | ${pad(r.subreqCount, 7)} | ${pad(r.factorsCount, 8)} | ${pad(r.scopeChars, 6)} | ${pad(r.sectionLChars, 7)} | ${pad(r.sectionMChars, 7)} | ${pad(r.apiMs, 6)} | ${bli}`);
  }

  // 6. Dump full per-run output for content-level diff
  const fs = await import("node:fs");
  fs.writeFileSync("/tmp/so-probe-out.json", JSON.stringify(results, null, 2));
  console.log(`  full output written to /tmp/so-probe-out.json`);

  // 7. Brain Q1 verdict
  const counts = results.filter(r => !r.errored).map(r => r.subreqCount);
  console.log();
  if (counts.length < 2) {
    console.log("  ✗ INSUFFICIENT DATA — ≥2 successful runs needed.");
  } else if (new Set(counts).size === 1) {
    console.log(`  ✓✓✓ BYTE-STABLE — submission_requirements_raw[] = ${counts[0]} across all runs.`);
    console.log(`      Structured Outputs CLOSED the §09 flicker.`);
  } else {
    const min = Math.min(...counts), max = Math.max(...counts), spread = max - min;
    console.log(`  ✗ FLICKER PERSISTS — counts ${counts.join(', ')} · spread ${spread}`);

    // Fingerprint overlap
    const fps = results.filter(r => !r.errored).map(r => new Set(r.subreqs.map(fingerprint)));
    if (fps.length >= 2) {
      const allRunsIntersection = fps.reduce((a, b) => new Set(Array.from(a).filter(x => b.has(x))));
      const allRunsUnion = fps.reduce((a, b) => { const m = new Set(a); b.forEach(x => m.add(x)); return m; });
      console.log(`      fingerprint analysis: ${allRunsIntersection.size} present in ALL runs · ${allRunsUnion.size} total unique union · jaccard ${(allRunsIntersection.size / allRunsUnion.size).toFixed(2)}`);

      // Baseline reference (cycle-2 fixtures without structured outputs)
      console.log();
      console.log("  Baseline (cycle-2 8a233eb · NO structured outputs): A=25, B=22, C=19, 8 common, jaccard ≈ 0.17");
    }
  }

  console.log();
}

main().catch(e => { console.error(e); process.exit(1); });
