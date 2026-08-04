// $0 — THE OTHER ERROR DIRECTION. The identifier requirement closes vector 1 by NARROWING, so it necessarily makes
// the rule decline claims it used to accept. Counting only the breaks it closes is a one-sided ruler, and a
// one-sided ruler designs the system. This measures what the narrowing COSTS on the banked corpus.
//
// Population: every finding that asserts a document absence AND names a token of a real region in its own run —
// everything the rule was willing to consider — split by whether the subject carries an explicit identifier. The
// "no identifier" column is what the new condition declines, printed verbatim so the trade is judged on real
// sentences rather than on a number.
//
// Uses the module's REAL identifier rule via DOC_IDENTIFIER_FOR_TEST; a local copy would share its premise and
// agree with it by construction.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import { docRegions } from "../../src/lib/audit-orchestrator";
import { DOC_ABSENCE_FOR_TEST, DOC_IDENTIFIER_FOR_TEST } from "../../src/lib/audit-absence-reconcile";

const ID = DOC_IDENTIFIER_FOR_TEST();
const tokensOf = (name: string) =>
  (name || "").replace(/\.[a-z0-9]+$/i, "").toLowerCase().split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !["the", "and", "for", "pdf", "doc", "docx", "final", "copy", "signed", "rev", "revised", "attachment", "attach", "amendment", "solicitation", "notice", "body"].includes(t));

(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const a = createClient(url!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await a.from("audits").select("id,raw_pdf_text,compliance_json")
    .eq("status", "complete").not("raw_pdf_text", "is", null)
    .order("created_at", { ascending: false }).limit(20);

  let total = 0, considered = 0, withId = 0;
  const declined: Array<{ run: string; claim: string; region: string }> = [];
  for (const r of ((data || []) as any[])) {
    const f = r.compliance_json?.v3?.findings;
    if (!Array.isArray(f) || !f.length || !r.raw_pdf_text) continue;
    const regions = docRegions(r.raw_pdf_text).map((x) => ({ name: x.name, tokens: tokensOf(x.name) }));
    for (const x of f) {
      total++;
      const claim = String(x?.requirement ?? "");
      const m = claim.match(new RegExp(DOC_ABSENCE_FOR_TEST.source, "i"));
      if (!m || m.index === undefined) continue;
      const span = claim.slice(Math.max(0, m.index - 200), m.index);
      const low = span.toLowerCase();
      const hit = regions.find((rg) => rg.tokens.length > 0 && rg.tokens.some((t) => low.includes(t)));
      if (!hit) continue;
      considered++;
      if (ID.test(span)) withId++;
      else declined.push({ run: String(r.id).slice(0, 8), claim: claim.replace(/\s+/g, " ").slice(0, 150), region: hit.name });
    }
  }

  console.log(`findings scanned                                    : ${total}`);
  console.log(`CONSIDERED (asserts absence AND names a region token): ${considered}`);
  console.log(`  carries an explicit identifier — still eligible    : ${withId}`);
  console.log(`  NO identifier                                      : ${declined.length}`);
  console.log(`\n=== the no-identifier claims, verbatim ===`);
  if (!declined.length) console.log("   (none on the banked corpus)");
  for (const d of declined) console.log(`\n[${d.run}] shares a token with region: ${d.region}\n   ${d.claim}`);
  console.log(`
READ THIS BEFORE QUOTING THE NUMBER ABOVE — it is an UPPER BOUND, not the marginal cost.
"CONSIDERED" is approximated BEFORE the residue test, so the no-identifier rows are claims the shipped rule
already declined for having residue; the identifier condition is not what turns them away. The MARGINAL cost of
the condition is measured elsewhere and is ZERO: the refuted set over this same corpus is byte-identical before
and after it (5 refuted, same claims, same regions — _rt7-v1-groundtruth.ts).

The rows are still worth printing, because they show the token-collision material is real: "Drawing C1.01 is
referenced throughout the PWS…" shares a token with a PAST PERFORMANCE FILLABLE FORM. That is vector 1's shape
sitting in production data, one residue-test away from deleting a warning.`);
})();
