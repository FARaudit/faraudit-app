import { noticeBodyEligibilityUngrounded } from "../../src/lib/audit-orchestrator";
const NOTICE="SAM Notice Body";
const mk=(t:string)=>`\n\n==== DOCUMENT: Sol ====\n\nSolicitation W912. SOW follows.\n\n==== DOCUMENT: ${NOTICE} ====\n\n${t}`;
const setAside="This requirement is a total small business set-aside under NAICS 541511 with a size standard of $34 million.";
for (const [flag,val] of [["OFF",""],["SELF_DET on","true"]] as const){
  process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS=val;
  const r=noticeBodyEligibilityUngrounded(mk(setAside),[],setAside,"small business set-aside");
  console.log(`set-aside metadata, AUDIT_SELF_DETERMINABLE_ELIG_CLASS ${flag}: pole=${r} ${r?"(escalates)":"<-- DEMOTED"}`);
}
