// $0 — GROUND TRUTH for adversarial vector 1 (name-token SUBSET over-refute).
//
// Dumps every claim the SHIPPING rule currently refutes across the banked corpus, with the region it was refuted
// against and the subject span the rule actually computed. This is the true-positive set any candidate fix must
// preserve — read from the corpus, never hand-listed, because the red-team's own refuted fix (require token
// EQUALITY) destroyed 2 of them precisely because real filenames carry tokens no lens will ever write
// ("Appropved", "ATT10_", "Raytheon", "AMD 002").
//
// Read-only. No model call, no write, no flag.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
import { reconcileAbsenceClaims } from "../../src/lib/audit-absence-reconcile";
import { docRegions } from "../../src/lib/audit-orchestrator";

(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const a = createClient(url!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await a.from("audits")
    .select("id,solicitation_number,raw_pdf_text,compliance_json,set_aside")
    .eq("status", "complete").not("raw_pdf_text", "is", null)
    .order("created_at", { ascending: false }).limit(20);

  let audits = 0, findings = 0;
  const hits: Array<{ run: string; sol: string; doc: string; kind: string; before: string }> = [];
  for (const r of ((data || []) as any[])) {
    const f = r.compliance_json?.v3?.findings;
    if (!Array.isArray(f) || !f.length) continue;
    audits++; findings += f.length;
    const prov = new Set<string>(
      (r.compliance_json?.v3?.finding_provenance || []).map((p: any) => p?.doc).filter((d: any) => d && d !== "(ungrounded)"),
    );
    const out = reconcileAbsenceClaims(f.map((x: any, i: number) => ({ ...x, id: `f#${i}` })), r.raw_pdf_text, prov, r.set_aside);
    for (const x of out.refuted) hits.push({ run: String(r.id).slice(0, 8), sol: r.solicitation_number, doc: x.doc, kind: x.kind, before: x.before });
  }

  console.log(`corpus: ${audits} audits · ${findings} findings · ${hits.length} refuted by the SHIPPING rule\n`);
  console.log("=== TRUE-POSITIVE SET — every one of these must survive any candidate fix ===");
  for (const h of hits) {
    console.log(`\n[${h.run}] ${h.sol}  →  refuted against: ${h.doc}   (${h.kind})`);
    console.log(`   claim: ${h.before.replace(/\s+/g, " ").slice(0, 190)}`);
  }

  // The regions each corpus run actually carries — the material vector 1 exploits.
  console.log("\n\n=== REGION NAMES IN THE CORPUS (the token pool a claim can accidentally match) ===");
  const seen = new Set<string>();
  for (const r of ((data || []) as any[])) {
    if (!r.raw_pdf_text) continue;
    for (const n of docRegions(r.raw_pdf_text).map((x) => x.name)) if (!seen.has(n)) { seen.add(n); console.log(`   ${n}`); }
  }
})();
