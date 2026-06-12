// One-shot: evidence analysis for the FA-131..129 SPRTA1 async re-run
// (audit 616efb58). Counts vnote/risk/L02 contradictions against bound
// facts, checks L02 example-leak paraphrases, reports §05 risk count.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ID = "616efb58-0a3d-49b6-aa4b-146207dda292";

const { data: a, error } = await c
  .from("audits")
  .select("status,compliance_json,risks_json,compliance_score,recommendation,bid_recommendation,document_type")
  .eq("id", ID)
  .single();
if (error) { console.error(error.message); process.exit(1); }
console.log("status:", a.status, "| rec:", a.recommendation, "| score:", a.compliance_score, "| doc_type:", a.document_type);

const comp = a.compliance_json ?? {};
const shadow = comp.v2_shadow ?? null;
if (!shadow) { console.log("NO v2_shadow"); process.exit(0); }
console.log("v2 path:", shadow.path, "| engine_ms:", shadow.engine_ms);

const s = shadow.surfaces ?? {};
const notes = s.confidence_notes ?? [];
const l02 = s.l02_catches ?? [];
const judgment = shadow.judgment ?? {};

// Bound facts known for SPRTA1: sol number, NAICS, due date, agency (SAM) +
// whatever V1 vision bound. Contradiction = a note/catch claiming one of
// these is unknown/missing/not confirmed.
const FACT_PATTERNS = [
  ["solicitation number", /solicitation\s+number|solicitorNumber/i],
  ["naics", /naics/i],
  ["set-aside", /set.aside/i],
  ["due date", /due\s*date|deadline|response\s+date/i],
  ["contract type", /contract\s+type/i],
  ["issuing office", /issuing\s+office|agency/i],
];
const MISSING_RE = /unknown|not\s+(?:be\s+)?(?:confirmed|present|extracted|found|identified|stated)|could\s+not|missing|no\s+(?:clear\s+)?(?:naics|deadline|due\s*date|solicitation\s+number)|absen|unable to/i;

function scan(items, label) {
  let hits = 0;
  for (const it of items) {
    const txt = typeof it === "string" ? it : JSON.stringify(it);
    if (!MISSING_RE.test(txt)) continue;
    for (const [fact, re] of FACT_PATTERNS) {
      if (re.test(txt)) {
        hits++;
        console.log(`  [${label}] possible contradiction on ${fact}: ${txt.slice(0, 160)}`);
        break;
      }
    }
  }
  return hits;
}

console.log("\n— confidence_notes (" + notes.length + ") —");
const vnoteHits = scan(notes, "vnote");
console.log("vnote contradiction candidates:", vnoteHits, "/", notes.length);

console.log("\n— l02_catches (" + l02.length + ") —");
const l02Hits = scan(l02, "l02");
// example-leak paraphrase check (old example list)
const LEAK_RE = /WAWF|wide\s+area\s+workflow|PIEE|base\s+access\s+badg|45.day|five.day|5.day\s+lead|inspection\s+at\s+(?:origin|destination)\s+conflict|CPARS\s+posting\s+lag/i;
let leaks = 0;
for (const it of l02) {
  const txt = typeof it === "string" ? it : JSON.stringify(it);
  if (LEAK_RE.test(txt)) { leaks++; console.log("  [LEAK?]", txt.slice(0, 160)); }
}
console.log("l02 contradiction candidates:", l02Hits, "| example-leak paraphrases:", leaks);
for (const it of l02) {
  const t = typeof it === "string" ? it : (it.title ?? it.text ?? JSON.stringify(it));
  console.log("  l02:", String(t).slice(0, 140));
}

console.log("\n— judgment risks —");
const jr = judgment.risks ?? [];
let jrHits = scan(jr, "jrisk");
console.log("judgment risks:", jr.length, "| contradiction candidates:", jrHits);

const risks = a.risks_json?.prioritized_risks ?? a.risks_json?.risks ?? [];
console.log("\n§05 prioritized risk count (FA-137 telemetry):", Array.isArray(risks) ? risks.length : "n/a", Array.isArray(risks) && risks.length ? "| first: " + (risks[0].title ?? "") : "");

const flags = (comp.dfars_flags ?? []).filter((f) => f.detected);
console.log("detected dfars_flags:", flags.length, flags.map((f) => f.clause + ":" + f.severity).join(" "));

const rf = a.risks_json?.risk_findings ?? [];
const dfarsRisks = (Array.isArray(rf) ? rf : []).filter((r) => /dfars/i.test(r.category ?? ""));
console.log("risk_findings DFARS rows:", dfarsRisks.length, "| with citations:", dfarsRisks.filter((r) => (r.citation ?? "").trim()).length);
