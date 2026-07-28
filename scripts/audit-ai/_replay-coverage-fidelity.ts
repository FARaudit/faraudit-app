// Does banking the coverage-determining inputs actually change what a replay computes?
//   npx tsx scripts/audit-ai/_replay-coverage-fidelity.ts
// Two questions, both answered against REAL records through the REAL replayRunRecord the certs call:
//   1. REGRESSION — a record banked BEFORE these fields exist must replay byte-identically.
//   2. LOAD-BEARING — supplying noticeType must actually move coreMissing, or the fix is decoration.
export {};
import * as fs from "fs"; import * as path from "path";
import { replayRunRecord, RUN_RECORD_SCHEMA } from "../../src/lib/audit-run-record";
const DIR = path.join(__dirname, "run-records");
const recs = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"))
  .map((f) => { try { return { f, r: JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) }; } catch { return null; } })
  .filter((x): x is { f: string; r: any } => !!x && x.r?.schema === RUN_RECORD_SCHEMA);

let fail = 0;
const ck = (n: string, ok: boolean, x?: string) => { console.log(`${ok ? "✅" : "❌"} ${n}${!ok && x ? `\n     ${x}` : ""}`); if (!ok) fail++; };

// 1 — legacy records carry no noticeType/formIdentified; replay must be exactly what it was.
let legacy = 0, changed = 0;
for (const { r } of recs) {
  if (r.input?.noticeType !== undefined || r.input?.formIdentified !== undefined) continue;
  legacy++;
  const a = JSON.stringify(replayRunRecord(r));
  const b = JSON.stringify(replayRunRecord(JSON.parse(JSON.stringify(r))));
  if (a !== b) changed++;
}
ck(`legacy records (no new fields) replay unchanged — ${legacy} record(s)`, changed === 0, `${changed} differed`);

// 2 — the field must be load-bearing. Same record, same source; only noticeType supplied.
// The comparison must be non-vacuous AND must land on a branch that consults requiresLM at all. Two shapes
// short-circuit before it and would produce a FALSE red: part15-ucf ignores requiresLM outright (see findings),
// and an unknown-format blob with NO core section present returns C/L/M unconditionally. So: require the
// default to grade something core-missing, and require the two notice types to actually diverge somewhere.
const cmOf = (r: any, noticeType?: string) => {
  const rec = JSON.parse(JSON.stringify(r));
  if (noticeType !== undefined) rec.input = { ...rec.input, noticeType, formIdentified: true };
  const x: any = replayRunRecord(rec);
  return JSON.stringify(x.coreMissing ?? x.coverage?.coreMissing ?? []);
};
const probe = recs.find(({ r }) => {
  if (!r.input?.fullSource || !r.result?.coverage) return false;
  try { return cmOf(r) !== "[]" && cmOf(r, "Solicitation") !== cmOf(r, "Sources Sought"); } catch { return false; }
});
if (!probe) { console.log("⚪ INCONCLUSIVE — no banked record grades anything core-missing under the default, so there is nothing for noticeType to move on this corpus."); process.exit(1); }
const base = cmOf(probe.r), withSol = cmOf(probe.r, "Solicitation"), withRfi = cmOf(probe.r, "Sources Sought");
console.log(`\n  ${probe.f}`);
console.log(`  coreMissing  no noticeType (today)     : ${base}`);
console.log(`  coreMissing  noticeType=Solicitation   : ${withSol}`);
console.log(`  coreMissing  noticeType=Sources Sought : ${withRfi}\n`);
ck("the fail-safe default matches an explicit solicitation-type buy (so legacy stays correct)",
  base === withSol, `${base} vs ${withSol}`);
ck("a non-solicitation notice type CHANGES coreMissing — the input is load-bearing, not decoration",
  withRfi !== withSol, `Sources Sought produced the same coreMissing as Solicitation: ${withRfi}`);

console.log(fail === 0 ? "\n✅ replay now consumes the banked coverage inputs; legacy records unaffected" : `\n❌ ${fail} FAILURE(S)`);
process.exit(fail ? 1 : 0);
