process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
import { completenessOf } from "@/lib/audit-orchestrator";
import type { TypedFinding } from "@/lib/audit-types";
const BEN = "Deliveries shall be made to the destination named in the schedule.";
const f = (sec: string, ex: string): TypedFinding => ({ id: "f_"+sec, citation:"§"+sec, excerpt: ex, kind:"requirement", controllability:"bidder_controls", severity:"info" } as unknown as TypedFinding);
function status(sec: string, cand: string){ const src=[`SECTION ${sec} - X`,BEN,cand].join("\n"); const r=completenessOf({fullSource:src} as any,[sec],[f(sec,BEN)],new Set([sec])); return r.attestations.find(a=>a.section===sec)?.status; }
const cases: [string,string,string][] = [
  ["§D program element in field 8(a) (belt2 reverse)","D","Reference the program element in field 8(a) of the exhibit."],
  ["§D offeror program mgr identified in item 8(a)","D","The offeror's program manager shall be identified in item 8(a)."],
  ["§D contract line item in block 8(a)","D","Enter the contract line item in block 8(a)."],
  ["§F contractor personnel registered in visitor system","F","Contractor personnel shall be registered in the visitor system."],
];
for (const [l,sec,c] of cases) console.log(`${status(sec,c)==="covered_direct"?"COVERED(ok)":"FLOORED(over-fire)"} | ${l}`);
