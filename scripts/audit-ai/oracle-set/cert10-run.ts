// CERT-10 CAMPAIGN RUNNER (Brain cards 280/282/283/284) — the customer-ready done-gate for the JUDGMENT-FIRST
// engine (PROPOSE → rail → DISPOSE). Runs each frozen CERT-10 case through the REAL runJudgmentFirstAudit and
// scores the DISPOSED (customer-facing) verdict against EXTERNAL adjudicated truth (oracle cases: SBA OHA + GAO)
// or the CEO-Gate-3 expectation (held committal targets + engineered incompletes). This is the external-reality
// vote the anti-overclaim doctrine [[feedback_no_external_reality_vote]] demands before we may say "customer-ready".
//
//   $0 DRY  (default):        npx tsx scripts/audit-ai/oracle-set/cert10-run.ts            → stub engine, validates
//                             npx tsx scripts/audit-ai/oracle-set/cert10-run.ts --dry-negative   wiring + scoring
//   PAID cheap-9:             npx tsx scripts/audit-ai/oracle-set/cert10-run.ts --confirm-paid
//   PAID + W9126 (chunked):   npx tsx scripts/audit-ai/oracle-set/cert10-run.ts --confirm-paid --with-w9126
//
// STAGING (cost discipline [[feedback_paid_run_cost_discipline]]): the "cheap-9" (6 oracle + FA301626 + 2 engineered
// incompletes) all fit context and run first. W9126G26RA087 (11.3MB → chunked ingest, the expensive leg) runs ONLY
// with --with-w9126 AND only after cheap-9 shows ZERO blockers. Any committal-direction blocker aborts before W9126.
//
// PROD-FAITHFUL FLAGS: the deterministic rail runs under the committal-gate flags that are prod-ON (Vercel ground
// truth, read 2026-07-05) + the branch's card-275 safety seals. See PROD_FLAGS below for the exact set + rationale.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  scoreOracleCase, summarizeOracle, type OracleCase, type OracleManifest, type ScoredCase,
} from "./oracle-harness";
import type { Verdict } from "../../../src/lib/audit-decide";
import { sweepConstructionManifest, type ConstructionManifest } from "../../../src/lib/audit-construction-manifest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLD = path.join(HERE, "..", "gold-sets");

// ── PROD-FAITHFUL COMMITTAL-GATE FLAGS ────────────────────────────────────────────────────────────────────────
// The judgment-first RAIL = runAgenticAudit(seedFindings)→deriveVerdict. These are the flags that materially shape
// its deterministic derivation and are ON in prod (Vercel `faraudit-app` production, read via _read-prod-audit-flags
// 2026-07-05) PLUS the two card-275 safety seals that ship on this branch and represent post-merge prod. All are
// SAFETY/typing guards — none turns a bar into a non-bar.
const PROD_FLAGS: Record<string, string> = {
  AUDIT_ELIGIBLE_TRISTATE: "true",       // prod-ON — eligibility never false on an undetermined verdict
  AUDIT_NMR_FIRMSTATUS_GATE: "true",     // prod-ON — no-manner-of-response arrangement class
  AUDIT_PROCUREMENT_TYPE_SECTIONS: "true", // prod-ON — commercial vs UCF section typing (FA301626 is commercial)
  AUDIT_SETASIDE_OVERTYPE_GUARD: "true", // prod-ON — set-aside identity typing
  AUDIT_KEYFACT_DETECTOR: "true",        // prod-ON
  AUDIT_PROCEDURAL_COVERAGE_LENS: "true", // prod-ON — P2.5 runs UNCONDITIONALLY (not a lens loop); grounds §L/§M
                                          //   obligations so the completeness gate isn't starved on commercial docs
  AUDIT_TEMPORAL_SHARED_ARO: "true",     // prod-ON
  AUDIT_PROMPT_CACHE: "true",            // prod-ON — the cost lever (PR#153)
  AUDIT_UCF_UPPERCASE_GUARD: "true",     // branch seal (card-275) — no false UCF header matches in prose
  AUDIT_FOURWALLS_NOBID: "true",         // branch seal (card-275) — NO_BID needs allowlist+excerpt+hash+verifier
  AUDIT_VERIFIER_BATCHING: "true",       // card-285 Fix 1 — batch skeptic + residue doctrine (verifier-soundness root)
  AUDIT_BOILERPLATE_ATTEST: "true",      // card-285 Fix 2 — §I/§K trap sweep + boilerplate attestation
  // DELIBERATELY OMITTED / OFF:
  //  • AUDIT_JUDGMENT_LAYER — INERT on the judgment-first rail (audit-package.ts:236 passes NO judgmentReason/
  //    judgmentEntail caller to the seed-mode rail), so setting it changes no result — it would only risk the boot
  //    coupling-lock / verifier-registration ceremony. The proposer, not J-1/J-2, is the judgment source here.
  //  • AUDIT_HONESTFAIL_NO_CHARGE — OFF (matches prod default + Card 261: single-source honest_fail not yet flipped).
  //  • AUDIT_SECTION_FINDER / AUDIT_CHUNKED_INGEST — ingest-path flags; inert for a pre-assembled fullSource. W9126
  //    chunking is performed EXPLICITLY below (assembleFullSourceChunked), so the behaviour is present, not skipped.
};

const CONFIRM_PAID = process.argv.includes("--confirm-paid");
const WITH_W9126 = process.argv.includes("--with-w9126");
const DRY_NEGATIVE = process.argv.includes("--dry-negative");
const DRY = !CONFIRM_PAID;

// In DRY mode leave real flags untouched (no engine call). In PAID mode SET the faithful flag state (override
// whatever .env.local carried) so the run is reproducible and prod-representative.
if (!DRY) for (const [k, v] of Object.entries(PROD_FLAGS)) process.env[k] = v;

// ── CASE MODEL ────────────────────────────────────────────────────────────────────────────────────────────────
type Grader = "oracle" | "ceo-gate3";
interface FirmFacts { satisfiesSizeStandard?: boolean; closedWorld?: boolean; basis?: string; }
interface RunCase {
  n: number; id: string; grader: Grader;
  sourcePath: string;              // primary source file (absolute)
  fullDocPath?: string;            // richer FULL-DOC source (absolute) — used when present
  feedFirmFacts?: boolean; firmFactsPath?: string;
  naics?: string | null; setAside?: string | null;
  oracle?: OracleCase;             // present for grader==="oracle" (carries acceptable/blocker)
  expected?: string;               // gate3: the target verdict
  mustDecide?: boolean;            // criterion 5 (card 285): clean/complete package → honest-fail = FAILED
  blocker: Verdict[];              // committal-direction contradictions (hard fail)
  needsChunk?: boolean;            // W9126 — assemble via map-reduce before the engine sees it
  fullDocRanEligible?: boolean;    // counts toward Brain R5 (>=2-3 FULL-DOC ran)
}

function loadManifest<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(HERE, rel), "utf8")) as T;
}

function buildCases(): RunCase[] {
  const oracleM = loadManifest<OracleManifest>("oracle-manifest.json");
  const oracleById = new Map(oracleM.cases.map((c) => [c.id, c]));
  const cert = loadManifest<{ cases: Array<Record<string, unknown>> }>("cert10-manifest.json");
  const cases: RunCase[] = [];
  for (const cc of cert.cases) {
    const id = cc.id as string;
    const n = cc.n as number;
    const grader = cc.grader as Grader;
    if (grader === "oracle") {
      const oc = oracleById.get(id);
      if (!oc) throw new Error(`oracle case '${id}' not in oracle-manifest`);
      // FILE paths come from the cert10-manifest (`source`/`fullDoc`); the oracle-manifest's `source` is provenance
      // ("SBA-OHA"), not a filename. acceptable/blocker/feedFirmFacts/naics come from the oracle-manifest.
      const src = path.join(HERE, cc.source as string);
      const fullDoc = cc.fullDoc ? path.join(HERE, cc.fullDoc as string) : oc.fullDocSource ? path.join(HERE, oc.fullDocSource) : undefined;
      cases.push({
        n, id, grader,
        sourcePath: src, fullDocPath: fullDoc,
        feedFirmFacts: !!(oc as unknown as { feedFirmFacts?: boolean }).feedFirmFacts,
        firmFactsPath: path.join(HERE, `${id}.firmfacts.json`),
        naics: (oc as unknown as { naics?: string }).naics ?? null,
        setAside: (oc as unknown as { setAside?: string }).setAside ?? null,
        oracle: oc, blocker: oc.blocker,
        fullDocRanEligible: !!fullDoc,
      });
    } else {
      // gate3: source path is relative to the manifest (oracle-set dir)
      const rawSrc = cc.source as string;
      const resolved = rawSrc.includes("FA301626")
        ? path.join(HERE, "FA301626Q0068-FULL-SOURCE.txt")   // pre-extracted PDF text
        : path.resolve(HERE, rawSrc);
      cases.push({
        n, id, grader,
        sourcePath: resolved,
        expected: cc.expected as string,
        mustDecide: cc.mustDecide === true,
        blocker: (cc.blocker as Verdict[]) ?? [],
        needsChunk: id === "W9126G26RA087",
        // NAICS is an authoritative SAM FACT the prod executor passes from the SAM cross-ref (solicitation.naicsCode).
        // W9126G26RA087 is a USACE construction buy — NAICS 236220. The harness must pass it so the construction
        // classifier (isConstruction) sees the same authoritative signal prod does; the primary here is the SAM
        // synopsis (no SF-1442 header — the form is in Attachment 2), so NAICS is the load-bearing construction signal.
        naics: id === "W9126G26RA087" ? "236220" : null,
        fullDocRanEligible: id === "W9126G26RA087" || id === "FA301626Q0068",
      });
    }
  }
  return cases;
}

// ── FIRM-FACTS → BIDDER PROFILE ───────────────────────────────────────────────────────────────────────────────
// Brain R2(i): the OHA-established firm facts are fed as the bidder profile (NEUTRAL facts only). We honour the
// fixture's `closedWorld`. satisfiedAttributes is left EMPTY: we cannot predict the exact requiredAttribute string
// the proposer will emit, and closed-world matching is exact-only. This is FAIL-SAFE by construction — DISPOSE
// emits a committal ONLY on proposer↔rail agreement, so an eligible firm whose rail (empty closed-world profile)
// over-reaches to INELIGIBLE is DISPOSED to NHR (the proposer, reading the firm facts, disagrees) — which sits in
// every eligible case's `acceptable` set. It can never produce a false-eligible OR false-ineligible BLOCKER. The
// real ineligibility signal reaches the PROPOSER holistically via the firm-facts block appended to the source.
interface Profile { satisfiedAttributes: string[]; closedWorld?: boolean }
function profileFromFirmFacts(ff: FirmFacts): Profile {
  return { satisfiedAttributes: [], closedWorld: ff.closedWorld === true };
}

function assembleSource(rc: RunCase): { fullSource: string; usedFullDoc: boolean; profile: Profile | null } {
  const base = rc.fullDocPath && fs.existsSync(rc.fullDocPath) ? rc.fullDocPath : rc.sourcePath;
  let text = fs.readFileSync(base, "utf8");
  let profile: Profile | null = null;
  if (rc.feedFirmFacts && rc.firmFactsPath && fs.existsSync(rc.firmFactsPath)) {
    const ff = JSON.parse(fs.readFileSync(rc.firmFactsPath, "utf8")) as FirmFacts;
    profile = profileFromFirmFacts(ff);
    if (ff.basis) {
      text += `\n\n==== OHA-ESTABLISHED FIRM FACTS (bidder profile, neutral) ====\n${ff.basis}`;
    }
  }
  return { fullSource: text, usedFullDoc: base === rc.fullDocPath, profile };
}

// Parse a concatenated "==== DOCUMENT: name ====" dump back into AgenticDoc[] for the chunker. Doc 0 is treated as
// the load-bearing primary (never compressed); the huge drawing/spec attachments compress largest-first.
function parseDocs(text: string): Array<{ name: string; text: string }> {
  const re = /^==== DOCUMENT: (.+?) ====$/gm;
  const docs: Array<{ name: string; text: string }> = [];
  let m: RegExpExecArray | null;
  const marks: Array<{ name: string; start: number; bodyStart: number }> = [];
  while ((m = re.exec(text)) !== null) marks.push({ name: m[1].trim(), start: m.index, bodyStart: re.lastIndex });
  if (marks.length === 0) return [{ name: "primary", text }];
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : text.length;
    docs.push({ name: marks[i].name, text: text.slice(marks[i].bodyStart, end).trim() });
  }
  return docs;
}

// ── SCORING ───────────────────────────────────────────────────────────────────────────────────────────────────
type Status = "PASS" | "BLOCKER" | "CONSERVATIVE" | "WATCH" | "UNEXPECTED";
interface CaseOutcome {
  n: number; id: string; grader: Grader; verdict: Verdict; eligible: boolean | null;
  honestFail: boolean; billed: boolean; status: Status; blocker: boolean; note: string;
  proposed?: Verdict; railDerived?: Verdict; usedFullDoc: boolean; costUsd: number; calls: number; wallSec: number;
}

const HONEST_FAIL: ReadonlySet<Verdict> = new Set<Verdict>(["NEEDS_HUMAN_REVIEW", "INCOMPLETE"]);

// `expected` in cert10-manifest is PROSE ("BID / BID_WITH_CAUTION", "INCOMPLETE (honest-fail, no bill)"). Parse the
// Verdict tokens it names into the accept set (longest-token-first so BID_WITH_CAUTION isn't shadowed by BID).
const VERDICT_TOKENS: Verdict[] = ["BID_WITH_CAUTION", "NEEDS_HUMAN_REVIEW", "NO_BID", "INELIGIBLE", "INCOMPLETE", "BID"];
function parseExpectedSet(expected?: string): Set<Verdict> {
  const s = new Set<Verdict>();
  if (!expected) return s;
  let rest = expected.toUpperCase();
  for (const t of VERDICT_TOKENS) if (rest.includes(t)) { s.add(t); rest = rest.split(t).join(" "); }
  return s;
}
function scoreGate3(rc: RunCase, verdict: Verdict): { status: Status; blocker: boolean; note: string } {
  if (rc.blocker.includes(verdict)) return { status: "BLOCKER", blocker: true, note: `${verdict} contradicts CEO-Gate-3 expectation (${rc.expected})` };
  const expect = parseExpectedSet(rc.expected);
  if (expect.has(verdict)) return { status: "PASS", blocker: false, note: `matches expected {${[...expect].join(", ")}}` };
  // CRITERION 5 (Brain card 285): on a clean/complete package the engine MUST reach a DECIDED verdict — an honest-fail
  // (INCOMPLETE/NHR) on a mustDecide case is a customer-readiness FAILURE (safe ≠ shipped), scored as a blocker so the
  // run is not clean and the W9126 leg is held. Honest-fail passes ONLY on the engineered-broken packages (mustDecide off).
  if (HONEST_FAIL.has(verdict)) {
    if (rc.mustDecide) return { status: "BLOCKER", blocker: true, note: `CRITERION 5 FAIL — honest-fail (${verdict}) on a clean/complete package; must reach a DECIDED verdict {${[...expect].join(", ")}}` };
    return { status: "CONSERVATIVE", blocker: false, note: `honest-fail (${verdict}) vs expected {${[...expect].join(", ")}} — conservative, no committal error` };
  }
  return { status: "UNEXPECTED", blocker: false, note: `${verdict} — neither expected nor blocker; review` };
}

// ── ENGINE ────────────────────────────────────────────────────────────────────────────────────────────────────
type EngineOut = { verdict: Verdict; eligible: boolean | null; proposed?: Verdict; railDerived?: Verdict };

// DRY stub: the "perfect" externally-correct verdict per case (proves wiring + scoring + the gate catch a negative).
const DRY_PERFECT: Record<string, Verdict> = {
  "SBA-SIZ-6373-underdogs": "INELIGIBLE", "SBA-SIZ-6379-uncomn": "BID", "SBA-SIZ-6381-sgi-global": "BID",
  "SBA-SIZ-6380-nisou-negative": "NEEDS_HUMAN_REVIEW", "GAO-B-424249-fcn-negative": "BID",
  "GAO-B-423993-ecs-caution": "BID_WITH_CAUTION",
  "W9126G26RA087": "BID_WITH_CAUTION", "FA301626Q0068": "BID",
  "CERT10-incomplete-A": "INCOMPLETE", "CERT10-incomplete-B": "INCOMPLETE",
};

async function runEngine(rc: RunCase, deps: EngineDeps): Promise<EngineOut> {
  if (DRY) {
    // NEGATIVE self-test proves BOTH gates fail on a real error: (a) a committal contradiction on the eligible
    // sgi oracle case; (b) CRITERION 5 — an honest-fail on FA301626 (mustDecide) must be caught as a FAILURE.
    if (DRY_NEGATIVE && rc.id === "SBA-SIZ-6381-sgi-global") return { verdict: "INELIGIBLE", eligible: false };
    if (DRY_NEGATIVE && rc.id === "FA301626Q0068") return { verdict: "INCOMPLETE", eligible: null };
    return { verdict: DRY_PERFECT[rc.id] ?? "NEEDS_HUMAN_REVIEW", eligible: null };
  }
  const { fullSource, profile } = assembleSource(rc);
  let source = fullSource;
  // Brain card 288 — SEALED construction manifest over the FULL (pre-compression) per-doc text. Computed from the
  // ORIGINAL fullSource docs, NEVER the compressed digest (else the gate would certify from the compressor). Gated by
  // AUDIT_CONSTRUCTION_SWEEP; undefined when off ⇒ the part36 carrier is absent (byte-identical non-construction path).
  const constructionManifest: ConstructionManifest | undefined = process.env.AUDIT_CONSTRUCTION_SWEEP === "true"
    ? sweepConstructionManifest(parseDocs(fullSource).map((d) => ({ name: d.name, text: d.text })), rc.naics ?? null)
    : undefined;
  // HARNESS FIX (Brain card 286-B, mandatory-first): PER-CASE timeout isolation — a fresh AbortSignal per case,
  // NEVER shared. The prior single shared 20-min signal let cheap-9 consume most of the budget so W9126's
  // compression aborted ~40% through → a false-INCOMPLETE (the artifact that invalidated the prior diagnosis,
  // Rule 69). Each case now gets its own full budget; the map caller is rebuilt bound to THIS case's signal.
  const caseSignal = AbortSignal.timeout(PER_CASE_TIMEOUT_MS);
  if (rc.needsChunk) {
    const docs = parseDocs(fullSource).map((d) => ({ name: d.name, bytes: Buffer.from(d.text, "utf8"), text: d.text }));
    const before = docs.reduce((n, d) => n + d.text.length, 0);
    console.log(`   ↳ chunked ingest: ${docs.length} docs, ${(before / 1e6).toFixed(2)}M chars → compressing to ≤${(deps.MAX / 1e6).toFixed(2)}M (concurrency ${process.env.AGENTIC_MAP_CONCURRENCY || 6}) …`);
    const asm = await deps.assembleFullSourceChunked(docs, deps.makeMapCall(caseSignal), deps.MAX, caseSignal);
    source = asm.source;
    // Save the compressed digest so a rail-verdict diagnosis is CHEAP (~$0.20 re-audit of this file) instead of a
    // full $3.74 recompression. The expensive part is the ~314 paid map calls; the digest is the reusable artifact.
    try { fs.writeFileSync(path.join(HERE, `_${rc.id}-compressed-digest.txt`), source); console.log(`   ↳ saved compressed digest → _${rc.id}-compressed-digest.txt (${source.length} chars)`); } catch { /* non-fatal */ }
    console.log(`   ↳ assembled ${(source.length / 1e6).toFixed(2)}M chars · truncated=${asm.truncated} · contentLoss=[${asm.contentLossDocs.join(",")}]`);
    if (asm.truncated) return { verdict: "INCOMPLETE", eligible: null };  // honest-fail — an incomplete read can't commit
  }
  const res = await deps.runJudgmentFirstAudit({
    fullSource: source, bidderProfile: profile, naics: rc.naics ?? null, setAside: rc.setAside ?? null, signal: caseSignal, constructionManifest,
    groundingSource: fullSource,  // Brain card 291 — model reads the compressed `source`; grounding is against the ORIGINAL full text
  });
  return { verdict: res.disposed.verdict, eligible: res.disposed.eligible, proposed: res.proposed.verdict, railDerived: res.railDerived.verdict };
}

// Per-case wall-clock budget (Brain card 286-B). Each CERT case gets its OWN fresh timeout — never shared. Generous
// so the biggest chunked package (W9126) has full room under parallel compression; cheap cases finish far sooner.
const PER_CASE_TIMEOUT_MS = 15 * 60 * 1000;
interface EngineDeps {
  runJudgmentFirstAudit: (i: { fullSource: string; bidderProfile: Profile | null; naics: string | null; setAside: string | null; signal?: AbortSignal; constructionManifest?: ConstructionManifest; groundingSource?: string }) => Promise<{ disposed: { verdict: Verdict; eligible: boolean | null }; proposed: { verdict: Verdict }; railDerived: { verdict: Verdict } }>;
  assembleFullSourceChunked: (docs: Array<{ name: string; bytes: Buffer; text: string }>, mapCall: unknown, maxChars: number, signal?: AbortSignal) => Promise<{ source: string; truncated: boolean; contentLossDocs: string[] }>;
  makeMapCall: (signal: AbortSignal) => unknown; MAX: number;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  const cases = buildCases();
  // sanity: every source present
  for (const c of cases) {
    const p = c.fullDocPath && fs.existsSync(c.fullDocPath) ? c.fullDocPath : c.sourcePath;
    if (!fs.existsSync(p)) { console.error(`⛔ source MISSING for ${c.id}: ${p}`); process.exit(2); }
  }

  console.log(`\n=== CERT-10 CAMPAIGN RUNNER — ${DRY ? (DRY_NEGATIVE ? "$0 DRY (NEGATIVE self-test)" : "$0 DRY") : "PAID"} ===`);
  if (!DRY) console.log("prod-faithful flags:", Object.keys(PROD_FLAGS).filter((k) => process.env[k] === "true").join(" · "));

  // Build engine deps (paid only).
  let deps: EngineDeps | null = null;
  const usageCalls: unknown[] = [];
  let aggregate!: (calls: unknown[]) => { perModel: unknown[]; totals: { usd: number; calls: number; unpriced_calls?: number } };
  let appendLedgerRow!: (row: Record<string, unknown>) => void;
  if (!DRY) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) { console.error("⛔ ANTHROPIC_API_KEY not set — cannot run PAID."); process.exit(2); }
    const pkg = await import("../../../src/lib/audit-package");
    const chunk = await import("../../../src/lib/agentic-chunked-ingest");
    const exec = await import("../../../src/lib/agentic-executor");
    const structured = await import("../../../src/lib/anthropic-structured");
    const registry = await import("../../../src/lib/model-registry");
    const expert = await import("../../../src/lib/audit-expert");
    const ledger = await import("../cost-ledger");
    aggregate = ledger.aggregate as typeof aggregate;
    appendLedgerRow = ledger.appendLedgerRow as unknown as typeof appendLedgerRow;
    (expert.setExpertUsageSink as (s: (u: unknown) => void) => void)((u) => usageCalls.push(u));
    (structured.setStructuredUsageSink as (s: (u: unknown) => void) => void)((u) => usageCalls.push(u));
    const callStructured = async (a: { model: string; system: string; user: string; schema: object; maxTokens: number; signal?: AbortSignal }) =>
      (await structured.callStructuredClaude({ apiKey, model: a.model, system: a.system, userPrompt: a.user, schema: a.schema as Record<string, unknown>, maxTokens: a.maxTokens, signal: a.signal, label: "cert10-chunk-map" })).text;
    const makeMapCall = (sig: AbortSignal) => chunk.makeChunkMapCaller(callStructured, registry.modelFor("extractor"), sig);
    deps = {
      runJudgmentFirstAudit: pkg.runJudgmentFirstAudit as unknown as EngineDeps["runJudgmentFirstAudit"],
      assembleFullSourceChunked: chunk.assembleFullSourceChunked as unknown as EngineDeps["assembleFullSourceChunked"],
      makeMapCall, MAX: exec.MAX_FULLSOURCE_CHARS,
    };
  }

  const outcomes: CaseOutcome[] = [];
  const cheap = cases.filter((c) => !c.needsChunk).sort((a, b) => a.n - b.n);
  const expensive = cases.filter((c) => c.needsChunk);

  async function runOne(rc: RunCase): Promise<CaseOutcome> {
    const before = usageCalls.length;
    const t0 = Date.now();
    const out = await runEngine(rc, deps as EngineDeps);
    const wallSec = Number(((Date.now() - t0) / 1000).toFixed(1));
    let costUsd = 0, calls = 0;
    if (!DRY) { const a = aggregate(usageCalls.slice(before)); costUsd = a.totals.usd; calls = a.totals.calls; }
    const honestFail = HONEST_FAIL.has(out.verdict);
    const billed = !DRY && !honestFail; // AUDIT_HONESTFAIL_NO_CHARGE OFF → committal bills, honest-fail does not
    let status: Status, blocker: boolean, note: string;
    if (rc.grader === "oracle") {
      const sc: ScoredCase = scoreOracleCase(rc.oracle!, out.verdict);
      status = sc.status === "PASS" ? "PASS" : sc.status; blocker = sc.blocker; note = sc.note;
    } else {
      const g = scoreGate3(rc, out.verdict); status = g.status; blocker = g.blocker; note = g.note;
    }
    return {
      n: rc.n, id: rc.id, grader: rc.grader, verdict: out.verdict, eligible: out.eligible,
      honestFail, billed, status, blocker, note, proposed: out.proposed, railDerived: out.railDerived,
      usedFullDoc: !!(rc.fullDocPath && fs.existsSync(rc.fullDocPath)), costUsd, calls, wallSec,
    };
  }

  console.log(`\n── STAGE A: cheap-9 (${cheap.length} cases) ──`);
  for (const rc of cheap) {
    process.stdout.write(`[${rc.n}] ${rc.id} (${rc.grader}) … `);
    const o = await runOne(rc);
    outcomes.push(o);
    const tag = o.blocker ? "❌ BLOCKER" : o.status === "PASS" ? "✅ PASS" : `⚠️ ${o.status}`;
    console.log(`${o.verdict}${o.proposed ? ` [propose ${o.proposed} · rail ${o.railDerived}]` : ""} → ${tag}` + (DRY ? "" : ` · $${o.costUsd.toFixed(4)} · ${o.wallSec}s`));
    if (o.note) console.log(`      ${o.note}`);
  }

  const stageABlockers = outcomes.filter((o) => o.blocker);
  if (WITH_W9126 && expensive.length && stageABlockers.length === 0) {
    console.log(`\n── STAGE B: W9126 (chunked ingest, expensive) ──`);
    for (const rc of expensive) {
      process.stdout.write(`[${rc.n}] ${rc.id} (${rc.grader}) … `);
      const o = await runOne(rc);
      outcomes.push(o);
      const tag = o.blocker ? "❌ BLOCKER" : o.status === "PASS" ? "✅ PASS" : `⚠️ ${o.status}`;
      console.log(`${o.verdict}${o.proposed ? ` [propose ${o.proposed} · rail ${o.railDerived}]` : ""} → ${tag}` + (DRY ? "" : ` · $${o.costUsd.toFixed(4)} · ${o.wallSec}s`));
      if (o.note) console.log(`      ${o.note}`);
    }
  } else if (WITH_W9126 && stageABlockers.length) {
    console.log(`\n⏭  STAGE B (W9126) SKIPPED — ${stageABlockers.length} blocker(s) in cheap-9; not spending on the expensive leg.`);
  } else if (expensive.length && !WITH_W9126) {
    console.log(`\nℹ️  W9126 leg not requested (pass --with-w9126 to run it after a clean cheap-9).`);
  }

  // ── SUMMARY ──
  const oracleScored: ScoredCase[] = outcomes.filter((o) => o.grader === "oracle").map((o) => ({ id: o.id, verdict: o.verdict, status: o.status === "CONSERVATIVE" ? "WATCH" : (o.status as ScoredCase["status"]), blocker: o.blocker, note: o.note }));
  const ranFullDoc = outcomes.filter((o) => o.grader === "oracle" && o.usedFullDoc).map((o) => o.id);
  const oSummary = summarizeOracle(oracleScored, ranFullDoc);
  const blockers = outcomes.filter((o) => o.blocker);
  const ranCount = outcomes.length;
  const target = cases.length;
  const totalCost = outcomes.reduce((n, o) => n + o.costUsd, 0);
  const billedCount = outcomes.filter((o) => o.billed).length;

  console.log(`\n═══ SUMMARY ═══`);
  console.log(`ran ${ranCount}/${target} cases · blockers ${blockers.length} · oracle FULL-DOC ran ${oSummary.fullDocRan} (need ≥2)`);
  console.log(`honest-fail fired on ${outcomes.filter((o) => o.honestFail).length} case(s) · billed committal ${billedCount}`);
  if (!DRY) console.log(`total token cost $${totalCost.toFixed(4)} across ${outcomes.reduce((n, o) => n + o.calls, 0)} calls`);
  const incompletes = outcomes.filter((o) => o.id.startsWith("CERT10-incomplete"));
  const incompleteBillErr = incompletes.filter((o) => o.billed);
  if (incompleteBillErr.length) console.log(`⛔ BILLS CRITERION VIOLATED — engineered-incomplete billed: ${incompleteBillErr.map((o) => o.id).join(", ")}`);

  const cleanRun = ranCount === target && blockers.length === 0 && oSummary.fullDocRan >= 2 && incompleteBillErr.length === 0;
  if (blockers.length) {
    console.log(`\n❌ ${blockers.length} BLOCKER(S):`);
    for (const b of blockers) console.log(`   [${b.n}] ${b.id}: ${b.verdict} — ${b.note}`);
  }
  if (DRY) {
    console.log(`\n${blockers.length === 0 && !DRY_NEGATIVE ? "✅ DRY wiring GREEN — all cases scored, staging + gate logic exercised." : DRY_NEGATIVE ? (blockers.length > 0 ? "✅ DRY NEGATIVE GREEN — injected committal error was CAUGHT as a blocker." : "❌ DRY NEGATIVE FAIL — injected error was NOT caught!") : "❌ DRY wiring had unexpected blockers."}`);
    process.exit(DRY_NEGATIVE ? (blockers.length > 0 ? 0 : 1) : (blockers.length === 0 ? 0 : 1));
  }

  // PAID: persist a cost-ledger row (source=code → R&D) so the cockpit picks it up.
  const { perModel, totals } = aggregate(usageCalls);
  appendLedgerRow({
    id: `cert10-run-${Date.now()}`, ts: new Date().toISOString(), source: "code", cogs: false, sol: "CERT-10",
    verdict: cleanRun ? "PASS" : "BLOCKED", eligible: null, billable: false, perModel, totals, console_usd: null,
    note: `cert10-run.ts — ran ${ranCount}/${target}, blockers ${blockers.length}, fulldoc ${oSummary.fullDocRan}. Token $${totals.usd.toFixed(4)} (${totals.calls} calls).`,
  });

  console.log(`\n${cleanRun && ranCount === target ? "✅ CERT-10 CLEAN on the cases run" : `⚠️  NOT 10/10 yet — ran ${ranCount}/${target}, ${blockers.length} blocker(s)`}. (Gate-3 committal + no-bill criteria still need CEO acceptance.)`);
  process.exit(blockers.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error("cert10-run FATAL:", e); process.exit(1); });
