// ARC #747 · V2 · Q5 — does the capability-statement replacement text survive its OWN authority bar? $0.
// The design doc proposes shipping: FAR 5.207(c)(16)(ii) invites any capable firm to submit a capability
// statement, and 6.302-1(d)(2) obliges the agency to consider it. R3 says that sentence must clear V2's bar
// before it ships. This checks the RECORD, not the regulation.
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const { data } = await admin.from("audits").select("*").order("created_at", { ascending: false }).limit(400);
  const rows = ((data ?? []) as Record<string, any>[]).filter((r) => (r.raw_pdf_text ?? "").length > 0);
  for (const r of rows) {
    const src: string = r.raw_pdf_text;
    const probe = (label: string, re: RegExp) => {
      const m = src.match(re);
      console.log(`   ${label.padEnd(46)} ${m ? "PRESENT — …" + src.slice(Math.max(0, (m.index ?? 0) - 60), (m.index ?? 0) + 150).replace(/\s+/g, " ") + "…" : "absent"}`);
    };
    console.log(`\n=== ${String(r.id).slice(0, 8)} ${r.solicitation_number} (${src.length}B) ===`);
    probe("capability statement invitation (5.207(c)(16)(ii))", /capabilit(?:y|ies)\s+statement/i);
    probe("6.302-1 / only one responsible source", /6\.302-1|only one responsible source/i);
    probe("FAR part 13 / simplified acquisition", /simplified acquisition|\bpart\s*13\b|FAR\s*13\./i);
    probe("IDIQ / indefinite-quantity / order under", /indefinite[\s-]?(?:delivery|quantity)|\bIDIQ\b|\bBOA\b|delivery order|task order/i);
    probe("all responsible sources may submit", /all responsible sources/i);
  }
})();
