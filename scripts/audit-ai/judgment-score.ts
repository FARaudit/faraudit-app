// DETERMINISTIC no-AI JUDGMENT scorer (Brain schema 0.2-approved, 2026-06-25). Scores a panel output
// against the BLIND-authored, frozen judgment key. NO model calls. Code did NOT author the key entries —
// this only READS them. Clause recall is REPORTED, never scored (retracted as tautological).
import { createHash } from "node:crypto";
import {
  gateMatched, fabricatedClauses, type RaisedGate, type PanelVerdictLike,
} from "./gold-set-score";
import { classifyAcquisitionPart } from "../../src/lib/agentic-sections";
import { normClause } from "../../src/lib/section-extractors";

export interface JudgmentKey {
  schemaVersion: string;
  packageId: string;
  bidderProfile: Record<string, unknown> | null;     // null ⇒ no INELIGIBLE on bidder-side gates
  acquisitionPart: "PART_12" | "PART_15" | "UNKNOWN"; // scored pre-step
  expectedVerdict: { verdict: string; eligible: boolean; maxShowStoppers: number; reason?: string };
  namedGates: Array<{ token: string; aliases?: string[]; mustRaise: boolean; expectedDisposition: "met" | "unmet" | "caution"; sourceCite?: string }>;
  showStoppers: Array<{ description: string; sourceCite?: string; disqualifiesBecause: "bidder-structural" | "solicitation-defect" }>;
  cautionItems: Array<{ description: string; sourceCite?: string }>;
  decoys: Array<{ token: string; kind: "absent" | "boilerplate"; mustNotRaiseAtAll?: boolean; aliases?: string[] }>;
  adjudication?: { authoredBlind?: boolean; frozenAt?: string; sourceSha256?: string; keySha256?: string; adjudicatedBy?: string[] };
}

/** Canonical JSON of the key with the volatile/self-referential fields stripped, for hashing the ENTRIES
 *  (so keySha256 is stable regardless of when/by-whom it was frozen). Pure. */
export function canonicalKeyForHash(key: JudgmentKey): string {
  const k = JSON.parse(JSON.stringify(key)) as Record<string, unknown>;
  delete k.adjudication; // the adjudication block (incl keySha256 itself) is provenance, not entries
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((kk) => [kk, sort((v as Record<string, unknown>)[kk])]))
    : v;
  return JSON.stringify(sort(k));
}
export const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");
export const keySha256 = (key: JudgmentKey): string => sha256(canonicalKeyForHash(key));

export interface JudgmentResult {
  pass: boolean;
  failures: string[];          // named HARD failures (empty ⇒ pass)
  partClassification: { expected: string; actual: string; ok: boolean };
  verdict: { expected: string; actual: string; ok: boolean };
  namedGates: Array<{ token: string; surfaced: boolean; dispositionOk: boolean }>; // surfaced = HARD signal (concept-presence); dispositionOk = advisory
  dispositionAdvisories: string[]; // mustRaise concept surfaced but NOT at expected disposition — ADVISORY only (Brain 2026-06-26, Option A)
  showStoppers: Array<{ description: string; surfaced: boolean }>;
  fabricated: string[];        // raised clauses absent from source — HARD fail
  decoyHardFails: string[];    // absent-decoy raised at all, OR any decoy raised as disqualifying — HARD fail
  clauseRecallReported: number | null; // observability ONLY (not scored)
}

/** Score a panel output against the frozen judgment key. Pure, deterministic, NO AI. */
export function scoreJudgment(
  panel: PanelVerdictLike,
  key: JudgmentKey,
  sourceText: string,
  opts?: { extractedClauses?: string[]; clauseRecall?: number; analysisText?: string },
): JudgmentResult {
  const failures: string[] = [];
  const raised: RaisedGate[] = panel.raisedGates;
  const unmet = raised.filter((r) => !r.met);

  // ── SCORED pre-step: acquisition Part classification ──
  const actualPart = classifyAcquisitionPart(opts?.extractedClauses ?? []);
  const partOk = actualPart === key.acquisitionPart;
  if (!partOk) failures.push(`PART misclassified: expected ${key.acquisitionPart}, got ${actualPart}`);

  // ── verdict (bidderProfile-aware) ──
  const e = key.expectedVerdict;
  let verdictOk = panel.verdict === e.verdict && panel.eligible === e.eligible && panel.showStoppers <= e.maxShowStoppers;
  // doctrine guard: with a null bidder profile the panel may NOT return INELIGIBLE driven by a bidder-side gate.
  if (key.bidderProfile === null && panel.verdict === "INELIGIBLE" && e.verdict !== "INELIGIBLE") verdictOk = false;
  if (!verdictOk) failures.push(`verdict ${panel.verdict}/elig=${panel.eligible}/stoppers=${panel.showStoppers} ≠ expected ${e.verdict}/elig=${e.eligible}/≤${e.maxShowStoppers}`);

  // ── named gates: CONCEPT-PRESENCE scoring (Brain ruling 2026-06-26, Option A — see _BAR-CHANGE-LOG.md). ──
  //    A mustRaise concept HARD-FAILS only if its token/aliases are NOT surfaced ANYWHERE in the engine's
  //    analysis output (raised gate names+cites + opts.analysisText = judge rationale + dissent + verifier
  //    claims). Exact-disposition matching is RETAINED but ADVISORY only: null-bidder met≠unmet semantics +
  //    gate-naming non-determinism (pilot #1) made it measure naming noise, not judgment.
  const dispNames = { met: raised.filter((r) => r.met).map((r) => r.name), unmet: unmet.map((r) => r.name), caution: raised.map((r) => r.name) };
  const presenceCorpus = [raised.map((r) => `${r.name} ${r.cite ?? ""}`).join(" \n ") + " \n " + (opts?.analysisText ?? "")];
  const dispositionAdvisories: string[] = [];
  const namedGates = key.namedGates.map((g) => {
    const am = g.aliases ? { [g.token]: g.aliases } : undefined;
    const surfaced = gateMatched(g.token, presenceCorpus, am);                       // HARD: concept present anywhere in output
    const dispositionOk = gateMatched(g.token, dispNames[g.expectedDisposition], am); // advisory only
    if (g.mustRaise && !surfaced) failures.push(`mustRaise concept not surfaced anywhere in output: '${g.token}'`);
    else if (g.mustRaise && !dispositionOk) dispositionAdvisories.push(`'${g.token}' surfaced but not at expected disposition '${g.expectedDisposition}'`);
    return { token: g.token, surfaced, dispositionOk };
  });

  // ── show-stoppers: must be surfaced (keyword/cite presence in the panel's show-stopper-ish gate prose) ──
  const raisedBlob = raised.map((r) => `${r.name} ${r.cite ?? ""}`).join(" \n ").toLowerCase();
  const showStoppers = key.showStoppers.map((s) => {
    const probe = (s.sourceCite || s.description).toLowerCase().split(/\s+/).filter((w) => w.length > 4).slice(0, 4);
    const surfaced = probe.length > 0 && probe.every((w) => raisedBlob.includes(w));
    if (!surfaced) failures.push(`show-stopper not surfaced (${s.disqualifiesBecause}): ${s.description.slice(0, 60)}`);
    return { description: s.description, surfaced };
  });

  // ── fabrication: any RAISED clause absent from source = HARD fail (2c) ──
  const fabricated = fabricatedClauses(raised, sourceText);
  if (fabricated.length) failures.push(`FABRICATION: raised clause(s) absent from source: ${fabricated.join(", ")}`);

  // ── decoys: absent-decoy raised AT ALL = fabrication; ANY decoy raised as DISQUALIFYING (unmet) = hard fail ──
  const decoyHardFails: string[] = [];
  for (const d of key.decoys) {
    const alias = d.aliases ? { [d.token]: d.aliases } : undefined;
    const raisedAtAll = gateMatched(d.token, raised.map((r) => r.name), alias);
    const raisedDisqualifying = gateMatched(d.token, unmet.map((r) => r.name), alias);
    if (d.kind === "absent" && (d.mustNotRaiseAtAll ?? true) && raisedAtAll) decoyHardFails.push(`${d.token} (absent — must not be raised at all)`);
    else if (raisedDisqualifying) decoyHardFails.push(`${d.token} (raised as disqualifying)`);
  }
  if (decoyHardFails.length) failures.push(`DECOY misfire: ${decoyHardFails.join(", ")}`);

  return {
    pass: failures.length === 0,
    failures,
    partClassification: { expected: key.acquisitionPart, actual: actualPart, ok: partOk },
    verdict: { expected: `${e.verdict}/elig=${e.eligible}/≤${e.maxShowStoppers}`, actual: `${panel.verdict}/elig=${panel.eligible}/stoppers=${panel.showStoppers}`, ok: verdictOk },
    namedGates,
    dispositionAdvisories,
    showStoppers,
    fabricated,
    decoyHardFails,
    clauseRecallReported: opts?.clauseRecall ?? null,
  };
}

// ── N-RUN CONSENSUS GRADING (Brain card 41 — the FROZEN grading bar) ────────────────────────────────
// The customer runs the stochastic panel ONCE, so single-run hard-pass is the wrong bar. Grade N=3–5 runs
// ASYMMETRICALLY:
//   COMPLETENESS (verdict · must-raise concepts) → CONSENSUS (a majority of N runs). A hard key must not
//     hinge on a tail finding that appears 1-in-2 runs.
//   CORRECTNESS (fabrications · decoy/disqualifying-misclassifications) → UNANIMITY / ZERO-TOLERANCE:
//     ONE occurrence in ANY run = FAIL. Best-of-N may NEVER hide a correctness error — the customer
//     could get that 1 run. ("complete AND correct": completeness tolerates consensus, correctness nothing.)
export interface ConsensusResult {
  pass: boolean;
  n: number;
  majority: number;
  failures: string[];
  completeness: { verdictOkRuns: number; conceptConsensus: Array<{ token: string; surfacedRuns: number; ok: boolean }> };
  correctness: { fabricationRuns: string[]; misclassificationRuns: string[] };
}

export function gradeConsensus(results: JudgmentResult[], key: JudgmentKey): ConsensusResult {
  const n = results.length;
  const majority = Math.floor(n / 2) + 1;
  const failures: string[] = [];

  // CORRECTNESS — zero-tolerance (unanimity). ANY run with a fabrication, or a disqualifying-
  // misclassification (absent-decoy raised, or a decoy / eligible-for provision raised as disqualifying),
  // fails the whole bar — best-of-N may NOT hide it.
  const fabricationRuns: string[] = [];
  const misclassificationRuns: string[] = [];
  results.forEach((r, i) => {
    if (r.fabricated.length) fabricationRuns.push(`run${i + 1}: ${r.fabricated.join(", ")}`);
    if (r.decoyHardFails.length) misclassificationRuns.push(`run${i + 1}: ${r.decoyHardFails.join(", ")}`);
  });
  if (fabricationRuns.length) failures.push(`CORRECTNESS (zero-tolerance) — fabrication in ${fabricationRuns.length}/${n} run(s): ${fabricationRuns.join(" · ")}`);
  if (misclassificationRuns.length) failures.push(`CORRECTNESS (zero-tolerance) — disqualifying-misclassification/decoy in ${misclassificationRuns.length}/${n} run(s): ${misclassificationRuns.join(" · ")}`);

  // COMPLETENESS — consensus (majority). Verdict + each must-raise concept must hold in a MAJORITY of runs.
  const verdictOkRuns = results.filter((r) => r.verdict.ok).length;
  if (verdictOkRuns < majority) failures.push(`COMPLETENESS — verdict consensus ${verdictOkRuns}/${n} < majority ${majority} (actuals: ${results.map((r) => r.verdict.actual).join(", ")})`);

  const conceptConsensus = key.namedGates.filter((g) => g.mustRaise).map((g) => {
    const surfacedRuns = results.filter((r) => r.namedGates.find((x) => x.token === g.token)?.surfaced).length;
    const ok = surfacedRuns >= majority;
    if (!ok) failures.push(`COMPLETENESS — must-raise concept '${g.token}' surfaced ${surfacedRuns}/${n} < majority ${majority}`);
    return { token: g.token, surfacedRuns, ok };
  });

  return {
    pass: failures.length === 0, n, majority, failures,
    completeness: { verdictOkRuns, conceptConsensus },
    correctness: { fabricationRuns, misclassificationRuns },
  };
}
