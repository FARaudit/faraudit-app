// RT Unit6 R1 — realism baseline on the cached seq-2 record. Does the dedup verdict-flip on the REAL 93 findings?
import { applyFindingDedup, deriveVerdict } from "../../src/lib/audit-decide";
import * as fs from "fs";

const rec = JSON.parse(fs.readFileSync("/tmp/seq2-runrecord.json", "utf8"));
const findings = (rec.result?.findings ?? rec.findings ?? []) as any[];
console.log("real findings:", findings.length);

const vi = (fs2: any[]) => ({ findings: fs2, bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as any);
const full = deriveVerdict(vi(findings));
const ded = applyFindingDedup(findings, { enabled: true });
const after = deriveVerdict(vi(ded));
console.log(`FULL  verdict=${full.verdict} elig=${full.eligible}  rows=${findings.length}`);
console.log(`DEDUP verdict=${after.verdict} elig=${after.eligible}  rows=${ded.length}`);
console.log(`${full.verdict === after.verdict && full.eligible === after.eligible ? "ok VERDICT-SAFE on real record" : "*** VERDICT-UNSAFE on real record"}`);

// enumerate merges + whether any dropped a distinct facet (a member requirement fully absent from survivor)
const merged = ded.filter((f: any) => f.findingDedupMerged);
console.log(`\n${merged.length} merge survivors:`);
for (const s of merged) {
  console.log(`  clause ${s.mergedClause}  absorbed ${s.mergedLensCount}  ctrl=${s.controllability} sev=${s.severity}`);
  console.log(`    req: ${String(s.requirement).slice(0, 200)}`);
}

// dropped-facet audit: for each clause group, list member requirements NOT substring-present in survivor.
const FD_CLAUSE_RE = /\b(?:2?52|[0-9]{3})\.\d{3}-\d{1,4}\b/g;
const keyOf = (f: any) => [...new Set(`${f.citation ?? ""} ${f.requirement ?? ""}`.match(FD_CLAUSE_RE) ?? [])];
const groups = new Map<string, any[]>();
findings.forEach((f) => { const k = keyOf(f); if (k.length === 1) (groups.get(k[0]) ?? groups.set(k[0], []).get(k[0])!).push(f); });
console.log(`\nfacet-loss check across ${[...groups].filter(([, v]) => v.length > 1).length} multi-member clause groups:`);
for (const [clause, members] of groups) {
  if (members.length < 2) continue;
  const survivor = merged.find((s: any) => s.mergedClause === clause);
  const survReq = String(survivor?.requirement ?? "");
  for (const m of members) {
    const r = String(m.requirement ?? "");
    // crude: is a distinctive tail of this member present?
    const tail = r.slice(-40);
    if (r && !survReq.includes(tail) && !survReq.includes(r)) {
      console.log(`  clause ${clause}: MEMBER not verbatim in survivor tail="${tail.trim()}"  ctrl=${m.controllability}`);
    }
  }
}
