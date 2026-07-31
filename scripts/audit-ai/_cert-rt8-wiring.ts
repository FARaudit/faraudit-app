// $0 CERT — the #8 seam. Two kinds of evidence, labelled, because they are not worth the same:
//   [EXEC]   the function is run against real banked data and its properties are observed.
//   [STATIC] the seam's shape in audit-executor-v3.ts is grep-asserted. Rule 14: source-grep alone is NOT proof of
//            runtime behaviour. The definitive wiring proof is a live run with the flag armed, which is CEO-gated —
//            this cert does not claim to substitute for it, it only rules out the inert-seam defects we can rule out.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { groundModalForce } from "../../src/lib/audit-force-grounding";

let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.log(`  ✗ ${l}`); } };

(async () => {
  const src = fs.readFileSync("src/lib/audit-executor-v3.ts", "utf8");
  const flat = src.replace(/\n/g, " ");

  console.log("[STATIC] seam shape");
  ok("seam is flag-gated on AUDIT_FORCE_GROUNDING", /AUDIT_FORCE_GROUNDING === "true"/.test(src));
  ok("module is imported by the executor", /import \{ groundModalForce \} from ".\/audit-force-grounding"/.test(src));
  ok("seam feeds the PAYLOAD (reportFindings), not a dead local",
     /reportFindings = fg\.findings/.test(src) && /buildV3Payload\(res\.decision, res\.coverage, reportFindings/.test(src));
  ok("seam is passed the FULL SOURCE, not an excerpt or a summary", /groundModalForce\(reportFindings, fullSource\)/.test(flat));
  const seam8 = src.indexOf("AUDIT_FORCE_GROUNDING"), seam7 = src.indexOf("AUDIT_ABSENCE_RECONCILE");
  ok("#8 runs AFTER #7 (it must see the final report text)", seam7 > 0 && seam8 > seam7);
  ok("#8 sits BEFORE buildV3Payload (otherwise it corrects nothing the customer reads)",
     seam8 > 0 && seam8 < src.indexOf("const payload = buildV3Payload"));

  console.log("\n[EXEC] flag-OFF byte-identity property");
  // With the flag OFF the executor never calls the module, so OFF is identical by construction. What must ALSO hold
  // is that a NON-FIRING call is a true no-op — findings returned BY REFERENCE, no object churn — otherwise arming
  // the flag would perturb every finding in the report, not just the fabricated ones.
  const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await a.from("audits").select("id,raw_pdf_text,compliance_json")
    .eq("status", "complete").not("raw_pdf_text", "is", null).order("created_at", { ascending: false }).limit(14);

  let checked = 0, byRef = 0, changed = 0, mutated = 0;
  for (const r of ((data || []) as any[])) {
    const f = r.compliance_json?.v3?.findings;
    if (!Array.isArray(f) || !f.length) continue;
    const input = f.map((x: any, i: number) => ({ ...x, id: `f#${i}` }));
    const snapshot = input.map((x: any) => x.requirement);
    const out = groundModalForce(input, r.raw_pdf_text);
    const correctedIds = new Set(out.corrected.map((c) => c.id));
    for (let i = 0; i < input.length; i++) {
      checked++;
      if (correctedIds.has(input[i].id)) { changed++; continue; }
      if (out.findings[i] === input[i]) byRef++;
      if (input[i].requirement !== snapshot[i]) mutated++;
    }
  }
  ok(`untouched findings returned BY REFERENCE (${byRef}/${checked - changed})`, byRef === checked - changed);
  ok("input array never mutated in place", mutated === 0);
  ok(`only fabricated-qualifier findings changed (${changed}/${checked})`, changed > 0 && changed < checked * 0.03);

  console.log("\n[EXEC] idempotence — a second pass must be a no-op");
  const { data: one } = await a.from("audits").select("raw_pdf_text,compliance_json").eq("id", "61aaaa95-b205-43b0-bf41-0a25fdd9265e").single();
  const f1 = ((one as any).compliance_json?.v3?.findings || []).map((x: any, i: number) => ({ ...x, id: `f#${i}` }));
  const p1 = groundModalForce(f1, (one as any).raw_pdf_text);
  const p2 = groundModalForce(p1.findings, (one as any).raw_pdf_text);
  ok(`first pass corrects (${p1.corrected.length}), second pass corrects 0`, p1.corrected.length === 2 && p2.corrected.length === 0);
  ok("no double CORRECTED prefix", !p2.findings.some((x: any) => /CORRECTED — CORRECTED/.test(String(x.requirement || ""))));

  console.log(`\nCERT RT8-WIRING: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
