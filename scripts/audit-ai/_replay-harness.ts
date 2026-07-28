// GROUNDFIXTURE (a)+(b) — OFFLINE REPLAY HARNESS, now pointed at the REAL banked corpus.
//
// Loads banked RunRecords and re-derives every verdict at $0 through the CURRENT engine code
// (replayRunRecord → deriveVerdict + deterministic coverage recompute). This is the REGRESSION
// GATE: pin a baseline, make a verdict-touching change, re-run, compare.
//
//   npx tsx scripts/audit-ai/_replay-harness.ts [--drift] [--sol=FA8137] [--local] [--refresh]
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE CHANGED (2026-07-27, card #760):
//
// It used to glob a LOCAL directory, scripts/audit-ai/run-records/*.run-record.json — 40 files.
// EVERY ONE of those 40 is missing meta.flagEnv. The harness detected that (it printed
// "missing flagEnv: 40") and then replayed them ANYWAY under whatever AUDIT_* happened to be in
// the ambient environment, comparing the result against verdicts produced under an unknown one —
// while labelling the output "faithful flag env". That produced the widely-cited 33% figure.
//
// **THE 33% IS VOID.** It measured ambient environment, not drift. Any prior "this change was
// safe" conclusion resting on it is UNPROVEN and must be re-derived from the baseline below.
//
// Two changes make the measurement honest:
//   1. Records now load from the Supabase `run-records` bucket (<sol>/<audit_id>.json), where the
//      records DO carry meta.flagEnv (86 flags on the ones inspected). Same schema, run-record/v1.
//   2. A record without meta.flagEnv is EXCLUDED, never replayed under ambient env. Excluding is
//      honest; replaying is a placebo that looks identical to a real result.
// ─────────────────────────────────────────────────────────────────────────────────────────────
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { execSync } from "child_process";
import { replayRunRecord, RUN_RECORD_SCHEMA, type RunRecord } from "../../src/lib/audit-run-record";

dotenv.config({ path: ".env.local", quiet: true });

const argSol = (process.argv.find((a) => a.startsWith("--sol=")) || "").split("=")[1];
const showDrift = process.argv.includes("--drift");
const useLocal = process.argv.includes("--local");
const refresh = process.argv.includes("--refresh");

const BUCKET = "run-records";
const CACHE = path.join(__dirname, ".run-record-cache");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// The full closed set. A pole with zero records is a pathway the fixture CANNOT protect.
const ALL_POLES = ["BID", "BID_WITH_CAUTION", "NO_BID", "INELIGIBLE", "NEEDS_HUMAN_REVIEW", "INCOMPLETE"] as const;

type Loaded = { key: string; sol: string; rec: RunRecord };

async function sb(pathname: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SUPABASE_URL}${pathname}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
}

async function listPrefix(prefix: string): Promise<Array<{ name: string; id: string | null }>> {
  const r = await sb(`/storage/v1/object/list/${BUCKET}`, { method: "POST", body: JSON.stringify({ prefix, limit: 1000 }) });
  if (!r.ok) throw new Error(`list ${prefix || "/"} → ${r.status}`);
  return (await r.json()) as Array<{ name: string; id: string | null }>;
}

async function loadFromBucket(): Promise<{ loaded: Loaded[]; noFlagEnv: Loaded[]; badSchema: number }> {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("SUPABASE env missing — cannot reach the banked corpus. (Rule 42: pre-inject env.)");
  fs.mkdirSync(CACHE, { recursive: true });

  const folders = (await listPrefix("")).filter((e) => e.id === null).map((e) => e.name); // id===null ⇒ folder
  const loaded: Loaded[] = [];
  const noFlagEnv: Loaded[] = [];
  let badSchema = 0;

  for (const sol of folders) {
    if (argSol && !sol.includes(argSol)) continue;
    for (const obj of await listPrefix(sol)) {
      if (!obj.name.endsWith(".json")) continue;
      const key = `${sol}/${obj.name}`;
      const cached = path.join(CACHE, key.replace(/\//g, "__"));
      let text: string;
      if (!refresh && fs.existsSync(cached)) {
        text = fs.readFileSync(cached, "utf8");
      } else {
        const r = await sb(`/storage/v1/object/${BUCKET}/${key}`);
        if (!r.ok) { console.log(`  ⚠ fetch ${key} → ${r.status}`); continue; }
        text = await r.text();
        fs.writeFileSync(cached, text);
      }
      let rec: RunRecord;
      try { rec = JSON.parse(text) as RunRecord; } catch { badSchema++; continue; }
      if ((rec as { schema?: string })?.schema !== RUN_RECORD_SCHEMA) { badSchema++; continue; }
      const entry: Loaded = { key, sol, rec };
      // EXCLUDE, do not replay under ambient env. An excluded record is honest; a replayed one lies.
      if (!rec.meta?.flagEnv || Object.keys(rec.meta.flagEnv).length === 0) { noFlagEnv.push(entry); continue; }
      loaded.push(entry);
    }
  }
  return { loaded, noFlagEnv, badSchema };
}

function loadFromLocal(): { loaded: Loaded[]; noFlagEnv: Loaded[]; badSchema: number } {
  const DIR = path.join(__dirname, "run-records");
  const loaded: Loaded[] = [], noFlagEnv: Loaded[] = [];
  let badSchema = 0;
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".run-record.json"))) {
    try {
      const rec = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as RunRecord;
      if ((rec as { schema?: string })?.schema !== RUN_RECORD_SCHEMA) { badSchema++; continue; }
      if (argSol && !(rec.meta?.sol || f).includes(argSol)) continue;
      const entry: Loaded = { key: f, sol: rec.meta?.sol || f, rec };
      if (!rec.meta?.flagEnv || Object.keys(rec.meta.flagEnv).length === 0) { noFlagEnv.push(entry); continue; }
      loaded.push(entry);
    } catch { badSchema++; }
  }
  return { loaded, noFlagEnv, badSchema };
}

// Faithful replay = re-derive under the SAME AUDIT_* flag env the run used (meta.flagEnv, card #582).
// deriveVerdict/gradeCoverageV2 read process.env, so snapshot → clear all AUDIT_* → apply → replay → restore.
const applyFlagEnv = (flagEnv: Record<string, string>) => {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(process.env).filter((k) => k.startsWith("AUDIT_"))) { saved[k] = process.env[k]; delete process.env[k]; }
  for (const [k, v] of Object.entries(flagEnv)) process.env[k] = v;
  return () => {
    for (const k of Object.keys(process.env).filter((k) => k.startsWith("AUDIT_"))) delete process.env[k];
    for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v;
  };
};

(async () => {
  const src = useLocal ? loadFromLocal() : await loadFromBucket();
  const { loaded, noFlagEnv, badSchema } = src;

  let reproduced = 0, drifted = 0;
  const recTally: Record<string, number> = {}, repTally: Record<string, number> = {};
  const flips: string[] = [];
  const perSol: Record<string, number> = {};

  for (const { key, sol, rec } of loaded) {
    perSol[sol] = (perSol[sol] || 0) + 1;
    const restore = applyFlagEnv(rec.meta!.flagEnv!);
    let r;
    try { r = replayRunRecord(rec); } catch (e) { restore(); console.log(`  ⚠ replay error ${key}: ${e instanceof Error ? e.message : e}`); continue; }
    restore();
    recTally[rec.result.verdict] = (recTally[rec.result.verdict] || 0) + 1;
    repTally[r.replayVerdict] = (repTally[r.replayVerdict] || 0) + 1;
    if (r.verdictReproduced) reproduced++;
    else flips.push(`${sol.slice(0, 24)}: recorded ${rec.result.verdict} → replay ${r.replayVerdict}`);
    if (r.drift.length) { drifted++; if (showDrift) console.log(`  DRIFT ${sol.slice(0, 28)}:\n    - ${r.drift.join("\n    - ")}`); }
  }

  let sha = "unknown";
  try { sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(); } catch { /* detached/no-git */ }
  const dirty = (() => { try { return execSync("git status --porcelain", { encoding: "utf8" }).trim().length > 0; } catch { return false; } })();

  const sols = Object.keys(perSol).sort((a, b) => perSol[b] - perSol[a]);
  const top2 = sols.slice(0, 2).reduce((n, s) => n + perSol[s], 0);
  const pct = loaded.length ? ((reproduced / loaded.length) * 100).toFixed(0) : "0";

  console.log(`\n===== REPLAY HARNESS — GROUNDFIXTURE BASELINE =====`);
  console.log(`source          : ${useLocal ? "LOCAL scripts/audit-ai/run-records" : `SUPABASE bucket "${BUCKET}"`}`);
  console.log(`pinned to commit: ${sha}${dirty ? "  ⚠ WORKING TREE DIRTY — baseline is not reproducible from this SHA alone" : ""}`);
  console.log(`\nrecords REPLAYED (flagEnv present, faithful): ${loaded.length}`);
  console.log(`records EXCLUDED (no meta.flagEnv)          : ${noFlagEnv.length}${noFlagEnv.length ? "  ← excluded, NOT replayed under ambient env" : ""}`);
  if (badSchema) console.log(`records SKIPPED (bad schema/parse)          : ${badSchema}`);
  console.log(`distinct solicitations                      : ${sols.length}`);
  console.log(`  concentration: top 2 solicitations = ${top2}/${loaded.length} records (${loaded.length ? ((top2 / loaded.length) * 100).toFixed(0) : 0}%)`);
  console.log(`  ${sols.map((s) => `${s}:${perSol[s]}`).join("  ")}`);
  console.log(`\n>> NOT ${loaded.length} INDEPENDENT INPUTS. Repeated solicitations share source text and`);
  console.log(`   correlate; treat the effective sample as closer to the ${sols.length} distinct solicitations.`);

  console.log(`\n--- BASELINE ---`);
  console.log(`verdict REPRODUCED under the record's OWN flag env: ${reproduced}/${loaded.length}  (${pct}%)`);
  console.log(`records with deterministic DRIFT (coverage/manifest recompute vs recorded): ${drifted}/${loaded.length}`);

  console.log(`\n--- POLE COVERAGE (recorded verdicts across the fixture) ---`);
  for (const p of ALL_POLES) {
    const n = recTally[p] || 0;
    console.log(`  ${p.padEnd(20)} ${String(n).padStart(3)}${n === 0 ? "   ⚠ ZERO — the fixture CANNOT detect a change that breaks this pole" : ""}`);
  }
  const missing = ALL_POLES.filter((p) => !recTally[p]);
  if (missing.length) console.log(`  UNPROTECTED POLES: ${missing.join(", ")}  (same pathway-coverage logic as CERT-5)`);
  console.log(`\nRECORDED verdicts: ${JSON.stringify(recTally)}`);
  console.log(`REPLAYED verdicts (current code): ${JSON.stringify(repTally)}`);

  if (flips.length) {
    console.log(`\nVERDICT FLIPS (persisted inputs no longer derive the recorded verdict):`);
    for (const x of flips) console.log(`  ${x}`);
  }

  console.log(`\n--- HOW TO READ THIS NUMBER ---`);
  console.log(`This is a BASELINE, not a quality score. These records were banked WEEKS ago; a low`);
  console.log(`reproduction rate is EXPECTED accumulated drift from deliberate shipped changes, NOT an`);
  console.log(`engine defect. Do NOT open a defect arc off this number. The harness's job is DELTA`);
  console.log(`detection: pin this baseline at ${sha}, make a verdict-touching change, re-run, and`);
  console.log(`explain any NEW flip.`);
  console.log(`\n--- VOID ---`);
  console.log(`The previously cited 33% (13/40) is VOID. All 40 local records lacked meta.flagEnv, so`);
  console.log(`that run replayed under AMBIENT environment and compared against verdicts produced under`);
  console.log(`an unknown one. Any prior "this change was safe" conclusion resting on it is UNPROVEN.`);
})();
