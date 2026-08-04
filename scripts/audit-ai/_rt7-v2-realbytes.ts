// $0 PROBE — adversarial round-3 VECTOR 2, driven through the SHIPPING function against REAL production bytes.
//
// The red-team's own method note is the reason this file exists rather than a synthetic fixture: "the strongest
// evidence in this round was a MUTATION OF REAL BYTES, not a synthetic source — it converts 'the rule permits X'
// into 'the rule does X on this customer's document'." The unit suite proves the rule on a constructed source;
// this proves it on run 61aaaa95, the run whose Wage Determination sits at the centre of the REPORT-TRUTH arc.
//
// WANT: the numbered claim STANDS DOWN (it names a DIFFERENT determination than the one in the source) while the
// banked true positive, whose identifier is parenthetical, still REFUTES. Over-refuting is the dangerous direction.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import { reconcileAbsenceClaims } from "../../src/lib/audit-absence-reconcile";
import { docRegions } from "../../src/lib/audit-orchestrator";

const RUN = "61aaaa95-b205-43b0-bf41-0a25fdd9265e";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.log(`  ✗ ${l}`); } };

(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const a = createClient(url!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await a.from("audits").select("raw_pdf_text").eq("id", RUN).single();
  const src = (data as { raw_pdf_text: string } | null)?.raw_pdf_text;
  if (!src) { console.log(`SKIP — run ${RUN.slice(0, 8)} not readable from here`); process.exit(3); }

  const names = docRegions(src).map((r) => r.name);
  console.log(`real regions on ${RUN.slice(0, 8)}:`);
  names.forEach((n) => console.log(`   - ${n}`));
  const wd = names.find((n) => /wage/i.test(n));
  ok("the source really carries a Wage Determination region (else this probe proves nothing)", !!wd);

  // Provenance excludes the WD, which is the condition under which an absence claim about it would be refuted
  // by region PRESENCE alone — the exact situation vector 2 exploited.
  const prov = new Set(names.filter((n) => !/wage/i.test(n)));
  const run = (req: string) =>
    reconcileAbsenceClaims([{ id: "c", requirement: req }], src, prov, null).refuted.length > 0;

  ok(`a DIFFERENT determination stands down (source has "${wd}")`,
     !run("Wage Determination 15-5110 is not provided in the assigned source."));
  ok("a different revision number also stands down",
     !run("Wage Determination 2015-9999 Rev 3 is not provided."));
  ok("the banked true positive still refutes (identifier is parenthetical)",
     run("Wage Determination (Attachment 0002) is referenced but not reproduced — SCA wage rates are unknown"));
  ok("the banked PWS true positive still refutes",
     run("PWS (Attachment 0001) is referenced but not provided in the assigned source — staffing requirements are unknown"));

  console.log(`\nPROBE RT7-V2-REALBYTES: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
