import { groundModalForce, FORCE_GROUNDING_INTERNALS_FOR_TEST as I } from "../../src/lib/audit-force-grounding";
const fires=(req:string,exc:string,src:string)=>groundModalForce([{id:"x",requirement:req,excerpt:exc}],src).corrected;

console.log("A) sentencesNaming word boundaries");
console.log("   subject 'bond' vs sentence 'Bonding is waived.':",
  JSON.stringify(I.sentencesNaming("Bonding is waived for this acquisition.","bond")));
console.log("   subject 'visit' vs 'The revisit was cancelled.':",
  JSON.stringify(I.sentencesNaming("The revisit was cancelled.","visit")));

console.log("\nB) 4-word attributive cap — 'Mandatory attendance at the site visit'");
console.log("   subject read:", JSON.stringify(I.qualifiedSubject("Mandatory attendance at the site visit on 13 Aug.",0,"Mandatory")));

console.log("\nC) multi-force-word: first match drives subject, strip removes ALL");
const r=fires("The site visit is optional. Separate registration is mandatory.",
              "Site visit will be held 13 Aug.",
              "Site visit will be held 13 Aug. Separate registration opens in July.");
console.log("   fired:",r.length, r.length?`subject=${JSON.stringify(r[0].subject)}`:"");
if(r.length) console.log("   after:",r[0].after.slice(0,220));

console.log("\nD) over-match wrong-fire: subject token inside a longer word");
const r2=fires("Mandatory bond required at award.","A bid bond accompanies the offer.",
               "Bonding arrangements are described below. A bid bond accompanies the offer.");
console.log("   fired:",r2.length, r2.length?`subject=${JSON.stringify(r2[0].subject)}`:"(stood down)");
