// STAGE 4 — the measured A/B (PAID). Loads adjudicated gold sets, sources each
// package ONCE, runs BOTH engines over the identical package, scores each with
// scoreGoldSet, and reports recall/precision + bindingClauseRecall + plantedHardRecall
// (the moat metric) + per-engine $ cost. Decides Haiku-vs-Sonnet for the MAP empirically.
//
// FAIRNESS: both arms consume the SAME assembled doc set; both outputs pass through the
// SAME symmetric adapter (ab-extract-adapter.ts). Cost is captured via the two usage
// sinks (legacy setUsageSink + new setStructuredUsageSink); the Anthropic Console delta
// remains the authoritative actualization (memory: financial-numbers-need-a-source).
//
// SPEND GATE: this script COSTS MONEY (~$1.50 new + ~$7.87 legacy per package). Per
// CEO law it is ANNOUNCED before running and CEO-greenlit. It is NOT run as part of any
// gate. Run: npx tsx scripts/audit-ai/ab-run.ts [--only <packageId>] [--map-model haiku|sonnet]
//
// See ceo/AGENTIC-ENGINE-REBUILD-PLAN.md Stage 4.
import dotenv from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Solicitation } from "@/lib/sam";
import { parseGoldSet, scoreGoldSet, type GoldSetFile, type GoldSetScore } from "./gold-set-score";
import {
  agenticToExtraction, legacyToExtraction, priceUsd, type UsageLike,
} from "./ab-extract-adapter";

dotenv.config({ path: ".env.local", quiet: true });

// V2 must be on for the legacy arm's facts surfaces (parity with the live engine).
process.env.AUDIT_ENGINE_V2 = "true";

const GOLD_DIR = path.join(__dirname, "gold-sets");
const arg = (k: string): string | undefined => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const onlyPkg = arg("--only");
const mapModelOverride = arg("--map-model"); // "haiku" | "sonnet" | full id — the Haiku-vs-Sonnet decision lever

function loadGoldSets(): GoldSetFile[] {
  const files = readdirSync(GOLD_DIR).filter((n) => n.endsWith(".json") && !n.startsWith("_"));
  const sets = files.map((n) => parseGoldSet(JSON.parse(readFileSync(path.join(GOLD_DIR, n), "utf8"))));
  const usable = sets.filter((s) => (onlyPkg ? s.packageId === onlyPkg : true));
  // HONEST GATE: never score against a gold set a human hasn't adjudicated — that would
  // be circular (AI grading AI). Refuse loud.
  const unadjudicated = usable.filter((s) => !s.adjudicated);
  if (unadjudicated.length) {
    throw new Error(
      `REFUSING to run: ${unadjudicated.map((s) => s.packageId).join(", ")} not adjudicated ` +
        `(adjudicated:false). Run ab-propose.ts → CEO+Code adjudicate → set adjudicated:true first.`
    );
  }
  return usable;
}

interface ArmResult {
  engine: "new" | "legacy";
  score: GoldSetScore;
  cost: ReturnType<typeof priceUsd>;
  ms: number;
}

async function main() {
  const sets = loadGoldSets();
  if (!sets.length) throw new Error(`no adjudicated gold sets in ${GOLD_DIR}${onlyPkg ? ` matching --only ${onlyPkg}` : ""}`);

  // Dynamic import AFTER dotenv (module-load env capture — see rerun-dhs-local.ts).
  const { fetchSolicitationByNoticeId } = await import("@/lib/sam");
  const { assembleSamDocumentSet } = await import("@/lib/sam-attachments");
  const { buildAgenticDocs, scalarsFromSolicitation } = await import("@/lib/agentic-executor");
  const { runAgenticAudit } = await import("@/lib/agentic-orchestrator");
  const { runAudit, setUsageSink } = await import("@/lib/audit-engine");
  const { setStructuredUsageSink } = await import("@/lib/anthropic-structured");

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const mapModel = mapModelOverride
    ? (/haiku/i.test(mapModelOverride) ? "claude-haiku-4-5" : /sonnet/i.test(mapModelOverride) ? "claude-sonnet-4-6" : mapModelOverride)
    : process.env.AUDIT_MAP_MODEL;

  const report: Array<{ packageId: string; new: ArmResult; legacy: ArmResult }> = [];

  for (const gold of sets) {
    console.log(`\n══════ PACKAGE ${gold.packageId} ══════`);
    if (!gold.auditId) throw new Error(`${gold.packageId}: gold set has no auditId to source docs from`);

    // ── Source the package ONCE (DB row → SAM assemble), shared by both arms ──
    const { data: row, error: e0 } = await admin
      .from("audits")
      .select("notice_id, solicitation_number, agency, naics_code, set_aside, response_deadline, title")
      .eq("id", gold.auditId)
      .single();
    if (e0 || !row) throw new Error(`${gold.packageId}: cannot read audit row ${gold.auditId}: ${e0?.message ?? "missing"}`);

    let solicitation = await fetchSolicitationByNoticeId(row.notice_id).catch(() => null);
    if (!solicitation) {
      solicitation = {
        noticeId: row.notice_id, solicitationNumber: row.solicitation_number, title: row.title || "Untitled",
        department: null, subTier: null, fullParentPathName: null, naicsCode: row.naics_code, type: null,
        typeOfSetAside: row.set_aside, postedDate: null, responseDeadLine: row.response_deadline,
        description: "", resourceLinks: [],
      } as Solicitation;
    }
    const assembled = await assembleSamDocumentSet(row.notice_id, row.solicitation_number).catch(() => null);
    if (!assembled?.primary) throw new Error(`${gold.packageId}: no ingestible primary from SAM — aborting (no $ spent on this pkg)`);
    console.log(`sourced: ${assembled.ingestion.files_ingested}/${assembled.ingestion.files_total} ingested · primary=${assembled.primary.name}`);

    // ── NEW (agentic) arm ──────────────────────────────────────────────────
    const newUsage: UsageLike[] = [];
    setStructuredUsageSink((u) => newUsage.push(u));
    const docs = await buildAgenticDocs({
      primaryName: assembled.primary.name,
      primaryBytes: assembled.primary.buffer,
      primaryText: null,
      attachments: assembled.attachments,
    });
    const scalars = scalarsFromSolicitation(solicitation, row.agency);
    const tNew = Date.now();
    const agentic = await runAgenticAudit({ docs, scalars, mapModel });
    const newMs = Date.now() - tNew;
    setStructuredUsageSink(null);
    const newScore = scoreGoldSet(agenticToExtraction(agentic.facts), gold);
    const newCost = priceUsd(newUsage);
    console.log(`NEW   · ${newMs}ms · $${newCost.usd.toFixed(2)} · cache_read=${newCost.cache_read} · coverage="${agentic.coverage.statement}"`);

    // ── LEGACY arm (same package) ────────────────────────────────────────────
    const legacyUsage: UsageLike[] = [];
    setUsageSink((u) => legacyUsage.push(u));
    const tLeg = Date.now();
    const legacy = await runAudit({
      solicitation,
      pdfBase64: assembled.primary.base64,
      attachmentPdfs: assembled.attachments,
      primaryDocName: assembled.primary.name,
      pdfSource: "sam_fetched",
    });
    const legMs = Date.now() - tLeg;
    setUsageSink(null);
    const legScore = scoreGoldSet(legacyToExtraction(legacy), gold);
    const legCost = priceUsd(legacyUsage);
    console.log(`LEGACY· ${legMs}ms · $${legCost.usd.toFixed(2)} · cache_read=${legCost.cache_read}`);

    report.push({
      packageId: gold.packageId,
      new: { engine: "new", score: newScore, cost: newCost, ms: newMs },
      legacy: { engine: "legacy", score: legScore, cost: legCost, ms: legMs },
    });
  }

  // ── Verdict table ─────────────────────────────────────────────────────────
  console.log(`\n\n════════ STAGE 4 A/B RESULT (map-model=${mapModel ?? "registry-default"}) ════════`);
  const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
  let allWin = true;
  for (const r of report) {
    const win = r.new.score.bindingClauseRecall >= r.legacy.score.bindingClauseRecall &&
                r.new.score.plantedHardRecall >= r.legacy.score.plantedHardRecall;
    allWin = allWin && win;
    console.log(`\n${r.packageId}  ${win ? "✅ new ≥ legacy" : "❌ new < legacy"}`);
    console.log(`  binding-recall   NEW ${pct(r.new.score.bindingClauseRecall)}  ·  LEGACY ${pct(r.legacy.score.bindingClauseRecall)}`);
    console.log(`  planted-hard     NEW ${pct(r.new.score.plantedHardRecall)}  ·  LEGACY ${pct(r.legacy.score.plantedHardRecall)}   ← the moat`);
    console.log(`  clause prec/rec  NEW ${pct(r.new.score.clauses.precision)}/${pct(r.new.score.clauses.recall)}  ·  LEGACY ${pct(r.legacy.score.clauses.precision)}/${pct(r.legacy.score.clauses.recall)}`);
    console.log(`  gates  recall    NEW ${pct(r.new.score.gates.recall)}  ·  LEGACY ${pct(r.legacy.score.gates.recall)}`);
    console.log(`  cost             NEW $${r.new.cost.usd.toFixed(2)}  ·  LEGACY $${r.legacy.cost.usd.toFixed(2)}`);
    if (r.new.score.missedBinding.length) console.log(`  NEW missed binding: ${r.new.score.missedBinding.join(", ")}`);
  }
  const newTotal = report.reduce((s, r) => s + r.new.cost.usd, 0);
  const legTotal = report.reduce((s, r) => s + r.legacy.cost.usd, 0);
  console.log(`\nTOTAL COST  NEW $${newTotal.toFixed(2)}  ·  LEGACY $${legTotal.toFixed(2)}  (Anthropic Console delta is authoritative)`);
  console.log(`\nGRADUATION (done-criteria): new binding-recall ≥ legacy AND planted-hard ≥ legacy on EVERY package, new cost in ~$1.10–1.60 band.`);
  console.log(allWin ? "→ NEW ENGINE WINS the moat metric on every package. Eligible for Stage 5 (CEO call)." : "→ NEW ENGINE DID NOT WIN on every package. Do NOT graduate. Investigate misses above.");
}

main().catch((e) => {
  console.error("FATAL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
