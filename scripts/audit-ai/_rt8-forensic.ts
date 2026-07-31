// $0 FORENSIC — before building anything, look at the two surviving AUTO-Fs on run 61aaaa95 in the RAW data.
//   (a) the PWS absence claim that escaped DOC_ABSENCE ("is listed but not reproduced")
//   (b) the "mandatory site visit" findings, where "mandatory" is 0x in 135,074 chars
// Prints the exact finding text AND every source sentence mentioning a site visit, so the fix is designed against
// what the source actually says rather than against my memory of it.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";

const RUN = "61aaaa95-b205-43b0-bf41-0a25fdd9265e";

(async () => {
  const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await a.from("audits").select("id,solicitation_number,raw_pdf_text,compliance_json,set_aside").eq("id", RUN).single();
  if (error || !data) { console.log("NO ROW:", error?.message); process.exit(1); }
  const src: string = data.raw_pdf_text || "";
  const findings: any[] = data.compliance_json?.v3?.findings || [];
  console.log(`sol ${data.solicitation_number} · source ${src.length.toLocaleString()} chars · findings ${findings.length}`);

  // ---- (a) absence-shape residual -------------------------------------------------------------------
  const SUPPLY = /\bnot\s+(?:provided|reproduced|attached|included|furnished|supplied|present|available|located)\b/i;
  const CURRENT = /\b(?:is|are|was|were)\s+(?:referenced\s+but\s+)?not\s+(?:provided|reproduced|attached|included|furnished|supplied|present|available|located)\b/i;
  console.log("\n=== (a) claims carrying a supply-absence predicate ===");
  for (const [i, f] of findings.entries()) {
    const t = String(f.requirement || "");
    if (!SUPPLY.test(t)) continue;
    const m = SUPPLY.exec(t)!;
    console.log(`\n#${i} current-regex=${CURRENT.test(t) ? "MATCH" : "MISS"}`);
    console.log(`   lead60: ...${JSON.stringify(t.slice(Math.max(0, m.index - 60), m.index))}`);
    console.log(`   text  : ${t.slice(0, 260)}`);
  }

  // ---- (b) qualifier force ---------------------------------------------------------------------------
  console.log("\n=== (b) findings asserting mandatory force ===");
  const FORCE = /\b(mandatory|required|must attend|obligatory|compulsory)\b/i;
  for (const [i, f] of findings.entries()) {
    const t = String(f.requirement || "");
    if (!/site\s+visit/i.test(t)) continue;
    console.log(`\n#${i} force=${FORCE.test(t) ? FORCE.exec(t)![1] : "—"} | citation=${JSON.stringify(f.citation || "").slice(0, 120)}`);
    console.log(`   ${t.slice(0, 400)}`);
    if (f.evidence_excerpt) console.log(`   EXCERPT: ${String(f.evidence_excerpt).slice(0, 300)}`);
  }

  console.log("\n=== (b2) EVERY source sentence mentioning a site visit ===");
  const sents = src.split(/(?<=[.!?])\s+|\n+/);
  let n = 0;
  for (const s of sents) {
    if (!/site\s+visit|walk[- ]?through|pre[- ]?proposal conference/i.test(s)) continue;
    n++;
    console.log(`  [${n}] ${s.replace(/\s+/g, " ").trim().slice(0, 320)}`);
  }
  console.log(`  (${n} sentences)`);
  for (const w of ["mandatory", "shall attend", "must attend", "is required", "are required", "highly encouraged", "optional", "recommended"]) {
    const c = (src.match(new RegExp(w.replace(/ /g, "\\s+"), "gi")) || []).length;
    console.log(`  count "${w}": ${c}`);
  }
})();
