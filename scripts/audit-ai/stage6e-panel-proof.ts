// STAGE 6E — the PAID board-room-quality PROOF of the agentic expert-panel judge.
//
// HARD GATE (CEO 2026-06-24): no live audit until the panel judge proves board-room
// quality on a REAL package. This is that proof. It:
//   1. sources ONE real package (N4008526R0065) ONCE  (DB row → SAM assemble)
//   2. runs the agentic engine over it               (runAgenticAudit → matrix + facts)
//   3. derives the C/L/M/B manifest set from facts    (same detection that powers decideCoverageChip)
//   4. fires the EXPERT PANEL JUDGE over the matrix    (runPanelJudge — the #1 customer asset)
//   5. GRADES the panel output on the 10-dim rubric    (gradePanelQuality → SHIP / INELIGIBLE / HONEST_FAILURE)
//   6. reports the verdict + per-dim grade + the PAID $ cost (both panel + grader, separately)
//
// COST: PAID. Panel = 7 calls / EXACTLY 2 Opus (~$1.30–2.30). Grader = up to 10 judge
// calls (a PROOF instrument, not a prod cost). Announced + CEO-greenlit before running.
// The Anthropic Console CSV delta is the authoritative cost actualization (memory:
// financial-numbers-need-a-source) — this script's $ is the in-band estimate.
//
// Run: npx tsx scripts/audit-ai/stage6e-panel-proof.ts --sol N4008526R0065
//
// See ceo/AGENTIC-ENGINE-REBUILD-PLAN.md Stage 6E.
import dotenv from "dotenv";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Solicitation } from "@/lib/sam";
import { priceUsd, type UsageLike } from "./ab-extract-adapter";
import { parseGoldSet, scoreGoldSet, graduationGate, type EngineExtraction, type PanelVerdictLike, type GoldSetFile } from "./gold-set-score";
import { scoreJudgment, keySha256, type JudgmentKey } from "./judgment-score";

dotenv.config({ path: ".env.local", quiet: true });

// V2 on for parity with the live engine's facts surfaces.
process.env.AUDIT_ENGINE_V2 = "true";

const arg = (k: string): string | undefined => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const sol = arg("--sol") ?? "N4008526R0065";
// Brain ruling 2026-06-25: gold-set recall is the SOLE correctness gate; the AI grader is OFF the
// evidence chain (only runs with --ai-grader, as a $-costing DEV SIGNAL, never load-bearing).
const GOLD_DRY_RUN = process.argv.includes("--gold-dry-run"); // score the cached-MAP EXTRACTION layer, $0, exit before the paid panel
const RUN_AI_GRADER = process.argv.includes("--ai-grader");

/** Load + validate the adjudicated gold set for this sol, or null. Pure I/O. */
function loadGold(solId: string): GoldSetFile | null {
  const p = path.join("scripts", "audit-ai", "gold-sets", `${solId}.json`);
  if (!existsSync(p)) return null;
  return parseGoldSet(JSON.parse(readFileSync(p, "utf8")));
}
/** EngineExtraction from MAP facts (clauses/requirements/evalFactors); gates come from the PANEL. */
function extractionFromFacts(facts: { clauses?: Array<{ number?: string }>; submissionRequirements?: Array<{ text?: string }>; evaluationFactors?: Array<{ factor?: string }> }, raisedGates: string[]): EngineExtraction {
  return {
    clauses: (facts.clauses ?? []).map((c) => c.number ?? "").filter(Boolean),
    requirements: (facts.submissionRequirements ?? []).map((s) => s.text ?? "").filter(Boolean),
    evalFactors: (facts.evaluationFactors ?? []).map((f) => f.factor ?? "").filter(Boolean),
    gates: raisedGates,
  };
}
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

/** Derive the panel manifest set (§C/§L/§M/§B) from the agentic facts.
 *  IMPORTANT (code-review 2026-06-24): §C is the STATEMENT OF WORK (SOW/PWS/SOO), which
 *  lives in §C — NOT in §I clauses. A package can carry dozens of FAR/DFARS clauses (§I)
 *  with no SOW; counting clauses as §C would let the manifest gate FALSELY pass on an
 *  incomplete package — the exact failure the gate exists to prevent. So §C requires the
 *  real SOW signal (workStatementText OR extracted performanceRequirements), never clauses.
 *  §L ← submissionRequirements · §M ← evaluationFactors · §B ← CLINs (conservative: a
 *  missing signal under-reports → INCOMPLETE, the SAFE direction). */
function detectedSectionsFromFacts(facts: {
  clins: unknown[];
  submissionRequirements: unknown[];
  evaluationFactors: unknown[];
  workStatementText?: string;
  performanceRequirements?: unknown[];
}): Set<string> {
  const s = new Set<string>();
  const hasC =
    (typeof facts.workStatementText === "string" && facts.workStatementText.trim().length > 0) ||
    ((facts.performanceRequirements?.length ?? 0) > 0);
  if (hasC) s.add("C");
  if (facts.submissionRequirements.length > 0) s.add("L");
  if (facts.evaluationFactors.length > 0) s.add("M");
  if (facts.clins.length > 0) s.add("B");
  return s;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set — 6E cannot run");

  // Dynamic import AFTER dotenv (module-load env capture — see ab-run.ts / rerun-dhs-local.ts).
  const { fetchSolicitationByNoticeId } = await import("@/lib/sam");
  const { assembleSamDocumentSet } = await import("@/lib/sam-attachments");
  const { buildAgenticDocs, scalarsFromSolicitation } = await import("@/lib/agentic-executor");
  const { runAgenticMap } = await import("@/lib/agentic-orchestrator");
  const { buildCompactMatrix, selectBindingExcerpts } = await import("@/lib/agentic-lenses");
  const { buildSectionText } = await import("@/lib/agentic-sections");
  const { runPanelJudge, coverageTruth } = await import("@/lib/agentic-panel-runner");
  const { setStructuredUsageSink } = await import("@/lib/anthropic-structured");
  const { gradePanelQuality } = await import("./panel-grader");
  const { RUBRIC } = await import("@/lib/agentic-panel");

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  console.log(`\n══════ STAGE 6E — PANEL-JUDGE BOARD-ROOM PROOF · ${sol} ══════`);

  // ── Find the audit row (most recent for this solicitation) ──
  const { data: rows, error: e0 } = await admin
    .from("audits")
    .select("id, notice_id, solicitation_number, agency, naics_code, set_aside, response_deadline, title, created_at")
    .ilike("solicitation_number", `%${sol}%`)
    .order("created_at", { ascending: false })
    .limit(1);
  if (e0) throw new Error(`DB read failed: ${e0.message}`);
  const row = rows?.[0];
  if (!row) throw new Error(`no audit row found for solicitation ~${sol}`);
  console.log(`audit row: ${row.id} · notice=${row.notice_id} · ${row.solicitation_number}`);

  // ── Source the package ONCE (DB row → SAM assemble) ──
  let solicitation = await fetchSolicitationByNoticeId(row.notice_id).catch(() => null);
  if (!solicitation) {
    solicitation = {
      noticeId: row.notice_id, solicitationNumber: row.solicitation_number, title: row.title || "Untitled",
      department: null, subTier: null, fullParentPathName: null, naicsCode: row.naics_code, type: null,
      typeOfSetAside: row.set_aside, postedDate: null, responseDeadLine: row.response_deadline,
      description: "", resourceLinks: [],
    } as Solicitation;
  }
  const assembled = await assembleSamDocumentSet(row.notice_id, row.solicitation_number).catch((e) => {
    throw new Error(`SAM assemble failed: ${e instanceof Error ? e.message : e}`);
  });
  if (!assembled?.primary) throw new Error(`no ingestible primary from SAM — aborting (no $ spent)`);
  console.log(`sourced: ${assembled.ingestion.files_ingested}/${assembled.ingestion.files_total} ingested · primary=${assembled.primary.name}`);

  // ── Run the agentic engine MAP ONLY (matrix + facts) — capture $ ──
  // CRITICAL (6E attempt #1 failure, 2026-06-24): do NOT call runAgenticAudit here. That
  // path also fires the LEGACY single-Opus judgment (audit-judgment.ts, max_tokens 10000)
  // — the exact single-point-of-failure the expert PANEL exists to REPLACE. In attempt #1
  // that call exceeded the 240s timeout, threw "This operation was aborted" (no retry), and
  // killed the whole run before the panel ever fired. The faithful 6E proof builds the
  // matrix from the MAP and lets the PANEL be the judge — runAgenticMap does everything
  // EXCEPT the judgment, so the legacy judge is never in the loop.
  const engineUsage: UsageLike[] = [];
  setStructuredUsageSink((u) => engineUsage.push(u));
  const docs = await buildAgenticDocs({
    primaryName: assembled.primary.name,
    primaryBytes: assembled.primary.buffer,
    primaryText: null,
    attachments: assembled.attachments,
  });
  const scalars = scalarsFromSolicitation(solicitation, row.agency);
  // #7 — disk-backed content-addressed MAP cache: a re-run (or any package reusing a doc by content
  // hash) serves the extract for $0 instead of re-paying the Haiku read. Persists across runs.
  const cacheDir = path.join("ceo", "proofs", "map-cache");
  mkdirSync(cacheDir, { recursive: true });
  let mapCacheHits = 0;
  const docCache = {
    get: (k: string) => { const f = path.join(cacheDir, `${k}.json`); if (!existsSync(f)) return null; mapCacheHits++; return JSON.parse(readFileSync(f, "utf8")); },
    set: (k: string, v: unknown) => { writeFileSync(path.join(cacheDir, `${k}.json`), JSON.stringify(v)); },
  };
  const map = await runAgenticMap({ docs, scalars, mapModel: process.env.AUDIT_MAP_MODEL, docCache });
  if (mapCacheHits) console.log(`💾 MAP cache: ${mapCacheHits}/${docs.length} doc reads served from cache ($0 — not re-paid)`);
  const matrix = buildCompactMatrix(map.facts, {
    provenance: map.provenance,
    coverageStatement: map.coverage.statement,
    warnings: map.facts.extractionWarnings,
  });
  const { text: bindingExcerpts } = selectBindingExcerpts(docs.map((d) => ({ name: d.name, text: d.text })));
  // STEP 2: per-lens assigned SOURCE sections. docs[0] = primary (UCF structure); the rest are
  // attachments folded into §C (SOW/PWS) / §B (WD/CBA) by buildSectionText.
  const unroutedAttachments: string[] = [];
  const sectionText = buildSectionText(docs[0]?.text ?? "", {
    attachments: docs.slice(1).map((d) => ({ name: d.name, text: d.text })),
    onUnrouted: (names) => unroutedAttachments.push(...names),
    onResolutionLog: (log) => { console.log(`📑 AMENDMENT RESOLUTION (current version assembled · #3):`); for (const l of log) console.log(`   • ${l}`); },
  });
  if (unroutedAttachments.length) console.log(`⚠ UNRESOLVED/UNROUTED attachments (binding content NO lens will see — coverage concern): ${unroutedAttachments.join(" · ")}`);
  const engineCost = priceUsd(engineUsage);
  console.log(`\nENGINE(MAP) · $${engineCost.usd.toFixed(2)} · matrix≈${Math.round(matrix.length / 4)} tok · sections={${Object.keys(sectionText).sort().join(",")}} · coverage="${map.coverage.statement}"`);

  const detected = detectedSectionsFromFacts(map.facts);
  console.log(`manifest detected: {${[...detected].sort().join(",")}}  (need C,L,M,B)`);
  // Cache the matrix + sectionText so a panel-only re-run never re-pays the ~$1.91 MAP.
  const matrixCachePath = path.join("ceo", "proofs", `stage6e-matrix-${sol}.json`);
  writeFileSync(matrixCachePath, JSON.stringify({ matrix, sectionText, bindingExcerpts, detected: [...detected], engineCostUsd: engineCost.usd, coverage: map.coverage.statement }, null, 2));
  console.log(`matrix+sections cached → ${matrixCachePath}`);

  // ── $0 GOLD DRY-RUN: score the EXTRACTION layer (clauses/reqs/factors) against the gold key using
  //    the cached MAP, then EXIT before the paid panel. No panel ⇒ gates/verdict/decoy-precision are
  //    NOT scored here (those need the paid run). This is the "$0 dry-run against the cached MAP". ──
  if (GOLD_DRY_RUN) {
    const gold = loadGold(sol);
    if (!gold) { console.log(`\n[gold-dry-run] no gold set for ${sol} — nothing to score.`); return; }
    const ext = extractionFromFacts(map.facts, []);
    const score = scoreGoldSet(ext, gold);
    const grad = graduationGate(score, gold, null); // null panel ⇒ extraction-layer only
    console.log(`\n──────── GOLD DRY-RUN · EXTRACTION LAYER · $0 (cached MAP · NO panel · NO AI grader) ────────`);
    console.log(`planted-hard CLAUSE recall: ${pct(score.plantedHardRecall)} ${score.plantedHardRecall === 1 ? "✅" : "❌ FAIL"}  (missed: ${grad.missedPlantedHard.join(", ") || "none"})`);
    console.log(`binding-clause recall: ${pct(score.bindingClauseRecall)} · precision: ${pct(score.clauses.precision)}`);
    console.log(`binding misses (${score.missedBinding.length}): ${score.missedBinding.slice(0, 30).join(", ")}${score.missedBinding.length > 30 ? " …" : ""}`);
    console.log(`requirements recall ${pct(score.requirements.recall)} · evalFactors recall ${pct(score.evalFactors.recall)}`);
    console.log(`\nEXPECTED at graduation (needs the paid panel): planted-hard=100% · decoy-misfires=0 · verdict=${gold.expectedVerdict?.verdict}/eligible=${gold.expectedVerdict?.eligible}/stoppers≤${gold.expectedVerdict?.maxShowStoppers}.`);
    console.log(`ACTUAL (extraction layer, $0): planted-hard=${pct(score.plantedHardRecall)} · gates+verdict+decoy = NOT YET SCORED (panel required).`);
    return;
  }

  // ── Fire the PANEL JUDGE (this IS the judge now) — capture $ separately ──
  const panelUsage: UsageLike[] = [];
  setStructuredUsageSink((u) => panelUsage.push(u));
  const panel = await runPanelJudge({
    sectionText,
    detectedSections: detected,
    // only genuinely UNRESOLVED/unrouted binding content is a coverage gap now (#3 resolves amendments).
    unroutedBinding: unroutedAttachments,
  });
  const panelCost = priceUsd(panelUsage);
  setStructuredUsageSink(null);

  console.log(`\n──────── PANEL RESULT ────────`);
  // #5 ONE COVERAGE TRUTH — the authoritative coverage answer (panel layer), NOT the MAP statement.
  const cov = coverageTruth(panel);
  console.log(`COVERAGE TRUTH: ${cov.complete ? "✅ COMPLETE" : "⛔ INCOMPLETE"} — ${cov.reason}`);
  if (cov.complete !== (map.coverage.statement?.toLowerCase().includes("complete") ?? false)) console.log(`   (note: MAP-layer read coverage = observability only; the panel-layer truth above governs)`);
  console.log(`fired: ${panel.fired} · manifest.ok: ${panel.manifest.ok}${panel.manifest.ok ? "" : ` (missing: ${panel.manifest.missing.join(", ")})`}`);
  if (!panel.fired) {
    console.log(`PANEL DID NOT FIRE → INCOMPLETE (honest fail, no charge to a customer). Missing required sections.`);
    console.log(`\nENGINE $${engineCost.usd.toFixed(2)} + PANEL $${panelCost.usd.toFixed(2)} (Console CSV delta authoritative)`);
    return;
  }
  const pcost = panelCost.usd;
  console.log(`panelists: ${panel.panelists.map((p) => `${p.key}=${p.output ? "ok" : "FAIL"}`).join(" · ")}`);
  if (panel.droppedSectionsForBudget?.length) {
    console.log(`⚠ DROPPED-FOR-BUDGET (binding source a lens could NOT see → coverage is NOT complete): ${panel.droppedSectionsForBudget.join(" · ")}`);
  }
  if (!panel.verifier) {
    console.log(`verifier: FAILED${panel.verifierError ? ` — ${panel.verifierError}` : " (no claims to verify)"}`);
  }
  if (panel.verifier) {
    const tally = panel.verifier.claims.reduce<Record<string, number>>((a, c) => ((a[c.state] = (a[c.state] ?? 0) + 1), a), {});
    console.log(`verifier: ${Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(" · ")}`);
  }
  if (panel.judgment) {
    const j = panel.judgment;
    console.log(`\nCHIEF JUDGE → verdict=${j.verdict} · fit_score=${j.fit_score} · eligible=${j.eligible}`);
    console.log(`  show_stoppers: ${j.show_stoppers.length}${j.show_stoppers.length ? " — " + j.show_stoppers.map((s) => (typeof s === "string" ? s : JSON.stringify(s))).join(" | ") : ""}`);
    console.log(`  preserved_dissent: ${j.preserved_dissent.length}`);
    console.log(`  rationale: ${j.rationale.slice(0, 400)}${j.rationale.length > 400 ? "…" : ""}`);
  }
  console.log(`PANEL · $${pcost.toFixed(2)}`);

  // ── GOLD-SET RECALL — the SOLE correctness gate (Brain ruling 2026-06-25). Deterministic, NO AI,
  //    $0. Grades the panel against the human-adjudicated answer key: planted-hard gates 100% (binary),
  //    decoy traps mis-fired 0, named-gate recall, binding recall+precision with EVERY named miss, and
  //    verdict-correctness vs the doctrine expectedVerdict. ──
  const gold = loadGold(sol);
  let grad: ReturnType<typeof graduationGate> | null = null;
  let persistedExtraction: EngineExtraction | null = null;
  if (panel.judgment) {
    const raised = panel.panelists.flatMap((p) => p.output?.named_hard_gates.map((g) => ({ name: g.gate, met: g.met, cite: g.citation })) ?? []);
    const pv: PanelVerdictLike = { verdict: panel.judgment.verdict, eligible: panel.judgment.eligible, showStoppers: panel.judgment.show_stoppers.length, raisedGates: raised, showStopperTexts: (panel.judgment.show_stoppers ?? []).map((s: { finding?: string } | string) => typeof s === "string" ? s : (s.finding ?? JSON.stringify(s))) };
    persistedExtraction = extractionFromFacts(map.facts, raised.map((r) => r.name));
    const sourceLedgerText = Object.values(sectionText).join("\n");

    // SUBSTRATE HEALTH (deterministic · $0 · NOT a graduation gate) — needs the OLD gold .json; optional
    // observability, present only for N4008526R0065. Absence does NOT block the judgment score below.
    if (gold) {
      const score = scoreGoldSet(persistedExtraction, gold);
      grad = graduationGate(score, gold, pv, sourceLedgerText); // sourceText → fabrication check (2c)
      console.log(`\n──────── SUBSTRATE HEALTH (deterministic · $0 · NOT a graduation gate — Brain 2026-06-25) ────────`);
      console.log(`FABRICATION (raised clause absent from source): ${grad.fabricatedClauses.length} ${grad.fabricatedClauses.length === 0 ? "✅" : "❌ " + grad.fabricatedClauses.join(", ")}`);
      console.log(`decoy traps mis-fired as DISQUALIFYING gates  : ${grad.decoyMisfired.length} ${grad.decoyMisfired.length === 0 ? "✅" : "❌ " + grad.decoyMisfired.join(", ")}`);
      console.log(`SUBSTRATE: ${grad.substrateClean ? "✅ CLEAN" : "❌ " + grad.failures.join(" · ")}`);
      console.log(`[observability — RETRACTED as signals] clause-list binding ${pct(grad.bindingClauseRecall)}/prec ${pct(grad.bindingClausePrecision)} (tautological) · gate-recall ${pct(grad.gateRecall)} · verdict ${grad.verdictMatch === null ? "n/a" : grad.verdictMatch ? "match" : "differ"}`);
      console.log(`GRADUATION: ⛔ ${grad.graduationBlockedReason}`);
    }

    // ── JUDGMENT SCORE (Brain schema) — the REAL graduation signal vs the BLIND-authored frozen key.
    //    WIRED to run INDEPENDENT of the old gold .json (which only N4008526R0065 has) so all 5 frozen
    //    keys actually get graded. Verifies keySha256 (mismatch ⇒ INVALID run) then scores deterministically
    //    ($0, no AI). Code did NOT author the key — only reads + verifies + scores it. ──
    const fkPath = path.join("scripts", "audit-ai", "gold-sets", `${sol}.judgment.frozen.json`);
    if (existsSync(fkPath)) {
      const jkey = JSON.parse(readFileSync(fkPath, "utf8")) as JudgmentKey;
      const recomputed = keySha256(jkey);
      if (jkey.adjudication?.keySha256 && jkey.adjudication.keySha256 !== recomputed) {
        console.log(`\n⛔ JUDGMENT KEY INVALID — keySha256 mismatch (frozen ${jkey.adjudication.keySha256.slice(0, 12)}… vs recomputed ${recomputed.slice(0, 12)}…). NOT scoring.`);
      } else {
        // "anywhere in output" corpus (Brain Option A, 2026-06-26): judge rationale + dissent + verifier claims + gate names.
        const analysisText = [
          String(panel.judgment?.rationale ?? ""),
          ...(panel.judgment?.preserved_dissent ?? []).map((d: any) => typeof d === "string" ? d : JSON.stringify(d)),
          ...((panel as any).verifier?.claims ?? []).map((c: any) => typeof c === "string" ? c : JSON.stringify(c)),
          ...raised.map((r) => `${r.name} ${r.cite ?? ""}`),
        ].join(" \n ");
        const jr = scoreJudgment(pv, jkey, sourceLedgerText, { extractedClauses: persistedExtraction?.clauses ?? [], analysisText });
        console.log(`\n──────── JUDGMENT SCORE · frozen key · deterministic · $0 · NO AI · concept-presence (Brain Option A) ────────`);
        console.log(`part ${jr.partClassification.ok ? "✅" : "⚠️adv"} (${jr.partClassification.actual}) · verdict ${jr.verdict.ok ? "✅" : "❌"} (${jr.verdict.actual}) · fabrication ${jr.fabricated.length === 0 ? "✅" : "❌ " + jr.fabricated.join(",")} · decoy ${jr.decoyHardFails.length === 0 ? "✅" : "❌ " + jr.decoyHardFails.join(",")}`);
        console.log(`concepts surfaced (HARD): ${jr.namedGates.map((g) => `${g.token}:${g.surfaced ? "✅" : "❌"}`).join(" · ")}`);
        console.log(`disposition (advisory): ${jr.dispositionAdvisories.length ? jr.dispositionAdvisories.join(" · ") : "all aligned"}`);
        console.log(`show-stoppers surfaced (advisory): ${jr.showStoppers.map((s) => s.surfaced ? "✅" : "⚠️").join("")}`);
        console.log(`\nJUDGMENT: ${jr.pass ? "✅ PASS" : "❌ FAIL — " + jr.failures.join(" · ")}`);
      }
    } else {
      console.log(`[judgment] no frozen judgment key at ${fkPath} — judgment not scored (awaiting Brain's blind-authored key + freeze).`);
    }
  } else {
    console.log(`\n[panel] no panel judgment produced — nothing to score.`);
  }

  // Persist the panel's structured output so a future grade/score never re-pays the panel ($2.53).
  const panelOutPath = path.join("ceo", "proofs", `stage6e-panel-output-${sol}.json`);
  writeFileSync(panelOutPath, JSON.stringify({
    sol, coverage: cov, gradedGold: grad,
    extraction: persistedExtraction, // self-contained $0 re-scores (no MAP/matrix needed)
    judgment: panel.judgment, verifier: panel.verifier,
    panelists: panel.panelists.map((p) => ({ key: p.key, output: p.output })),
  }, null, 2));
  console.log(`panel output persisted → ${panelOutPath}`);

  // ── AI grader — OFF the evidence chain by default (Brain 2026-06-25). Runs ONLY with --ai-grader,
  //    as a $-costing DEV SIGNAL, never load-bearing on the graduation decision. ──
  const graderUsage: UsageLike[] = [];
  if (RUN_AI_GRADER) {
    const sourceLedger = Object.entries(sectionText).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `## SECTION ${k}\n${v}`).join("\n\n");
    setStructuredUsageSink((u) => graderUsage.push(u));
    const grade = await gradePanelQuality({ panel, sourceLedger, apiKey });
    setStructuredUsageSink(null);
    console.log(`\n──────── AI GRADER (DEV SIGNAL ONLY — NOT load-bearing) ────────`);
    console.log(`signal: ${grade.grade.verdict} — ${grade.grade.reason}`);
    grade.dims.forEach((d, i) => {
      const kind = RUBRIC[i]?.kind ?? "quality";
      const mark = kind === "eligibility" ? (d.pass ? "PASS" : "FAIL") : `${d.score}/5`;
      console.log(`  [${kind === "gate" ? "GATE" : kind === "eligibility" ? "ELIG" : "QUAL"}] ${d.dimension}: ${mark}${d.auto_failed ? " ⚠AUTO-FAIL" : ""}`);
    });
    console.log(`AI-GRADER · $${priceUsd(graderUsage).usd.toFixed(2)} (dev signal, excluded from the correctness gate)`);
  } else {
    console.log(`\n[ai-grader] OFF — not on the evidence chain (Brain 2026-06-25). Pass --ai-grader to run it as a $-costing dev signal only.`);
  }

  // ── AUDIT-LEVEL per-stage cost (CEO ask: "how the engine works" — what each stage costs) ──
  const perStage = (heading: string, usages: UsageLike[]) => {
    const byKey = new Map<string, UsageLike[]>();
    for (const u of usages) {
      const lbl = u.label ?? "?";
      const key = lbl.startsWith("MAP ") ? "MAP per-doc (Haiku)" : lbl.replace(/\s*@\d+$/, "").trim();
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(u);
    }
    console.log(`\n  ${heading} — per stage:`);
    [...byKey.entries()].sort((a, b) => priceUsd(b[1]).usd - priceUsd(a[1]).usd)
      .forEach(([k, us]) => console.log(`    ${k.padEnd(26)} $${priceUsd(us).usd.toFixed(2)}  (${us.length} call${us.length > 1 ? "s" : ""})`));
  };
  console.log(`\n──────── AUDIT-LEVEL COST BREAKDOWN (per engine stage) ────────`);
  perStage("ENGINE / MAP", engineUsage);
  perStage("PANEL (lenses → verifier → judge)", panelUsage);
  if (RUN_AI_GRADER) perStage("AI GRADER (dev signal, off-chain)", graderUsage);

  // ── Verdict — driven by the GOLD GATE, not the AI grader ──
  const graderCostUsd = RUN_AI_GRADER ? priceUsd(graderUsage).usd : 0;
  const total = engineCost.usd + pcost + graderCostUsd;
  console.log(`\n════════ 6E TOTAL (this run) ════════`);
  console.log(`ENGINE $${engineCost.usd.toFixed(2)} + PANEL $${pcost.toFixed(2)}${RUN_AI_GRADER ? ` + AI-GRADER $${graderCostUsd.toFixed(2)}` : ""} = $${total.toFixed(2)}`);
  console.log(`PER-AUDIT PROD COST (engine + panel; gold gate is $0) = $${(engineCost.usd + pcost).toFixed(2)}`);
  console.log(`Anthropic Console CSV delta is the authoritative actualization.`);
  console.log(grad
    ? `\n→ SUBSTRATE ${grad.substrateClean ? "✅ CLEAN" : "❌ " + grad.failures.join(" · ")}. GRADUATION ⛔ BLOCKED — ${grad.graduationBlockedReason}. (Recall is observability only, retracted as a signal.)`
    : `\n→ Gold not scored.`);
}

main().catch((e) => {
  console.error("FATAL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
