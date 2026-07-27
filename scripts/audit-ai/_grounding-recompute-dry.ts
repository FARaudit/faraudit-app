// DRY — how often does `grounded: true` disagree with the source, on REAL rows?
// $0, read-only. Runs the shipped recomputeGrounding over persisted findings + their stored source text.
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { recomputeGrounding } from "../../src/lib/audit-grounding-recompute";
dotenv.config({ path: ".env.local", quiet: true });

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  // select("*") — raw_pdf_text is required and is NOT in the narrow projections (harness memory).
  const { data, error } = await admin.from("audits").select("*").order("created_at", { ascending: false }).limit(60);
  if (error) { console.error(error.message); process.exit(1); }
  const rows = (data ?? []) as Record<string, any>[];

  let considered = 0, tot = { total:0, declaredTrue:0, computedTrue:0, demoted:0, promoted:0, noExcerpt:0 };
  const lensTally: Record<string, number> = {};
  const worst: { id: string; demoted: number; declared: number; sample: string }[] = [];

  for (const r of rows) {
    const src = String(r.raw_pdf_text ?? "");
    const cj = r.compliance_json ?? {};
    const findings = (cj?.v3?.findings ?? cj?.findings ?? []) as any[];
    if (!src || !Array.isArray(findings) || findings.length === 0) continue;
    considered++;
    const { stats } = recomputeGrounding(findings as any, src, { enabled: false });
    tot.total += stats.total; tot.declaredTrue += stats.declaredTrue; tot.computedTrue += stats.computedTrue;
    tot.demoted += stats.demoted; tot.promoted += stats.promoted; tot.noExcerpt += stats.noExcerpt;
    for (const [k, v] of Object.entries(stats.demotedLenses)) lensTally[k] = (lensTally[k] ?? 0) + v;
    if (stats.demoted > 0) {
      const bad = (findings as any[]).find((f) => f.grounded === true && f.excerpt);
      worst.push({ id: String(r.id).slice(0, 8), demoted: stats.demoted, declared: stats.declaredTrue,
                   sample: String(bad?.excerpt ?? "").slice(0, 70) });
    }
  }

  console.log(`\nGROUNDING RECOMPUTE — DRY over ${considered} audits with source + findings\n`);
  console.log(`  findings with an excerpt ......... ${tot.total}`);
  console.log(`  declared grounded:true ........... ${tot.declaredTrue}`);
  console.log(`  excerpt ACTUALLY found in source . ${tot.computedTrue}`);
  console.log(`  ── DEMOTED (claimed, unsupported)   ${tot.demoted}`);
  console.log(`  promoted (unclaimed, supported) .. ${tot.promoted}`);
  console.log(`  no excerpt at all ................ ${tot.noExcerpt}`);
  const pct = tot.declaredTrue ? ((tot.demoted / tot.declaredTrue) * 100).toFixed(1) : "0";
  console.log(`\n  ${pct}% of grounded:true claims are NOT supported by the stored source.`);
  console.log(`\n  by lens: ${JSON.stringify(lensTally, null, 0)}`);
  console.log(`\n  worst rows:`);
  for (const w of worst.sort((a,b)=>b.demoted-a.demoted).slice(0,8))
    console.log(`    ${w.id}  ${String(w.demoted).padStart(3)}/${String(w.declared).padStart(3)} demoted  e.g. "${w.sample}"`);
  console.log("");
})();
