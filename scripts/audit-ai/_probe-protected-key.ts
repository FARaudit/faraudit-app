import * as fs from "fs";
const cab = JSON.parse(fs.readFileSync("scripts/audit-ai/run-records/_new-cab687da.json","utf8"));
const ABSORBABLE = new Set(["id","requirement","citation","excerpt","kind","controllability","grounded","lens","severity","curableInWindow","cautionFloor","unverified","documentProvenance","locatedAt","contextNote"]);
const f3 = cab.result.inputs.findings.find((f:any)=>/Additional Q&A Document, Question 6/.test(f.citation||""));
console.log("row#3 keys:", Object.keys(f3).join(", "));
console.log("NON-absorbable keys (→ protected):", Object.keys(f3).filter(k=>!ABSORBABLE.has(k)).join(", ") || "(none — should be absorbable)");
