// ORACLE SCORING HARNESS (Brain card 280 R4 + card 282 §2) — the $0 scorer that turns engine verdicts into a
// pass/blocker verdict against EXTERNAL adjudicated truth. Pure; no model call. The engine-run itself is a SEAM
// (injected) — $0 with a stub verdict map (for scorer self-tests + replay of recorded runs); PAID in the CERT-10
// campaign with runJudgmentFirstAudit. Brain's done-gate: BLOCKER = any committal-direction contradiction of
// adjudicated reality · conservative miss = OK · honest-fail parity = hard gate · GREEN needs >=2-3 FULL-DOC ran.
import { readFileSync } from "node:fs";
import type { Verdict } from "../../../src/lib/audit-decide";

export interface OracleCase {
  id: string; source: string; citation: string; class: string;
  externalTruth: string; expected: string;
  acceptable: Verdict[]; blocker: Verdict[]; watch?: Verdict[];
  sourceType: string; calibration?: boolean; fullDocSource?: string; recoveryDepth?: string;
}
export interface OracleManifest { _meta: unknown; cases: OracleCase[]; }

export type CaseStatus = "PASS" | "BLOCKER" | "WATCH" | "UNEXPECTED";
export interface ScoredCase { id: string; verdict: Verdict; status: CaseStatus; blocker: boolean; note: string; }

const isHonestFail = (v: Verdict) => v === "NEEDS_HUMAN_REVIEW" || v === "INCOMPLETE";

/** Score ONE engine verdict against a case's adjudicated truth. A verdict in `blocker` is a committal-direction
 *  contradiction (hard fail). In `acceptable` = pass. In `watch` = soft pass (flagged, e.g. a snapshot-invisible
 *  process defect). Anything else = UNEXPECTED (not a blocker by itself, but must be reviewed). */
export function scoreOracleCase(c: OracleCase, verdict: Verdict): ScoredCase {
  if (c.blocker.includes(verdict))
    return { id: c.id, verdict, status: "BLOCKER", blocker: true, note: `${verdict} contradicts adjudicated truth (${c.externalTruth.slice(0, 60)}…)` };
  if (c.acceptable.includes(verdict))
    return { id: c.id, verdict, status: "PASS", blocker: false, note: `within acceptable set` };
  if (c.watch?.includes(verdict))
    return { id: c.id, verdict, status: "WATCH", blocker: false, note: `soft miss (watch) — see case watchRationale` };
  return { id: c.id, verdict, status: "UNEXPECTED", blocker: false, note: `${verdict} not in acceptable/blocker/watch — review` };
}

export interface OracleSummary {
  total: number; passes: number; watches: number; unexpected: number;
  blockers: ScoredCase[];
  fullDocRan: number;
  honestFailFired: number;      // engine honest-failed where truth was honest-fail-eligible
  greenEligible: boolean;       // zero blockers AND >=2-3 FULL-DOC cases actually ran (Brain R5)
  pass: boolean;                // the smoke gate: zero blockers (necessary, not sufficient — Brain R4)
}

/** Aggregate a scored set into the done-gate verdict. `ranFullDoc` = ids that were run on their FULL-DOC source. */
export function summarizeOracle(scored: ScoredCase[], ranFullDoc: string[] = []): OracleSummary {
  const blockers = scored.filter((s) => s.blocker);
  const watches = scored.filter((s) => s.status === "WATCH").length;
  const unexpected = scored.filter((s) => s.status === "UNEXPECTED").length;
  const fullDocRan = ranFullDoc.length;
  return {
    total: scored.length,
    passes: scored.filter((s) => s.status === "PASS").length,
    watches, unexpected, blockers,
    fullDocRan,
    honestFailFired: scored.filter((s) => isHonestFail(s.verdict)).length,
    greenEligible: blockers.length === 0 && fullDocRan >= 2,
    pass: blockers.length === 0,
  };
}

/** The engine-run seam. $0 stub returns a recorded/synthetic verdict; PAID impl calls runJudgmentFirstAudit. */
export type EngineRun = (c: OracleCase, useFullDoc: boolean) => Promise<Verdict> | Verdict;

/** Run a manifest through an injected engine and score every non-calibration case. Calibration cases are scored
 *  but flagged (they do NOT count toward the gate — engine may recognize them, pre-cutoff). */
export async function runOracle(manifest: OracleManifest, engine: EngineRun, opts: { useFullDoc?: boolean } = {}): Promise<{ scored: ScoredCase[]; summary: OracleSummary }> {
  const gateCases = manifest.cases.filter((c) => !c.calibration);
  const scored: ScoredCase[] = [];
  const ranFullDoc: string[] = [];
  for (const c of gateCases) {
    const useFull = !!(opts.useFullDoc && c.fullDocSource);
    const verdict = await engine(c, useFull);
    if (useFull) ranFullDoc.push(c.id);
    scored.push(scoreOracleCase(c, verdict));
  }
  return { scored, summary: summarizeOracle(scored, ranFullDoc) };
}

export function loadOracleManifest(path = new URL("./oracle-manifest.json", import.meta.url)): OracleManifest {
  return JSON.parse(readFileSync(path, "utf8")) as OracleManifest;
}
