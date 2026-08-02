// $0 FALSIFICATION PROBE — the RESIDUAL under REPORT-TRUTH #1, measured on real banked runs before anything is designed.
//
// RT#1 (AUDIT_DOC_ANALYZED_TRUTH, armed on worker + Vercel) makes the documents card report the VERDICT path's own gap
// list instead of an ingestion count. That gap list comes from `documentsCovered`, which lets a binding attachment
// through on a FREE PASS when `obligationsOf(region)` finds no obligation-shaped sentence (audit-orchestrator.ts:813-822).
// The eligibility-bar floor that would catch that is gated on `crossAttGate` (opts != null ⇐ AUDIT_ATTACHMENT_COVERAGE),
// and that flag reads FALSE on the live worker. So the residual question, on REAL runs and never a synthetic:
//
//   does a binding, non-primary document exist that was READ IN FULL, carries ZERO attributed findings, and was
//   nonetheless NOT named uncovered — i.e. still silently counted as analyzed?
//
// ── INSTRUMENT NOTE (v2 — v1 of this probe was VOID and this is why) ─────────────────────────────────────────────
// v1 RECOMPUTED provenance with findingProvenance(raw_pdf_text, v3.findings) and got 0 rows on a run whose PERSISTED
// finding_provenance has 63. Cause: findingProvenance skips any finding without `f.id`, and the persisted v3.findings
// carry no `id` at all (keys: kind, excerpt, citation, severity, disposition, requirement, controllability). Every
// document therefore looked unattributed and the probe reported 41 phantom hits. v2 reads the PERSISTED
// finding_provenance — the same field the 2026-07-30 post-mortem read — and never recomputes it.
//
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_census-read-not-analyzed.ts
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";

// Pin the LIVE worker flag state so the census measures PRODUCTION behaviour, not a local default.
// (Read 2026-08-02 via `railway variables --service audit-worker --kv`.)
process.env.AUDIT_ATTACHMENT_COVERAGE = "false";
process.env.AUDIT_COVERAGE_COUNTER_SPLIT = "true";
process.env.AUDIT_DOC_ANALYZED_TRUTH = "true";

type Row = { id: string; solicitation_number: string | null; compliance_json: Record<string, any> | null; raw_pdf_text: string | null };
const NOTICE_BODY = "SAM Notice Body";   // excluded from BOTH sides, exactly as deriveAnalyzedDocuments does

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await admin
    .from("audits")
    .select("id,solicitation_number,compliance_json,raw_pdf_text")
    .not("compliance_json", "is", null)
    .not("raw_pdf_text", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(JSON.stringify(error));
  const rows = (data ?? []) as Row[];

  const { docRegions, documentsCovered } = await import("../../src/lib/audit-orchestrator");
  const { isBindingDoc } = await import("../../src/lib/sam-attachments");

  let considered = 0, multiDoc = 0, skippedNoProv = 0, skippedNamespace = 0;
  const hits: Array<{ id: string; sol: string; doc: string; chars: number; obligations: number }> = [];
  const clean: string[] = [];

  for (const r of rows) {
    const cj = r.compliance_json as Record<string, any>;
    const findings = (cj?.v3?.findings ?? []) as unknown[];
    const fullSource = r.raw_pdf_text ?? "";
    if (!Array.isArray(findings) || !findings.length || fullSource.length < 200) continue;
    considered++;
    let regions;
    try { regions = docRegions(fullSource); } catch { continue; }
    if (regions.length <= 1) continue;                        // single-doc package — section completeness governs
    multiDoc++;

    // GROUND TRUTH: the PERSISTED provenance, never a recomputation (see INSTRUMENT NOTE).
    const prov = (cj.finding_provenance ?? cj.v3?.finding_provenance ?? []) as Array<{ doc?: string }>;
    if (!Array.isArray(prov) || !prov.length) { skippedNoProv++; continue; }

    // NAMESPACE INTEGRITY — the persisted provenance was written against the RUN's assembled source. If its doc names
    // are not drawn from the regions of the source stored on this row, the two are different namespaces and any
    // zero-attribution reading would be an artifact of the join, not a finding. Skip the row rather than guess.
    const regionNames = new Set(regions.map((x) => x.name));
    const provNames = new Set(prov.map((p) => p.doc ?? "").filter((d) => d && d !== "(ungrounded)"));
    if ([...provNames].some((n) => !regionNames.has(n))) { skippedNamespace++; continue; }

    const attributed = new Map<string, number>();
    for (const p of prov) if (p.doc && p.doc !== "(ungrounded)") attributed.set(p.doc, (attributed.get(p.doc) ?? 0) + 1);

    // The engine's own coverage answer at the LIVE flag state (opts undefined ⇐ AUDIT_ATTACHMENT_COVERAGE=false).
    let cov: { complete: boolean; uncovered: string[] };
    try { cov = documentsCovered(fullSource, findings as never, undefined); } catch { continue; }
    const uncoveredSet = new Set(cov.uncovered);

    let rowHits = 0;
    for (const reg of regions) {
      if (reg.isPrimary) continue;                            // primary — section completeness governs it
      if (reg.name === NOTICE_BODY) continue;                 // SAM description field, not a posted document
      if (!isBindingDoc({ role: "attachment", name: reg.name })) continue;
      if ((attributed.get(reg.name) ?? 0) > 0) continue;      // analyzed — a grounded finding lands in it
      // THE RESIDUAL: zero attributed findings AND the engine did not name it uncovered ⇒ silently counted analyzed.
      if (uncoveredSet.has(reg.name)) continue;               // correctly named — RT#1 reports this one honestly
      rowHits++;
      hits.push({
        id: r.id.slice(0, 8), sol: r.solicitation_number ?? "(none)", doc: reg.name, chars: reg.text.length,
        obligations: reg.text.split(/(?<=[.;\n])/).filter((s) => s.trim().length > 12 && /\b(shall|must|provide|submit|furnish|required|quote|deliver)\b/i.test(s)).length,
      });
    }
    if (!rowHits) clean.push(r.id.slice(0, 8));
  }

  console.log(`\nCENSUS v2 — binding documents READ but never ANALYZED (live flag state, PERSISTED provenance)\n`);
  console.log(`  audits with findings + source ................. ${considered}`);
  console.log(`  of those, multi-document packages ............. ${multiDoc}`);
  console.log(`  skipped — no persisted finding_provenance ..... ${skippedNoProv}`);
  console.log(`  skipped — provenance/source namespace mismatch  ${skippedNamespace}`);
  console.log(`  measurable rows .............................. ${multiDoc - skippedNoProv - skippedNamespace}`);
  console.log(`  rows with NO residual ......................... ${clean.length}`);
  console.log(`  RESIDUAL HITS (0 findings, NOT named uncovered) ${hits.length}\n`);

  if (hits.length) {
    console.log(`  ${"audit".padEnd(10)}${"solicitation".padEnd(18)}${"chars".padStart(8)}${"oblig".padStart(7)}  document`);
    for (const h of hits.slice(0, 40)) {
      console.log(`  ${h.id.padEnd(10)}${h.sol.slice(0, 17).padEnd(18)}${String(h.chars).padStart(8)}${String(h.obligations).padStart(7)}  ${h.doc}`);
    }
    if (hits.length > 40) console.log(`  … ${hits.length - 40} more`);
    const freePass = hits.filter((h) => h.obligations === 0).length;
    console.log(`\n  ${freePass} hit(s) carry ZERO obligation-shaped sentences → the :813 free-pass path`);
    console.log(`  ${hits.length - freePass} hit(s) carry obligations yet went unnamed → a DIFFERENT path, diagnose separately\n`);
  } else {
    console.log(`  No residual observed. The class is n=0 on this corpus — do NOT design against it without a\n  specimen (a design on an unobserved class is how the site-visit arc died).\n`);
  }
  process.exit(0);
})();
