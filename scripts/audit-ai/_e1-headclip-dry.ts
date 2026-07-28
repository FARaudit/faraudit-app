// ARC #747 · E1 — DRY RUN over the real corpus. Writes nothing.
//
// Applies the SHIPPED detector/repair (imported, never restated) to every stored audit that has both source
// text and findings, and reports what would change if AUDIT_EXCERPT_HEAD_REGROUND were armed.
//
// HONEST SCOPE LIMIT, stated up front. The engine pass runs on in-memory `TypedFinding`s, which carry `lens`;
// the PERSISTED v3 findings do not carry lens, so this DRY cannot apply the deterministic-lens exclusion. It
// therefore measures the CLASS across stored excerpts — an upper bound on what a live run would touch, not a
// replay of one. It is a prevalence measurement, not a proof of the production path.
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import * as dotenv from "dotenv";
import { isHeadClippedExcerpt, findHeadRepairSpan, locateExcerpt } from "../../src/lib/audit-excerpt-repair";
dotenv.config({ path: ".env.local", quiet: true });

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const { data, error } = await admin.from("audits")
    .select("id, solicitation_number, raw_pdf_text, compliance_json")
    .order("created_at", { ascending: false }).limit(200);
  if (error) { console.error(error.message); process.exit(1); }

  let audits = 0, excerpts = 0, notInSource = 0, ambiguous = 0, clipped = 0, repaired = 0, unrepairable = 0, sweepCited = 0;
  const samples: any[] = [];

  for (const row of (data ?? []) as any[]) {
    const source: string = row.raw_pdf_text ?? "";
    const findings: any[] = row.compliance_json?.v3?.findings ?? [];
    if (!source || !findings.length) continue;
    audits++;
    for (const f of findings) {
      const ex: string = f.excerpt ?? "";
      if (!ex.trim()) continue;
      excerpts++;
      // One definition of "is this in the source" — the module's own, canonicalization included.
      const where = locateExcerpt(source, ex);
      if (where === "absent") { notInSource++; continue; }
      if (where === "ambiguous") { ambiguous++; continue; } // the repair refuses these; count them separately
      if (!isHeadClippedExcerpt(source, ex)) continue;
      clipped++;
      const span = findHeadRepairSpan(source, ex);
      if (!span) { unrepairable++; continue; }
      repaired++;
      // The persisted findings carry no `lens`, so production's REPAIR_EXCLUDED_LENSES cannot be applied
      // here. Deterministic-sweep findings do, however, stamp their citation — an approximation, labelled as
      // one, so the headline number is not quoted as the production yield.
      if (/grounding sweep|deterministic sweep/i.test(String(f.citation ?? ""))) sweepCited++;
      if (samples.length < 12) {
        const restored = span.slice(0, Math.max(0, span.length - ex.trim().length));
        samples.push({ audit: row.id.slice(0, 8), sol: row.solicitation_number, cite: f.citation,
          restoredHead: restored.replace(/\s+/g, " ").trim(), excerptStart: ex.trim().slice(0, 60).replace(/\s+/g, " ") });
      }
    }
  }

  console.log(`\nARC #747 · E1 head-clip DRY — ${audits} audits with source+findings · ${excerpts} excerpts\n`);
  console.log(`  excerpts not locatable in source ........ ${notInSource}`);
  console.log(`  excerpts ambiguous (>1 occurrence) ..... ${ambiguous}   (repair refuses these)`);
  console.log(`  HEAD-CLIPPED (begins mid-clause) ....... ${clipped}   (${excerpts ? ((clipped / excerpts) * 100).toFixed(1) : "0"}% of excerpts)`);
  console.log(`    ├─ would be re-grounded .............. ${repaired}`);
  console.log(`    └─ left as emitted (refused) ......... ${unrepairable}`);
  console.log(`\n  of the re-grounded: ${sweepCited} carry a deterministic-sweep citation and would be SKIPPED in production`);
  console.log(`  (REPAIR_EXCLUDED_LENSES is keyed on \`lens\`, which persisted findings do not carry — so the`);
  console.log(`   figure above is an UPPER BOUND on the production yield, approximately ${repaired - sweepCited} of ${excerpts}.)`);
  console.log(`\n── what the customer was not shown (restored head → the excerpt they saw) ──`);
  for (const s of samples) {
    console.log(`\n  ${s.audit} · ${s.sol}\n     cite    : ${s.cite}`);
    console.log(`     RESTORED: "${s.restoredHead}"`);
    console.log(`     shipped : "${s.excerptStart}…"`);
  }
  const out = process.argv[2];
  if (out) { writeFileSync(out, JSON.stringify({ audits, excerpts, clipped, repaired, unrepairable, samples }, null, 2)); console.log(`\nwritten: ${out}`); }
  console.log("\nDRY — nothing written to the database, no flag armed.\n");
})();
