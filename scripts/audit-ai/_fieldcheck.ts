// WHERE DO THE DEFECTS LIVE? Every REPORT-TRUTH defect this arc was in `requirement` (model free prose).
// Measure it: is `excerpt` (structured, verbatim-bound) actually reliable, while `requirement` is where claims drift?
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
(async () => {
  const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await a.from("audits").select("id,solicitation_number,raw_pdf_text,compliance_json")
    .eq("status","complete").not("raw_pdf_text","is",null).order("created_at",{ascending:false}).limit(14);
  let F=0, exGrounded=0, exMissing=0, reqAsserts=0, reqUnsupported=0;
  // An "assertion beyond the excerpt": requirement claims modal force or absence that its OWN excerpt never states.
  const FORCE = /\b(mandatory|compulsory|obligatory|must attend|required to attend)\b/i;
  const ABSENCE = /\b(?:is|are|was|were)\s+(?:[a-z]+,?\s+){0,4}not\s+(?:provided|reproduced|attached|included|furnished|supplied|present|available|located)\b/i;
  const OBLIG = /\b(shall|must|require[sd]?|mandatory|prerequisite|ineligible|disqualif)/i;
  for (const r of ((data||[]) as any[])) {
    const src = norm(r.raw_pdf_text||"");
    for (const f of (r.compliance_json?.v3?.findings||[])) {
      F++;
      const ex = norm(String(f.excerpt||"")); const req = String(f.requirement||"");
      if (!ex) { exMissing++; } else if (src.includes(ex.slice(0, Math.min(90, ex.length)))) exGrounded++;
      if (FORCE.test(req) || ABSENCE.test(req)) {
        reqAsserts++;
        // unsupported = the requirement asserts force/absence and the excerpt carries no obligation language at all
        if (FORCE.test(req) && ex && !OBLIG.test(ex)) reqUnsupported++;
      }
    }
  }
  console.log(`findings                      ${F}`);
  console.log(`excerpt verbatim-in-source    ${exGrounded}  (${(exGrounded/F*100).toFixed(1)}%)   missing: ${exMissing}`);
  console.log(`requirement asserts force/absence  ${reqAsserts}  (${(reqAsserts/F*100).toFixed(1)}%)`);
  console.log(`  ...of which the OWN excerpt carries no obligation at all: ${reqUnsupported}`);
})();
