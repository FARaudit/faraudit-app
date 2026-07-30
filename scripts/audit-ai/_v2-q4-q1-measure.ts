// ARC #747 · V2 · Q4 + Q1 evidence. $0, read-only.
// Q4: is the V1/legacy render worth registering twice, or better deleted?
// Q1: is there a FOURTH kind beyond PROCEDURAL / DERIVED / AUTHORITY?
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const { data } = await admin.from("audits").select("*").order("created_at", { ascending: false }).limit(400);
  const rows = (data ?? []) as Record<string, any>[];
  const v3 = rows.filter((r) => r.compliance_json?.engine === "agentic_v3");
  const legacy = rows.filter((r) => r.compliance_json?.engine !== "agentic_v3");
  const d = (r: any) => String(r.created_at ?? "").slice(0, 10);
  console.log("=== Q4 — who still renders through the V1 template? ===");
  console.log(`  agentic_v3 (v4/v5 render): ${v3.length}   newest ${d(v3[0])}  oldest ${d(v3[v3.length-1])}`);
  console.log(`  legacy     (_template.html): ${legacy.length}   newest ${d(legacy[0])}  oldest ${d(legacy[legacy.length-1])}`);
  const cust = legacy.filter((r) => r.source === "user" || r.cost_source === "customer");
  console.log(`  legacy rows from a CUSTOMER path (source=user | cost_source=customer): ${cust.length}`);
  console.log(`  legacy rows still carrying gate_conditions (the V1-only surface): ${legacy.filter((r)=>Array.isArray(r.compliance_json?.gate_conditions)&&r.compliance_json.gate_conditions.length).length}`);

  console.log("\n=== Q1 — shape census of the 83 in-scope narrative sites ===");
  const inv = fs.readFileSync("ceo/NARRATIVE-SITE-INVENTORY-747-V2.txt", "utf8").split("\n");
  // ADVISORY shape: tells the reader what to DO or what WILL happen — truth-maker is neither the regulation
  // nor the record, so neither AUTHORITY's primary-source bar nor DERIVED's span binding can test it.
  const ADVISORY = /\b(best play|you should|we recommend|recommended|consider (?:pursuing|teaming)|pursue|position yourself|your strongest|likely|expect(?:ed)? to|will (?:need|likely|probably)|worth (?:pursuing|considering)|opportunity to)\b/i;
  const hits = inv.filter((l) => ADVISORY.test(l));
  console.log(`  lines in the inventory matching an ADVISORY shape: ${hits.length}`);
  hits.slice(0, 12).forEach((h) => console.log("    " + h.trim().slice(0, 150)));
})();
