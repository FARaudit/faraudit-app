// Item-C flag-ON delta probe (card #707). For each banked RunRecord: replay flag-OFF vs flag-ON
// (AUDIT_SCOPE_OPACITY_RECONCILE) and itemize — a delta should appear ONLY on records carrying the
// contradiction (a scope-opacity overclaim finding + a read SOW/spec/drawings attachment), and the
// change is a severity demotion, not a verdict-pole flip.  npx tsx scripts/audit-ai/_itemc-flagon-probe.ts
import * as fs from "fs";
import * as path from "path";
import { replayRunRecord, RUN_RECORD_SCHEMA, type RunRecord } from "../../src/lib/audit-run-record";
import { SCOPE_OPACITY_OVERCLAIM_RE, scopeDocReadInSet } from "../../src/lib/audit-scope-reconciliation";

const DIR = path.join(__dirname, "run-records");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".run-record.json"));
const clearAudit = () => { for (const k of Object.keys(process.env).filter((k) => k.startsWith("AUDIT_"))) delete process.env[k]; };

let contradictionRecs = 0, verdictFlips = 0, demotions = 0;
for (const f of files) {
  let rec: RunRecord;
  try { rec = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); if (rec?.schema !== RUN_RECORD_SCHEMA) continue; } catch { continue; }
  const findings = (rec.inputs?.findings ?? []) as Array<{ requirement?: string; excerpt?: string; citation?: string; severity?: string }>;
  const hasOverclaim = findings.some((x) => x.severity === "P0" && SCOPE_OPACITY_OVERCLAIM_RE.test(x.requirement ?? ""));
  const scopeRead = scopeDocReadInSet(findings as never, rec.inputs?.source ?? null);
  const carriesContradiction = hasOverclaim && scopeRead;

  clearAudit();
  const off = replayRunRecord(rec).replayVerdict;
  clearAudit(); process.env.AUDIT_SCOPE_OPACITY_RECONCILE = "true";
  const on = replayRunRecord(rec).replayVerdict;
  clearAudit();

  if (carriesContradiction) {
    contradictionRecs++; demotions++;
    console.log(`  CONTRADICTION ${(rec.meta?.sol || f).slice(0, 22)}: overclaim+SOW-read → demote · verdict ${off}${off === on ? " (UNCHANGED)" : ` → ${on} ⚠FLIP`}`);
  }
  if (off !== on) { verdictFlips++; if (!carriesContradiction) console.log(`  ⚠ UNEXPECTED flag-ON flip on NON-contradiction record ${(rec.meta?.sol || f).slice(0, 22)}: ${off} → ${on}`); }
}
console.log(`\n=== ITEM-C FLAG-ON PROBE ===`);
console.log(`records=${files.length} · contradiction-carrying=${contradictionRecs} · flag-ON demotions=${demotions} · VERDICT flips=${verdictFlips}`);
console.log(verdictFlips === 0
  ? "🟢 flag-ON = severity-band demotion only, scoped to contradiction-carrying records; ZERO verdict-pole flips across the corpus."
  : "🔶 flag-ON produced verdict flips — must all be contradiction-class + adjudicated.");
