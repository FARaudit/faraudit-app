// PR #293 on REAL BANKED DATA — $0, read-only, no model call, no DB write.
//
// The PR ships a synthetic probe (_probe-293-cap.ts) and a unit test. Both are hand-built inputs, so both
// certify my own imagination of what a merge collision looks like ([[feedback_battery_certifies_author_imagination]]).
// The banked corpus is a DIFFERENTIAL fixture, and this is exactly what it is for: run the REAL
// dedupeByExcerpt over the REAL findings of every banked record and assert the two invariants the PR
// claims — no row exceeds the 3-obligation cap, and no obligation is printed twice in one row.
//
// KNOWN-POSITIVE FIRST. A sweep over real data that reports "0 violations" is indistinguishable from a
// sweep that never ran ([[feedback_write_the_falsification_probe_first]]). So a synthetic violation is
// planted through the SAME code path first, and the probe refuses to report on real data until it has
// proven it can fail.
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { dedupeByExcerpt } from "@/lib/v4-report/build-data";

const DIR = join(process.cwd(), "scripts", "audit-ai", "run-records");
const CAP = 3;
const facets = (s: string) => s.split(/\s*·\s*/).map((x) => x.trim()).filter(Boolean);

type Row = { req: string; cite: string; excerpt: string };
type Violation = { file: string; kind: string; detail: string };

function check(rows: Row[], file: string): Violation[] {
  const out = dedupeByExcerpt(rows as never) as Array<{ req: string }>;
  const v: Violation[] = [];
  for (const r of out) {
    const f = facets(r.req ?? "");
    if (f.length > CAP) v.push({ file, kind: "CAP EXCEEDED", detail: `${f.length} obligations in one row` });
    const seen = new Set<string>();
    for (const x of f) {
      if (seen.has(x)) { v.push({ file, kind: "DUPLICATE FACET", detail: `"${x.slice(0, 60)}" printed twice` }); break; }
      seen.add(x);
    }
  }
  return v;
}

// ── 0. THE PROBE MUST BE ABLE TO FAIL ──────────────────────────────────────────────────────────────
const EX = "The offeror shall submit the technical volume not later than 2:00 PM local time.";
const planted: Row[] = [
  { req: "A · B", cite: "L-1", excerpt: EX },
  { req: "C · D", cite: "L-1", excerpt: EX },
  { req: "B · E", cite: "L-1", excerpt: EX },
];
const plantedHits = check(planted, "<planted>");
console.log(`KNOWN-POSITIVE: planted collision produced ${plantedHits.length} violation(s)`);
if (plantedHits.length === 0) {
  // The guard held on the planted case, which is the PR working. Prove the DETECTOR still bites by
  // handing it a row the guard cannot fix — otherwise a green real-data sweep proves nothing.
  const forced = check([{ req: "A · B · C · D", cite: "X", excerpt: EX }], "<forced>");
  console.log(`  guard held on the plant (that is the fix working); detector on a pre-capped row: ${forced.length} violation(s)`);
  if (forced.length === 0) {
    console.log("❌ DETECTOR IS INERT — it cannot see a 4-obligation row. Real-data result would be meaningless.");
    process.exit(1);
  }
}

// ── 1. THE REAL CORPUS ─────────────────────────────────────────────────────────────────────────────
const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
let recs = 0, findings = 0, preMerged = 0;
const violations: Violation[] = [];

for (const f of files) {
  let d: Record<string, unknown>;
  try { d = JSON.parse(readFileSync(join(DIR, f), "utf8")); } catch { continue; }
  const res = (d as { result?: { findings?: unknown[] } }).result;
  const raw = Array.isArray(res?.findings) ? res!.findings! : [];
  const rows: Row[] = [];
  for (const x of raw as Array<Record<string, unknown>>) {
    const req = typeof x.requirement === "string" ? x.requirement : "";
    const excerpt = typeof x.excerpt === "string" ? x.excerpt : "";
    const cite = typeof x.cite === "string" ? x.cite : "";
    if (!req) continue;
    if (facets(req).length > 1) preMerged++;
    rows.push({ req, cite, excerpt });
  }
  if (!rows.length) continue;
  recs++; findings += rows.length;
  violations.push(...check(rows, f));
}

console.log(`\nREAL CORPUS: ${recs} banked records with findings · ${findings} findings · ${preMerged} already engine-merged (multi-facet)`);
if (recs === 0 || findings === 0) {
  console.log("❌ SWEEP TOUCHED NOTHING — 0 records or 0 findings. Treat as INERT, not as clean.");
  process.exit(1);
}
console.log(`violations: ${violations.length}`);
for (const v of violations.slice(0, 20)) console.log(`  ❌ ${v.file} — ${v.kind}: ${v.detail}`);
console.log(violations.length === 0
  ? "\n✅ PASS — over real banked findings, no row exceeds the cap and no obligation prints twice"
  : `\n❌ ${violations.length} violation(s) on real data`);
process.exit(violations.length === 0 ? 0 : 1);
