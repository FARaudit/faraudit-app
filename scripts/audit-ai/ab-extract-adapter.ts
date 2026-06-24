// STAGE 4 — pure, SYMMETRIC extraction adapter for the measured A/B (NO API).
//
// The A/B is only honest if BOTH engines are reduced to the gold-set's 4-tuple
// (clauses · requirements · evalFactors · gates) by the SAME rules. A biased adapter
// (e.g. richer clause-number parsing for the new engine) would manufacture a win.
// So every cross-engine normalization lives here ONCE and is applied to both:
//   - clause NUMBERS are pulled by one regex from either engine's clause strings;
//   - requirement / eval-factor text is passed verbatim (gold-set-score.normKey then
//     whitespace/case-folds both sides identically);
//   - GATES are derived by ONE controlled-vocabulary detector over each engine's
//     native signals — so "CMMC L2" vs "CMMC Level 2" can't cost a fair match.
//
// Pure + deterministic → proven in the no-API gate (test-agentic-ingest.ts). The paid
// ab-run.ts wraps these. See ceo/AGENTIC-ENGINE-REBUILD-PLAN.md Stage 4.

import type { EngineExtraction } from "./gold-set-score";
import { extractClauseNumbers, CLAUSE_NUMBER_RE_SOURCE, type ExtractedFacts } from "../../src/lib/section-extractors";
import type { AuditResult } from "../../src/lib/audit-engine";
import type { StructuredUsage } from "../../src/lib/anthropic-structured";

// ── Clause-number canonicalization ────────────────────────────────────────────
// REUSE the engine's CANONICAL clause-number regex (section-extractors.ts) — the
// single source of truth that binds REAL prefixes (5X52|5352|252|52), so it catches
// AFFARS 5352.x base-access traps (a DFARS_TRAPS_MAP entry) and REJECTS junk tokens
// like "999.123-4". A private copy here drifted from it on both counts (review
// 2026-06-24). Pull the NUMBER out of any string ("52.204-7 System for Award
// Management" → "52.204-7"); applied to BOTH engines → symmetric.
const CLAUSE_RE = new RegExp(`\\b${CLAUSE_NUMBER_RE_SOURCE}\\b`);
export function clauseNumber(raw: string): string | null {
  const m = CLAUSE_RE.exec(raw ?? "");
  return m ? m[0] : null;
}
function clauseNumbers(raws: string[]): string[] {
  return [...new Set(raws.flatMap(extractClauseNumbers))];
}

// ── Controlled gate vocabulary ────────────────────────────────────────────────
// Named HARD gates a bid can die on. Both the adjudicated gold set AND the gate
// detector below emit ONLY these canonical tokens, so gate-recall measures presence,
// not wording. Add a token here (not ad-hoc in one engine) when a new gate matters.
export const GATE_TOKENS = [
  "CMMC",              // CMMC certification required to be eligible
  "CUI-7012",          // DFARS 252.204-7012 safeguarding CUI / NIST 800-171
  "SET-ASIDE",         // 8(a)/SDVOSB/WOSB/HUBZone/SB eligibility gate
  "WAGE-DETERMINATION",// SCA/DBA wage floor (a missed WD floor loses on price)
  "OCI",               // organizational conflict of interest
  "TINA",              // Truth in Negotiations / certified cost & pricing data
  "SECURITY-CLEARANCE",// facility/personnel clearance prerequisite
  "BUY-AMERICAN",      // BAA/TAA domestic-content gate
] as const;
export type GateToken = (typeof GATE_TOKENS)[number];

/** Signals a gate detector reads — every field optional so each engine feeds what it
 *  natively has. The detector is the SAME function for both → symmetric. */
export interface GateSignals {
  clauseNumbers: string[];
  text: string; // concatenated free-text the engine surfaced (certs, set-aside, risks, warnings, reqs)
}

const lc = (s: string) => (s ?? "").toLowerCase();
export function detectGates(sig: GateSignals): GateToken[] {
  const nums = new Set(sig.clauseNumbers);
  const t = lc(sig.text);
  const hits = new Set<GateToken>();

  // CMMC — DFARS 252.204-7021 OR explicit text.
  if (nums.has("252.204-7021") || /\bcmmc\b/.test(t)) hits.add("CMMC");
  // CUI safeguarding — DFARS 252.204-7012 OR NIST 800-171 / CUI language.
  if (nums.has("252.204-7012") || /\b800-171\b|controlled unclassified|\bcui\b/.test(t)) hits.add("CUI-7012");
  // Set-aside eligibility — any small-business program named.
  // NB: no trailing \b after 8\(a\) — ")" is non-word, so "8(a) " would never match a boundary.
  if (/8\(a\)|sdvosb|service-disabled|wosb|women-owned|hubzone|set[- ]aside\b/.test(t)) hits.add("SET-ASIDE");
  // Wage determination / SCA / DBA floor.
  if (/wage determination|service contract act|\bsca\b|davis-bacon|prevailing wage/.test(t)) hits.add("WAGE-DETERMINATION");
  // OCI.
  if (/organizational conflict|\boci\b/.test(t)) hits.add("OCI");
  // TINA / certified cost & pricing.
  if (/truth in negotiations|\btina\b|certified cost (and|&) pricing|cost or pricing data/.test(t)) hits.add("TINA");
  // Clearance.
  if (/security clearance|facility clearance|personnel clearance|secret\b|top secret/.test(t)) hits.add("SECURITY-CLEARANCE");
  // Buy American / TAA.
  if (/buy american|trade agreements act|\btaa\b|domestic content/.test(t)) hits.add("BUY-AMERICAN");

  return [...hits];
}

// ── New (agentic) engine → EngineExtraction ───────────────────────────────────
export function agenticToExtraction(facts: ExtractedFacts): EngineExtraction {
  const clauses = clauseNumbers(facts.clauses.map((c) => c.number));
  const requirements = [
    ...facts.submissionRequirements.map((s) => s.text),
    ...(facts.performanceRequirements ?? []).map((p) => p.text),
  ].filter((s) => s && s.trim().length > 0);
  const evalFactors = facts.evaluationFactors.map((e) => e.factor).filter(Boolean);

  // Gate signals from the agentic engine's native surfaces.
  const gateText = [
    facts.setAside ?? "",
    ...facts.clauses.map((c) => `${c.title} ${c.trapReason ?? ""}`),
    ...requirements,
    ...(facts.extractionWarnings ?? []),
  ].join(" \n ");
  const gates = detectGates({ clauseNumbers: clauses, text: gateText });

  return { clauses, requirements, evalFactors, gates };
}

// ── Legacy engine → EngineExtraction ──────────────────────────────────────────
export function legacyToExtraction(result: AuditResult): EngineExtraction {
  const cj = result.compliance.json;
  const rj = result.risks.json;
  const clauses = clauseNumbers([...(cj.far_clauses ?? []), ...(cj.dfars_clauses ?? [])]);
  // Legacy types: SubmissionRequirement.requirement / EvaluationFactor.name (NOT the
  // agentic engine's .text / .factor — distinct interfaces in audit-engine.ts).
  const requirements = (cj.submission_requirements ?? []).map((s) => s.requirement).filter((s) => s && s.trim().length > 0);
  const evalFactors = (cj.evaluation_factors ?? []).map((e) => e.name).filter(Boolean);

  // Gate signals from the legacy engine's native surfaces.
  const riskText = [
    ...(rj.risk_findings ?? []).map((r) => (typeof r === "string" ? r : JSON.stringify(r))),
    rj.bid_no_bid_recommendation ?? "",
    rj.executive_risk_summary ?? "",
  ];
  const gateText = [
    cj.set_aside_text ?? "",
    // Raw clause STRINGS carry clause TITLES — fed to gate detection so a gate named
    // only in a clause title (e.g. "...CMMC...") fires on the legacy side too. SYMMETRIC
    // with the agentic arm feeding c.title; without this the A/B over-credited the new
    // engine's gate-recall (review 2026-06-24).
    ...(cj.far_clauses ?? []),
    ...(cj.dfars_clauses ?? []),
    ...(cj.required_certifications ?? []),
    ...(cj.key_compliance_actions ?? []),
    ...requirements,
    ...riskText,
  ].join(" \n ");
  const gates = detectGates({ clauseNumbers: clauses, text: gateText });

  return { clauses, requirements, evalFactors, gates };
}

// ── Cost ──────────────────────────────────────────────────────────────────────
// $/M-token. NB: cost-gate.mjs + simulate-audit-cost.mjs hold the SAME table (they're
// .mjs and can't import this .ts) — on an Anthropic reprice, update ALL THREE in
// lockstep or the A/B cost verdict drifts from the deploy cost-gate. Cache write 1.25× /
// read 0.10× of base input.
export const PRICE_PER_M: Record<string, { in: number; out: number }> = {
  "opus-4.8": { in: 5.0, out: 25.0 },
  "sonnet-4.6": { in: 3.0, out: 15.0 },
  "haiku-4.5": { in: 1.0, out: 5.0 },
};
const CACHE_WRITE_MULT = 1.25, CACHE_READ_MULT = 0.1, M = 1_000_000;

/** Map a model id (claude-opus-4-8 / opus-4.8 / haiku-4.5-2025…) onto a PRICE row. */
export function priceRowFor(model: string): { in: number; out: number } {
  const m = lc(model);
  if (/opus/.test(m)) return PRICE_PER_M["opus-4.8"];
  if (/sonnet/.test(m)) return PRICE_PER_M["sonnet-4.6"];
  if (/haiku/.test(m)) return PRICE_PER_M["haiku-4.5"];
  return PRICE_PER_M["opus-4.8"]; // unknown → price as the most expensive (never under-state)
}

export interface UsageLike {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_write?: number;
  cache_read?: number;
}

/** Sum a run's per-call usage into a single $ figure. Handles BOTH the new-engine
 *  StructuredUsage (carries cache write/read) and the legacy sink shape (no cache
 *  fields → treated as 0, i.e. all-uncached base input). Returns the dollar cost +
 *  token rollup so the A/B can report cost AND cache-hit health side by side. */
export function priceUsd(usages: UsageLike[]): {
  usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_write: number;
  cache_read: number;
  calls: number;
} {
  let usd = 0, input = 0, output = 0, cw = 0, cr = 0;
  for (const u of usages) {
    const p = priceRowFor(u.model);
    const baseIn = u.input_tokens || 0;
    const w = u.cache_write || 0;
    const r = u.cache_read || 0;
    const out = u.output_tokens || 0;
    usd += (baseIn / M) * p.in + (w / M) * p.in * CACHE_WRITE_MULT + (r / M) * p.in * CACHE_READ_MULT + (out / M) * p.out;
    input += baseIn; output += out; cw += w; cr += r;
  }
  return { usd, input_tokens: input, output_tokens: output, cache_write: cw, cache_read: cr, calls: usages.length };
}

// Re-export StructuredUsage so the runner imports one place.
export type { StructuredUsage };
