import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ID = "496a9a21-8391-41b4-9e24-cff212971fd3";
const { data } = await admin.from("audits").select("compliance_json,findings,top_risks,summary,recommendation").eq("id", ID).single();
const cj = data.compliance_json || {};
console.log("compliance_json keys:", Object.keys(cj).join(", "));
// deep search for noVerdictCause + showStoppers + v3 payload
const v3 = cj.v3 || {};
console.log("\ncj.v3 keys:", Object.keys(v3).join(", "));
console.log("cj.v3.noVerdictCause:", v3.noVerdictCause ?? "(absent)");
console.log("cj.noVerdictCause (top):", cj.noVerdictCause ?? "(absent)");
const ss = v3.showStoppers || cj.showStoppers || [];
console.log("\nshowStoppers count:", ss.length);
for (const s of ss.slice(0,8)) console.log("  - [" + (s.citation||s.kind||"?") + " | disp=" + (s.disposition||"?") + "] " + String(s.obligation||s.text||s.excerpt||"").slice(0,160));
// recursive scan for the string 'noVerdictCause' anywhere
function findKey(obj, key, path="cj", out=[]) {
  if (obj && typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      if (k === key) out.push(`${path}.${k} = ${JSON.stringify(obj[k])}`);
      findKey(obj[k], key, `${path}.${k}`, out);
    }
  }
  return out;
}
console.log("\nrecursive noVerdictCause hits:", JSON.stringify(findKey(cj, "noVerdictCause")));
console.log("\nfindings (row col) len:", Array.isArray(data.findings)? data.findings.length : typeof data.findings);
