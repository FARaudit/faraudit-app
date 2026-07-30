process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
import { completenessOf } from "@/lib/audit-orchestrator";
import type { TypedFinding } from "@/lib/audit-types";
const f=(sec:string,ex:string):TypedFinding=>({id:"f_"+sec,citation:"§"+sec,excerpt:ex,kind:"requirement",controllability:"bidder_controls",severity:"info"} as unknown as TypedFinding);
const BEN="Deliveries shall be made to the destination named in the schedule.";
const BAR="The contractor shall possess a Top Secret facility clearance at time of award.";
function run(sec:string){const src=[`SECTION ${sec} - X`,BEN,BAR].join("\n");return completenessOf({fullSource:src} as any,[sec],[f(sec,BEN)],new Set([sec])).attestations.find(a=>a.section===sec)?.status;}
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR="false";
console.log("flag OFF §H:", run("H"), "(expect covered_direct = byte-identical status quo)");
// ReDoS: pathological 8(a)/program repetition
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR="true";
const evil = "program ".repeat(2000)+"8(a) "+"x".repeat(5000);
const t=Date.now();
completenessOf({fullSource:["SECTION D - X",BEN,evil].join("\n")} as any,["D"],[f("D",BEN)],new Set(["D"]));
console.log("ReDoS 8(a)/program 2000x:", Date.now()-t, "ms");
const evil2 = ("the offeror "+"a ".repeat(3000)+"eligible. ").repeat(50);
const t2=Date.now();
completenessOf({fullSource:["SECTION H - X",BEN,evil2].join("\n")} as any,["H"],[f("H",BEN)],new Set(["H"]));
console.log("ReDoS offeror/adjacency:", Date.now()-t2, "ms");
