// Quality-gate harness: claude-sonnet-4-6 vs claude-opus-4-7 against the
// production audit pipeline (src/lib/audit-engine.ts). Runs a fixed 6-row
// corpus through both models, persists per-audit JSON output, prints a cost
// table, and emits a diff report at output/diff-report.md.
//
// LOCAL DRY-RUN ONLY · does not touch production state.
//   - No env mutation
//   - No queue writes
//   - No status flips on pending_audits rows
//   - No restarts
//
// Usage:
//   cd faraudit-app
//   node scripts/quality-gate/sonnet-vs-opus.mjs
//
// Engine hooks (added in same commit · backward-compatible · default behavior
// unchanged for production paths):
//   setActiveModel(model) — temporarily swap the model used by callClaude
//   setUsageSink(fn)       — capture { model, input_tokens, output_tokens, ms }
//                            per Claude call

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..");
const OUTPUT_DIR = join(__dirname, "output");
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

// ━━ Env loader (mirrors scripts/probe-*.mjs pattern) ━━━━━━━━━━━━━━━━━━━━━
const env = Object.fromEntries(
  readFileSync(join(PROJECT_ROOT, ".env.local"), "utf8")
    .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1).trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      return [l.slice(0, i).trim(), v];
    })
);
process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
process.env.SAM_API_KEY = env.SAM_API_KEY;
process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

// CLAUDE_TIMEOUT_MS must be set BEFORE the engine module loads — audit-engine.ts
// captures it at module-init time. Default 300000 (5 min) for the harness vs
// production audit-ai's 240000. Override via env if explicitly set.
if (!process.env.CLAUDE_TIMEOUT_MS) {
  process.env.CLAUDE_TIMEOUT_MS = "300000";
}

// ━━ Engine + PDF helpers (dynamic import after env load — same pattern as
//    agents/audit-ai/index.ts so tsx-loaded .ts modules pick up env) ━━
const engineNs = await import(join(PROJECT_ROOT, "src", "lib", "audit-engine.ts"));
const samNs = await import(join(PROJECT_ROOT, "src", "lib", "sam.ts"));
const pdfNs = await import(join(PROJECT_ROOT, "agents", "audit-ai", "pdf.ts"));
const engine = engineNs.default ?? engineNs;
const sam = samNs.default ?? samNs;
const pdfMod = pdfNs.default ?? pdfNs;
const { runAudit, setActiveModel, setUsageSink } = engine;
const { fetchSolicitationByNoticeId } = sam;
const { fetchPdfFromPath, fetchPdfFromSam } = pdfMod;

// ━━ Pricing constants (Anthropic public · USD per million tokens · update if
//    pricing changes · CEO can verify final numbers in Anthropic console) ━━
const PRICING = {
  "claude-opus-4-7":   { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3,  output: 15 }
};
const MODELS = ["claude-opus-4-7", "claude-sonnet-4-6"];

// ━━ Test cases · pinned for reproducibility ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Baseline FA301626Q0068 has 3 documented traps (hex-chrome, FOB conflict,
// CLIN ambiguity). Other 5 are sam_live rows with pdf_url IS NOT NULL,
// diversified by NAICS so we exercise different prompt branches.
const ALL_TEST_CASES = [
  { notice_id: "FA301626Q0068", label: "baseline · T-38 Talon RFQ", pdf_path: join(PROJECT_ROOT, "Solicitation+-+FA301626Q0068.pdf"), naics: "336413" },
  { notice_id: "b6c6835770f44fe7b5ab2bf58c3ccc43", label: "NAICS 561730 · landscaping", naics: "561730" },
  { notice_id: "a1f77eda857c4537b7adf6dd3ab2d963", label: "NAICS 721110 · lodging", naics: "721110" },
  { notice_id: "a18f149a07724ed5b768aaec0f18cb3d", label: "NAICS 238210 · electrical", naics: "238210" },
  { notice_id: "9c482352092e4e7381f8db40564616a9", label: "NAICS 541370 · LIDAR survey", naics: "541370" },
  { notice_id: "321d7371d37d4e7bbde72151c4cf855c", label: "NAICS 236220 · construction",  naics: "236220" }
];

// ONLY env var: comma-separated notice_ids to limit the run. Use to re-run a
// single audit (e.g., baseline) without re-paying for the others. When unset,
// runs the full 6-case suite.
const ONLY = (process.env.ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
const TEST_CASES = ONLY.length > 0 ? ALL_TEST_CASES.filter((tc) => ONLY.includes(tc.notice_id)) : ALL_TEST_CASES;

// ━━ Helpers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function loadTestPdf(tc) {
  if (tc.pdf_path && existsSync(tc.pdf_path)) {
    const r = await fetchPdfFromPath(tc.pdf_path);
    return { ...r, source_label: "local" };
  }
  // Look up the row to get pdf_url
  const { data: row } = await sb.from("pending_audits").select("pdf_url, title, agency, naics_code, set_aside").eq("notice_id", tc.notice_id).maybeSingle();
  if (!row) throw new Error(`pending_audits row not found: ${tc.notice_id}`);
  if (!row.pdf_url) throw new Error(`pending_audits row has no pdf_url: ${tc.notice_id}`);
  const r = await fetchPdfFromSam(row.pdf_url);
  // Attach metadata for the synth fallback below
  return { ...r, source_label: "sam.gov", row };
}

async function loadSolicitation(tc, pdfMeta) {
  const fromSam = await fetchSolicitationByNoticeId(tc.notice_id).catch(() => null);
  if (fromSam) return fromSam;
  // Synthesize from queue row when SAM lookup fails (loose filter / archived / etc.)
  const r = pdfMeta?.row;
  return {
    noticeId: tc.notice_id,
    solicitationNumber: null,
    title: r?.title || tc.label,
    department: r?.agency || null,
    subTier: null,
    naicsCode: r?.naics_code || tc.naics,
    type: null,
    typeOfSetAside: r?.set_aside || null,
    postedDate: null,
    responseDeadLine: null,
    description: `(harness · ${tc.label})`
  };
}

function dollars(n) {
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

function setOps(a, b) {
  const A = new Set(a || []);
  const B = new Set(b || []);
  const both = [...A].filter((x) => B.has(x));
  const onlyA = [...A].filter((x) => !B.has(x));
  const onlyB = [...B].filter((x) => !A.has(x));
  return { both, onlyA, onlyB, jaccard: A.size + B.size === 0 ? 1 : both.length / (A.size + B.size - both.length) };
}

function detectTrap(complianceJson, clausePrefix) {
  const flags = (complianceJson?.dfars_flags || []).filter((f) => f.detected && (f.clause || "").includes(clausePrefix));
  const inClauses = (complianceJson?.dfars_clauses || []).some((c) => (c || "").includes(clausePrefix));
  const inTraps = (complianceJson?.dfars_traps || []).some((t) => (t.clause || "").includes(clausePrefix));
  return flags.length > 0 || inClauses || inTraps;
}

// ━━ Run loop ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const results = []; // [{ tc, model, audit, usage[], wallMs, error }]

console.log("=".repeat(70));
console.log("QUALITY GATE · Sonnet 4.6 vs Opus 4.7 dry-run");
console.log("=".repeat(70));
console.log(`Test cases: ${TEST_CASES.length}`);
console.log(`Models:     ${MODELS.join(" · ")}`);
console.log(`Total runs: ${TEST_CASES.length * MODELS.length}\n`);

for (const model of MODELS) {
  setActiveModel(model);
  console.log("\n" + "─".repeat(70));
  console.log(`MODEL: ${model}`);
  console.log("─".repeat(70));

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    const usage = [];
    setUsageSink((u) => usage.push(u));
    const t0 = Date.now();
    let audit = null;
    let error = null;
    let pdfBytes = 0;
    let pdfSrc = "?";
    try {
      const pdfMeta = await loadTestPdf(tc);
      pdfBytes = pdfMeta.bytes;
      pdfSrc = pdfMeta.source_label;
      const solicitation = await loadSolicitation(tc, pdfMeta);
      audit = await runAudit({ solicitation, pdfBase64: pdfMeta.base64 });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const wallMs = Date.now() - t0;
    setUsageSink(null);

    // Persist per-run JSON
    const fname = `${model.includes("opus") ? "opus" : "sonnet"}-${tc.notice_id}.json`;
    const out = { tc, model, audit, usage, wallMs, error, pdfBytes, pdfSrc };
    writeFileSync(join(OUTPUT_DIR, fname), JSON.stringify(out, null, 2));

    const inT = usage.reduce((s, u) => s + u.input_tokens, 0);
    const outT = usage.reduce((s, u) => s + u.output_tokens, 0);
    const cost = (inT / 1e6) * PRICING[model].input + (outT / 1e6) * PRICING[model].output;

    console.log(`  [${i + 1}/${TEST_CASES.length}] ${tc.label}`);
    console.log(`    pdf: ${pdfBytes.toLocaleString()} bytes · ${pdfSrc}`);
    if (error) {
      console.log(`    ✗ ERROR: ${error.slice(0, 120)}`);
    } else {
      console.log(`    ✓ ${audit?.classification?.document_type || "?"} · ${audit?.recommendation || "?"} · score ${audit?.compliance_score ?? "?"}/100`);
      console.log(`    calls=${usage.length} input=${inT.toLocaleString()} output=${outT.toLocaleString()} · ${dollars(cost)} · ${(wallMs / 1000).toFixed(1)}s`);
    }
    results.push({ tc, model, audit, usage, wallMs, error, pdfBytes, cost, inT, outT });
  }
}

setActiveModel(null);

// ━━ Cost summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log("\n" + "=".repeat(70));
console.log("COST COMPARISON (per-audit averages · 6-audit total · 10K projection)");
console.log("=".repeat(70));

function modelStats(model) {
  const rows = results.filter((r) => r.model === model && !r.error);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const avgCost = rows.length ? totalCost / rows.length : 0;
  const avgWall = rows.length ? rows.reduce((s, r) => s + r.wallMs, 0) / rows.length : 0;
  const avgIn = rows.length ? rows.reduce((s, r) => s + r.inT, 0) / rows.length : 0;
  const avgOut = rows.length ? rows.reduce((s, r) => s + r.outT, 0) / rows.length : 0;
  return { rows, totalCost, avgCost, avgWall, avgIn, avgOut, ok: rows.length, total: results.filter((r) => r.model === model).length };
}

const opus = modelStats("claude-opus-4-7");
const sonnet = modelStats("claude-sonnet-4-6");

const fmtRow = (label, o, s) => `  ${label.padEnd(28)} ${o.padStart(14)}  ${s.padStart(14)}`;
console.log(fmtRow("metric", "opus-4-7", "sonnet-4-6"));
console.log("  " + "─".repeat(60));
console.log(fmtRow("audits ok / total", `${opus.ok}/${opus.total}`, `${sonnet.ok}/${sonnet.total}`));
console.log(fmtRow("avg input tokens", opus.avgIn.toFixed(0), sonnet.avgIn.toFixed(0)));
console.log(fmtRow("avg output tokens", opus.avgOut.toFixed(0), sonnet.avgOut.toFixed(0)));
console.log(fmtRow("avg wall-clock (s)", (opus.avgWall / 1000).toFixed(1), (sonnet.avgWall / 1000).toFixed(1)));
console.log(fmtRow("avg cost / audit", dollars(opus.avgCost), dollars(sonnet.avgCost)));
console.log(fmtRow("total cost (6 audits)", dollars(opus.totalCost), dollars(sonnet.totalCost)));
console.log(fmtRow("projected · 10K audits", dollars(opus.avgCost * 10000), dollars(sonnet.avgCost * 10000)));
const sav = opus.avgCost > 0 ? (1 - sonnet.avgCost / opus.avgCost) * 100 : 0;
console.log(`\n  Sonnet savings vs Opus: ${sav.toFixed(1)}%`);

// ━━ Diff report ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const lines = [];
lines.push("# Quality Gate · Sonnet 4.6 vs Opus 4.7 · Diff Report");
lines.push("");
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push(`Test cases: ${TEST_CASES.length} · Total Claude pipelines: ${TEST_CASES.length * MODELS.length}`);
lines.push("");
lines.push("## Cost summary");
lines.push("");
lines.push("| Metric | Opus 4.7 | Sonnet 4.6 |");
lines.push("|---|---|---|");
lines.push(`| Audits ok / total | ${opus.ok}/${opus.total} | ${sonnet.ok}/${sonnet.total} |`);
lines.push(`| Avg input tokens | ${opus.avgIn.toFixed(0)} | ${sonnet.avgIn.toFixed(0)} |`);
lines.push(`| Avg output tokens | ${opus.avgOut.toFixed(0)} | ${sonnet.avgOut.toFixed(0)} |`);
lines.push(`| Avg wall-clock | ${(opus.avgWall / 1000).toFixed(1)}s | ${(sonnet.avgWall / 1000).toFixed(1)}s |`);
lines.push(`| Avg cost / audit | ${dollars(opus.avgCost)} | ${dollars(sonnet.avgCost)} |`);
lines.push(`| 6-audit total | ${dollars(opus.totalCost)} | ${dollars(sonnet.totalCost)} |`);
lines.push(`| 10K projection | ${dollars(opus.avgCost * 10000)} | ${dollars(sonnet.avgCost * 10000)} |`);
lines.push(`| Sonnet savings | — | ${sav.toFixed(1)}% |`);
lines.push("");

// Per-audit comparison
lines.push("## Per-audit comparison");
lines.push("");

let traps_match_baseline = { hex: false, fob: false, clin: false };
let total_clauses_jaccard = 0;
let clauses_jaccard_count = 0;
let same_doctype_count = 0;
let total_with_both_ok = 0;
let any_retries = false;

for (const tc of TEST_CASES) {
  const o = results.find((r) => r.tc.notice_id === tc.notice_id && r.model === "claude-opus-4-7");
  const s = results.find((r) => r.tc.notice_id === tc.notice_id && r.model === "claude-sonnet-4-6");

  lines.push(`### ${tc.notice_id} — ${tc.label}`);
  lines.push("");
  if (o?.error) lines.push(`- Opus: ✗ ERROR — ${o.error}`);
  if (s?.error) lines.push(`- Sonnet: ✗ ERROR — ${s.error}`);
  if (o?.error || s?.error) {
    lines.push("");
    continue;
  }
  total_with_both_ok++;

  const oA = o.audit, sA = s.audit;
  const oC = oA?.classification, sC = sA?.classification;
  const oOv = oA?.overview?.json || {}, sOv = sA?.overview?.json || {};
  const oCm = oA?.compliance?.json || {}, sCm = sA?.compliance?.json || {};
  const oR = oA?.risks?.json || {}, sR = sA?.risks?.json || {};

  // Classification
  const sameDoc = oC?.document_type === sC?.document_type;
  if (sameDoc) same_doctype_count++;
  lines.push(`- **Classification**: Opus → \`${oC?.document_type}\` (${oC?.confidence}) · Sonnet → \`${sC?.document_type}\` (${sC?.confidence}) · ${sameDoc ? "✓ match" : "✗ DIVERGE"}`);

  // Overview signals
  const oCli = oCm.clins?.length || 0;
  const sCli = sCm.clins?.length || 0;
  lines.push(`- **CLIN count**: Opus ${oCli} · Sonnet ${sCli} · ${oCli === sCli ? "✓" : "Δ " + Math.abs(oCli - sCli)}`);
  lines.push(`- **Customer/Agency**: Opus → ${(oOv.customer || "?").slice(0,60)} · Sonnet → ${(sOv.customer || "?").slice(0,60)}`);

  // Compliance: clause set diff
  const farDiff = setOps(oCm.far_clauses, sCm.far_clauses);
  const dfarsDiff = setOps(oCm.dfars_clauses, sCm.dfars_clauses);
  total_clauses_jaccard += (farDiff.jaccard + dfarsDiff.jaccard) / 2;
  clauses_jaccard_count++;
  lines.push(`- **FAR clauses**: Opus ${(oCm.far_clauses||[]).length} · Sonnet ${(sCm.far_clauses||[]).length} · Jaccard ${(farDiff.jaccard*100).toFixed(0)}% · only-Opus: ${farDiff.onlyA.length} · only-Sonnet: ${farDiff.onlyB.length}`);
  lines.push(`- **DFARS clauses**: Opus ${(oCm.dfars_clauses||[]).length} · Sonnet ${(sCm.dfars_clauses||[]).length} · Jaccard ${(dfarsDiff.jaccard*100).toFixed(0)}% · only-Opus: ${dfarsDiff.onlyA.length} · only-Sonnet: ${dfarsDiff.onlyB.length}`);

  // Risks: P0/P1/P2 sets
  const priO = oR.prioritized_risks || [];
  const priS = sR.prioritized_risks || [];
  const p0O = priO.filter((r) => r.priority === "P0").length;
  const p0S = priS.filter((r) => r.priority === "P0").length;
  lines.push(`- **Prioritized risks**: Opus ${priO.length} (P0=${p0O}) · Sonnet ${priS.length} (P0=${p0S})`);
  lines.push(`- **Bid recommendation**: Opus → \`${oA.recommendation}\` · Sonnet → \`${sA.recommendation}\` · ${oA.recommendation === sA.recommendation ? "✓ match" : "DIVERGE"}`);

  // Baseline-specific trap detection
  if (tc.notice_id === "FA301626Q0068") {
    const oHex = detectTrap(oCm, "252.223-7008");
    const sHex = detectTrap(sCm, "252.223-7008");
    const oFob = (oCm.fob_conflicts || []).length > 0;
    const sFob = (sCm.fob_conflicts || []).length > 0;
    // CLIN ambiguity = any clin with status=ambiguous (engine post-process)
    const oAmb = (oCm.clins || []).some((c) => c.status === "ambiguous");
    const sAmb = (sCm.clins || []).some((c) => c.status === "ambiguous");
    traps_match_baseline.hex = oHex && sHex;
    traps_match_baseline.fob = oFob && sFob;
    traps_match_baseline.clin = oAmb && sAmb;
    lines.push(`- **TRAP · hex-chrome (252.223-7008)**: Opus ${oHex ? "✓" : "✗"} · Sonnet ${sHex ? "✓" : "✗"} · ${oHex === sHex ? (oHex ? "✓ both detected" : "neither detected") : "DIVERGE"}`);
    lines.push(`- **TRAP · FOB conflict**: Opus ${oFob ? "✓" : "✗"} · Sonnet ${sFob ? "✓" : "✗"} · ${oFob === sFob ? (oFob ? "✓ both detected" : "neither detected") : "DIVERGE"}`);
    lines.push(`- **TRAP · CLIN ambiguity**: Opus ${oAmb ? "✓" : "✗"} · Sonnet ${sAmb ? "✓" : "✗"} · ${oAmb === sAmb ? (oAmb ? "✓ both detected" : "neither detected") : "DIVERGE"}`);
  }

  // Retry detection — usage call count > 4 means at least one retry fired
  const oRetried = (o.usage?.length || 0) > 4;
  const sRetried = (s.usage?.length || 0) > 4;
  if (oRetried || sRetried) any_retries = true;
  lines.push(`- **Calls**: Opus ${o.usage?.length || 0}${oRetried ? " (retry)" : ""} · Sonnet ${s.usage?.length || 0}${sRetried ? " (retry)" : ""}`);

  lines.push("");
}

const avgClauseJaccard = clauses_jaccard_count ? total_clauses_jaccard / clauses_jaccard_count : 0;

// ━━ Verdict ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
lines.push("## Verdict");
lines.push("");

const baseline_traps_all = traps_match_baseline.hex && traps_match_baseline.fob && traps_match_baseline.clin;
const clause_tolerance = 0.70; // Jaccard ≥ 70% counts as "within tolerance"
const clauses_within_tol = avgClauseJaccard >= clause_tolerance;
const same_doc_ratio = total_with_both_ok ? same_doctype_count / total_with_both_ok : 0;

let verdict = "FAIL";
let rationale = "";
if (baseline_traps_all && clauses_within_tol && same_doc_ratio >= 0.83 && !any_retries) {
  verdict = "PASS";
  rationale = `Sonnet matches Opus on all 3 baseline traps · clause-set Jaccard ${(avgClauseJaccard*100).toFixed(0)}% (≥${clause_tolerance*100}%) · classification agreement ${(same_doc_ratio*100).toFixed(0)}% · no JSON retries fired. Proceed with model swap.`;
} else if (baseline_traps_all && clauses_within_tol) {
  verdict = "PARTIAL PASS";
  rationale = `Baseline traps OK + clauses within tolerance, but ${same_doc_ratio < 0.83 ? `classification diverges (${(same_doc_ratio*100).toFixed(0)}% match)` : ""}${any_retries ? " · JSON retries fired (escalation router needed for failing call)" : ""}. Consider escalation router for specific calls.`;
} else {
  verdict = "FAIL";
  const reasons = [];
  if (!traps_match_baseline.hex) reasons.push("hex-chrome trap missed");
  if (!traps_match_baseline.fob) reasons.push("FOB conflict missed");
  if (!traps_match_baseline.clin) reasons.push("CLIN ambiguity missed");
  if (!clauses_within_tol) reasons.push(`clause set Jaccard ${(avgClauseJaccard*100).toFixed(0)}% below tolerance (${clause_tolerance*100}%)`);
  rationale = `Sonnet ${reasons.join(" · ")}. Keep Opus; pursue other cost levers (caching · PDF caps · pre-filter no-PDF rows).`;
}

lines.push(`**${verdict}**`);
lines.push("");
lines.push(rationale);
lines.push("");
lines.push("## Verdict signals");
lines.push("");
lines.push(`- Baseline trap parity: hex=${traps_match_baseline.hex ? "✓" : "✗"} · fob=${traps_match_baseline.fob ? "✓" : "✗"} · clin=${traps_match_baseline.clin ? "✓" : "✗"}`);
lines.push(`- Clause-set Jaccard avg: ${(avgClauseJaccard * 100).toFixed(1)}% (target ≥${clause_tolerance * 100}%)`);
lines.push(`- Classification agreement: ${same_doctype_count}/${total_with_both_ok} (${(same_doc_ratio * 100).toFixed(0)}%)`);
lines.push(`- JSON retries fired: ${any_retries ? "yes" : "no"}`);
lines.push(`- Cost reduction: ${sav.toFixed(1)}%`);

const reportPath = join(OUTPUT_DIR, "diff-report.md");
writeFileSync(reportPath, lines.join("\n"));

console.log(`\n${"=".repeat(70)}`);
console.log(`VERDICT: ${verdict}`);
console.log("=".repeat(70));
console.log(rationale);
console.log(`\nDiff report: ${reportPath}`);
console.log(`Per-audit JSON: ${OUTPUT_DIR}/{opus,sonnet}-<notice_id>.json`);
