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
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Solicitation } from "@/lib/sam";
import { priceUsd, type UsageLike } from "./ab-extract-adapter";

dotenv.config({ path: ".env.local", quiet: true });

// V2 on for parity with the live engine's facts surfaces.
process.env.AUDIT_ENGINE_V2 = "true";

const arg = (k: string): string | undefined => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const sol = arg("--sol") ?? "N4008526R0065";

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
  const { runPanelJudge } = await import("@/lib/agentic-panel-runner");
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
  const map = await runAgenticMap({ docs, scalars, mapModel: process.env.AUDIT_MAP_MODEL });
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
  });
  if (unroutedAttachments.length) console.log(`⚠ UNROUTED attachments (binding content NO lens will see — coverage concern): ${unroutedAttachments.join(" · ")}`);
  const engineCost = priceUsd(engineUsage);
  console.log(`\nENGINE(MAP) · $${engineCost.usd.toFixed(2)} · matrix≈${Math.round(matrix.length / 4)} tok · sections={${Object.keys(sectionText).sort().join(",")}} · coverage="${map.coverage.statement}"`);

  const detected = detectedSectionsFromFacts(map.facts);
  console.log(`manifest detected: {${[...detected].sort().join(",")}}  (need C,L,M,B)`);
  // Cache the matrix + sectionText so a panel-only re-run never re-pays the ~$1.91 MAP.
  const matrixCachePath = path.join("ceo", "proofs", `stage6e-matrix-${sol}.json`);
  writeFileSync(matrixCachePath, JSON.stringify({ matrix, sectionText, bindingExcerpts, detected: [...detected], engineCostUsd: engineCost.usd, coverage: map.coverage.statement }, null, 2));
  console.log(`matrix+sections cached → ${matrixCachePath}`);

  // ── Fire the PANEL JUDGE (this IS the judge now) — capture $ separately ──
  const panelUsage: UsageLike[] = [];
  setStructuredUsageSink((u) => panelUsage.push(u));
  const panel = await runPanelJudge({
    sectionText,
    detectedSections: detected,
  });
  const panelCost = priceUsd(panelUsage);
  setStructuredUsageSink(null);

  console.log(`\n──────── PANEL RESULT ────────`);
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

  // ── GRADE the panel output on the 10-dim board-room rubric — capture $ ──
  const graderUsage: UsageLike[] = [];
  setStructuredUsageSink((u) => graderUsage.push(u));
  const grade = await gradePanelQuality({ panel, matrix, apiKey });
  const graderCost = priceUsd(graderUsage);
  setStructuredUsageSink(null);

  console.log(`\n──────── QUALITY GRADE (10-dim board-room rubric) ────────`);
  console.log(`OUTCOME: ${grade.grade.verdict} — ${grade.grade.reason}`);
  console.log(`eligible=${grade.grade.eligible} · quality-avg=${grade.grade.qualityAverage.toFixed(2)}${grade.grade.failedGates.length ? ` · failed-gates: ${grade.grade.failedGates.join(", ")}` : ""}`);
  grade.dims.forEach((d, i) => {
    const kind = RUBRIC[i]?.kind ?? "quality";
    const mark = kind === "eligibility" ? (d.pass ? "PASS" : "FAIL") : `${d.score}/5`;
    console.log(`  [${kind === "gate" ? "GATE" : kind === "eligibility" ? "ELIG" : "QUAL"}] ${d.dimension}: ${mark}${d.auto_failed ? " ⚠AUTO-FAIL" : ""}`);
  });
  console.log(`GRADER · $${graderCost.usd.toFixed(2)} (proof instrument, not a prod cost)`);

  // ── Verdict ──
  const total = engineCost.usd + pcost + graderCost.usd;
  console.log(`\n════════ 6E TOTAL (this run) ════════`);
  console.log(`ENGINE $${engineCost.usd.toFixed(2)} + PANEL $${pcost.toFixed(2)} + GRADER $${graderCost.usd.toFixed(2)} = $${total.toFixed(2)}`);
  console.log(`PER-AUDIT PROD COST (engine + panel, NOT grader) = $${(engineCost.usd + pcost).toFixed(2)}`);
  console.log(`Anthropic Console CSV delta is the authoritative actualization.`);
  console.log(grade.grade.verdict === "SHIP"
    ? `\n→ PANEL PRODUCES BOARD-ROOM OUTPUT. Eligible to graduate (Stage 5) — CEO call.`
    : `\n→ Outcome=${grade.grade.verdict}. Do NOT graduate. Inspect the failed dims above.`);
}

main().catch((e) => {
  console.error("FATAL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
