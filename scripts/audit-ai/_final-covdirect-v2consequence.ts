process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
import { completenessOf } from "@/lib/audit-orchestrator";
import { gradeCoverageV2 } from "@/lib/audit-gate-v2";
import type { TypedFinding } from "@/lib/audit-types";
const BEN = "Deliveries shall be made to the destination named in the schedule.";
const f=(sec:string,ex:string):TypedFinding=>({id:"f_"+sec,citation:"§"+sec,excerpt:ex,kind:"requirement",controllability:"bidder_controls",severity:"info"} as unknown as TypedFinding);
function measure(label:string,sec:string,cand:string){
  const src=[`SECTION ${sec} - X`,BEN,cand].join("\n");
  const r=completenessOf({fullSource:src} as any,[sec],[f(sec,BEN)],new Set([sec]));
  const st=r.attestations.find(a=>a.section===sec)?.status;
  const cov=gradeCoverageV2(r.attestations);
  console.log(`${label}\n  status=${st} | V1 missing=${JSON.stringify(r.missing)} | V2 grade=${cov.coverageGrade} | V2 disqualifierUncovered=${cov.disqualifierUncovered.length}`);
}
measure("B1 firm's samples registered (benign §F)","F","The firm's samples shall be registered in the tracking log upon delivery.");
measure("C1 program in block 8(a) (benign §D)","D","The program described in block 8(a) shall be delivered per schedule.");
measure("C2 program identifier field 8(a) (benign §D)","D","Enter the applicable program identifier in field 8(a) of the DD-250.");
// baseline: same section CLEAN (no candidate over-fire) — expect covered, grade 1
measure("BASELINE clean §D","D","All packages shall be marked in accordance with MIL-STD-129R.");
