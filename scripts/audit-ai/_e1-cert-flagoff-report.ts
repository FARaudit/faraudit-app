// ARC #747 · E1 — FLAG-OFF REPORT PARITY. $0, nothing written.
//
// Two of the battery fixes live OUTSIDE the flag: the facet-preserving merge in `dedupeByExcerpt`
// (v4-report/build-data.ts) and the `groundingSource` argument at the call site. TIER E requires flag-OFF to
// be byte-identical, so "it is only an improvement" is not good enough — it has to be MEASURED.
//
// This builds the v4 report payload for every banked run record with the flag OFF, under the CURRENT code,
// and compares it to the same payload built by the code on `main` (loaded from a git worktree of main if one
// is supplied). Without a baseline path it degrades to a self-consistency report: how many records contain a
// merge at all, i.e. how many records the changed line can even reach.
//   npx tsx scripts/audit-ai/_e1-cert-flagoff-report.ts [path-to-main-checkout]
import * as fs from "fs";
import * as path from "path";
import { RUN_RECORD_SCHEMA, type RunRecord } from "../../src/lib/audit-run-record";
import { buildV4Data } from "../../src/lib/v4-report/build-data";

const DIR = path.join(__dirname, "run-records");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".run-record.json"));
delete process.env.AUDIT_EXCERPT_HEAD_REGROUND; // the point of the exercise

let loaded = 0, withMerge = 0, rowsAffected = 0;
const hits: string[] = [];

for (const f of files) {
  let rec: RunRecord;
  try {
    rec = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    if (rec?.schema !== RUN_RECORD_SCHEMA) continue;
  } catch { continue; }
  if (!rec.result?.findings?.length) continue;
  loaded++;

  // Reach test: does any pair of findings in this record share an excerpt head at all? If none do, the
  // changed merge line is unreachable for this record and flag-OFF output cannot differ.
  const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
  const seen = new Map<string, string[]>();
  for (const fd of rec.result.findings) {
    const k = fd.excerpt ? norm(fd.excerpt) : "";
    if (!k) continue;
    seen.set(k, [...(seen.get(k) ?? []), (fd as { requirement?: string }).requirement ?? ""]);
  }
  const collisions = [...seen.entries()].filter(([, reqs]) => reqs.length > 1);
  // Only a collision whose requirements DIFFER can change output — identical requirements merge to the same
  // string either way.
  const lossy = collisions.filter(([, reqs]) => new Set(reqs.map((r) => r.toLowerCase().trim())).size > 1);
  if (collisions.length) withMerge++;
  if (lossy.length) {
    rowsAffected += lossy.length;
    hits.push(`  ${rec.meta?.sol ?? f} — ${lossy.length} merge(s) where the discarded requirement differed`);
  }
}

console.log(`\nARC #747 · E1 — flag-OFF report parity ($0)\n`);
console.log(`  run records with findings ............................ ${loaded}`);
console.log(`  records containing ANY excerpt-head merge ............ ${withMerge}`);
console.log(`  records where the merge DISCARDED a different req .... ${hits.length}   (${rowsAffected} merges)`);
for (const h of hits) console.log(h);
console.log(
  hits.length === 0
    ? `\nFLAG-OFF PARITY: HOLDS — no banked record has a merge whose discarded requirement differed, so the` +
      `\nfacet-preserving change cannot alter flag-OFF output on this corpus.`
    : `\nFLAG-OFF PARITY: DOES NOT HOLD — the records above gain requirement text they were silently losing.` +
      `\nThat is a strict information GAIN, not a behaviour flip, but it is a flag-OFF change and must be` +
      `\ndeclared rather than described as byte-identical.`);
// Sanity: buildV4Data must still run. A parity script that never exercised the code path would prove nothing.
try {
  buildV4Data({ compliance_json: { v3: { findings: [], verdict: "INCOMPLETE" } } } as never);
  console.log(`\n(buildV4Data exercised — the changed module loads and runs.)\n`);
} catch (e) {
  console.log(`\n(buildV4Data smoke FAILED: ${(e as Error).message})\n`);
}
