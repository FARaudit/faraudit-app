// $0. CEO queue #4, first pass — where does the engine actually spend wall-clock and tokens?
// Read from BANKED run records only. No model call, no paid run.
//
// The question behind the ask: every solicitation we have ever audited fits inside a single context window
// (largest package 276,933 chars ≈ 77k tokens). If that is true, then any stage whose whole job is to make the
// package SMALLER is spending money and losing information to solve a problem we do not have. This pass does
// not conclude that — it measures what the records actually contain before anything is argued.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const CORPUS = join(process.cwd(), "scripts", "audit-ai", "run-records");

function records(): Array<{ file: string; rec: any }> {
  const out: Array<{ file: string; rec: any }> = [];
  if (!existsSync(CORPUS)) return out;
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".json")) {
        try { out.push({ file: e.name, rec: JSON.parse(readFileSync(p, "utf8")) }); } catch { /* skip */ }
      }
    }
  };
  walk(CORPUS);
  return out;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

(async () => {
  const recs = records();
  console.log(`banked run records: ${recs.length}\n`);
  if (!recs.length) { console.log("corpus absent — nothing to measure"); return; }

  // ── What keys even exist? Measure the shape before assuming a field name. ──
  const keyCount = new Map<string, number>();
  const walkKeys = (o: any, prefix = "", depth = 0) => {
    if (!o || typeof o !== "object" || depth > 2) return;
    for (const k of Object.keys(o)) {
      const path = prefix ? `${prefix}.${k}` : k;
      keyCount.set(path, (keyCount.get(path) ?? 0) + 1);
      if (o[k] && typeof o[k] === "object" && !Array.isArray(o[k])) walkKeys(o[k], path, depth + 1);
    }
  };
  for (const { rec } of recs) walkKeys(rec);

  console.log("=== top-level + one-deep keys present in >=10% of records ===");
  const floor = Math.max(1, Math.floor(recs.length * 0.1));
  for (const [k, n] of [...keyCount].filter(([, n]) => n >= floor).sort((a, b) => b[1] - a[1]).slice(0, 40)) {
    console.log(`  ${String(n).padStart(4)}  ${k}`);
  }

  // ── Anything that looks like timing or token accounting ──
  console.log("\n=== fields that look like TIMING or TOKENS ===");
  const interesting = [...keyCount.keys()].filter((k) => /ms|duration|elapsed|time|token|usage|cost|input|output/i.test(k));
  for (const k of interesting.sort()) console.log(`  ${String(keyCount.get(k)).padStart(4)}  ${k}`);
  if (!interesting.length) console.log("  (none — the records do not carry per-stage timing or token accounting)");

  // ── Package size, which is the premise of the whole question ──
  console.log("\n=== package size across the corpus (chars of input.fullSource) ===");
  const sizes = recs.map(({ rec }) => num(rec?.input?.fullSource?.length)).filter((x): x is number => x !== null);
  if (sizes.length) {
    sizes.sort((a, b) => a - b);
    const pct = (p: number) => sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * p))];
    console.log(`  n=${sizes.length}  min=${sizes[0].toLocaleString()}  p50=${pct(0.5).toLocaleString()}  p90=${pct(0.9).toLocaleString()}  max=${sizes[sizes.length - 1].toLocaleString()}`);
    console.log(`  max in tokens @3.5 chars/token ≈ ${Math.round(sizes[sizes.length - 1] / 3.5).toLocaleString()}`);
    const over = sizes.filter((s) => s / 3.5 > 180_000).length;
    console.log(`  records whose package exceeds ~180k tokens: ${over} of ${sizes.length}`);
  } else console.log("  input.fullSource absent from these records");

  // ── Findings per record, and how many documents produced them ──
  console.log("\n=== findings + document spread ===");
  let withFindings = 0, totalFindings = 0;
  const docSpread: number[] = [];
  for (const { rec } of recs) {
    const f = rec?.output?.findings ?? rec?.findings;
    if (Array.isArray(f)) { withFindings++; totalFindings += f.length; }
    const src = rec?.input?.fullSource;
    if (typeof src === "string") {
      const docs = [...src.matchAll(/^====\s*DOCUMENT:/gm)].length;
      if (docs) docSpread.push(docs);
    }
  }
  console.log(`  records carrying a findings array: ${withFindings}/${recs.length}  · total findings ${totalFindings}`);
  if (docSpread.length) {
    docSpread.sort((a, b) => a - b);
    console.log(`  documents per package: min=${docSpread[0]} p50=${docSpread[Math.floor(docSpread.length / 2)]} max=${docSpread[docSpread.length - 1]}`);
  }
})();
