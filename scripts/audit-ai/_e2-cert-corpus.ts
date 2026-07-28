// ARC #747 · E2 — CERT: does the citation gate move anything DOWNSTREAM? ($0, writes nothing, no flag armed)
//
// The gate is applied AFTER deriveVerdict, so in principle the verdict cannot move. "In principle" is not a
// proof — the same reasoning was available for E1's excerpt widening, and E1's corpus replay is what caught
// that a widened quote could retire an armed eligibility floor. So this replays all 40 banked run records
// both ways and reports every delta rather than asserting there can be none.
import * as fs from "fs";
import * as path from "path";
import { replayRunRecord, RUN_RECORD_SCHEMA, type RunRecord } from "../../src/lib/audit-run-record";
import { gateFindingCitations } from "../../src/lib/audit-citation-fidelity";

const DIR = path.join(__dirname, "run-records");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".run-record.json"));

let loaded = 0, skipped = 0, touched = 0, withheldTotal = 0, verdictDeltas = 0, coverageDeltas = 0, byteDiffs = 0;
const notes: string[] = [];

for (const f of files) {
  let rec: RunRecord;
  try {
    rec = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    if (rec?.schema !== RUN_RECORD_SCHEMA) { skipped++; continue; }
  } catch { skipped++; continue; }
  if (!rec.input?.fullSource || !rec.result?.findings?.length) { skipped++; continue; }
  loaded++;

  const src = rec.input.fullSource;
  const before = JSON.parse(JSON.stringify(rec)) as RunRecord;

  // FLAG OFF — must be structurally the same object, not merely an equal one.
  const off = gateFindingCitations(rec.result.findings as any[], src, { enabled: false });
  if (off.findings !== (rec.result.findings as any[])) { byteDiffs++; notes.push(`${f}: FLAG-OFF returned a NEW array — byte-identity is not structural`); }

  // FLAG ON
  const on = gateFindingCitations(rec.result.findings as any[], src, { enabled: true });
  if (on.withheld.length) {
    touched++; withheldTotal += on.withheld.length;
    notes.push(`${f}: ${on.withheld.map((w) => `${w.raw} [${w.field}] — ${w.reason}`).join(" · ")}`);
  }

  // Re-derive coverage + verdict from the GATED findings and compare. The gate ships post-verdict, so this
  // is the paranoid direction: it asks what WOULD happen if a gated finding ever reached the decision path.
  const after = JSON.parse(JSON.stringify(rec)) as RunRecord;
  (after.result as any).findings = on.findings;
  try {
    // PROPERTIES THAT EXIST. The first version of this cert compared `.verdict` and `.coverage` — neither is
    // on ReplayResult, so both sides were `undefined`, the counters could never increment, and "CERT GREEN"
    // was unconditional. I quoted that green in a commit message and a PR body. `tsc` does not catch it
    // because tsconfig EXCLUDES scripts/**/_*.ts. The real fields are replayVerdict / missing / coreMissing.
    // (Review finding #3 on PR #294.) [[feedback_certs_must_be_proven_falsifiable]]
    const rb = replayRunRecord(before);
    const ra = replayRunRecord(after);
    const set = (xs: string[]) => [...xs].sort().join(",");
    if (rb.replayVerdict !== ra.replayVerdict) { verdictDeltas++; notes.push(`${f}: VERDICT DELTA ${rb.replayVerdict} → ${ra.replayVerdict}`); }
    if (set(rb.missing) !== set(ra.missing) || set(rb.coreMissing) !== set(ra.coreMissing)) {
      coverageDeltas++;
      notes.push(`${f}: COVERAGE DELTA missing [${set(rb.missing)}] → [${set(ra.missing)}] · coreMissing [${set(rb.coreMissing)}] → [${set(ra.coreMissing)}]`);
    }
  } catch (e) {
    notes.push(`${f}: replay threw — ${(e as Error).message.slice(0, 120)}`);
  }
}

console.log(`records loaded ${loaded} · skipped ${skipped}`);
console.log(`records with a withheld citation: ${touched} · citations withheld: ${withheldTotal}`);
console.log(`FLAG-OFF non-identical array returns: ${byteDiffs}   (must be 0)`);
console.log(`verdict deltas: ${verdictDeltas}   coverage deltas: ${coverageDeltas}   (both must be 0)`);
if (notes.length) { console.log("\n── detail ──"); notes.forEach((n) => console.log("  " + n)); }
// A cert that never exercised its own subject is not evidence. The founding record is NOT in the banked
// corpus, so `withheldTotal` is legitimately 0 here — say so out loud rather than letting a reassuring zero
// read as coverage. (The live-corpus census is what exercises the withholding path.)
if (withheldTotal === 0) console.log("NOTE: 0 citations withheld across the banked corpus — the founding record (d0664ba2) is NOT banked, so this cert measures NON-INTERFERENCE only, not detection. Detection is covered by _e2-citation-census-live.ts.");
if (loaded === 0) { console.log("\n\u274c CERT VACUOUS — no banked record carried findings"); process.exit(1); }
const green = byteDiffs === 0 && verdictDeltas === 0 && coverageDeltas === 0;
console.log(`\n${green ? "✅ CERT GREEN" : "❌ CERT RED"}`);
process.exit(green ? 0 : 1);
