import * as fs from "fs";
const rec = JSON.parse(fs.readFileSync("scripts/audit-ai/run-records/_new-cab687da.json","utf8"));
const r = rec.result;
const led = r.diagnostics.verifierLedger;
const sv = r.diagnostics.shadowVerdict;
console.log("=== LIVE VERDICT (old pole) ===");
console.log("verdict:", r.verdict, "| eligible:", r.eligible);
console.log("reason:", String(r.reason).slice(0,200));
console.log("\n=== R1 VERIFIER LEDGER ===");
console.log("failureMode:", led.failureMode);
console.log("throwMessage:", String(led.throwMessage??"-").slice(0,200));
console.log("residueDoctrine:", led.residueDoctrine);
console.log("counts:", JSON.stringify(led.counts));
console.log("unresolvedIndices:", JSON.stringify(led.unresolvedIndices));
console.log("rulings length:", Array.isArray(led.rulings)?led.rulings.length:typeof led.rulings);
console.log("\n=== UNRESOLVED CLAIMS (verbatim + cause) ===");
const rulings = led.rulings||[];
const unres = rulings.filter((x:any)=> x.resolved===false || x.status==="unresolved" || x.disposition==="unresolved" || x.overturned);
console.log("unresolved rulings found:", unres.length);
for(const u of (unres.length?unres:rulings.filter((x:any)=>led.unresolvedIndices?.includes(x.index)))) {
  console.log(`  [#${u.index??"?"}] cause=${u.cause||u.mechanicalCause||u.disposition||"?"} :: ${String(u.claim||u.requirementPreview||u.text||JSON.stringify(u)).slice(0,160)}`);
}
console.log("\n=== BANKED SHADOW VERDICT (positive pole, live) ===");
console.log(JSON.stringify(sv, null, 1)?.slice(0,900));
console.log("\n=== finding kinds ===");
const kinds:Record<string,number> = {};
for(const f of r.findings){ const k=f.kind||f.type||"?"; kinds[k]=(kinds[k]||0)+1; }
console.log(JSON.stringify(kinds));
