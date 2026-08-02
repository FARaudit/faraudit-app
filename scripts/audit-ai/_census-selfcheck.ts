// SELF-CHECK on _census-read-not-analyzed.ts — the census claimed the PWS on 95698f91 carries ZERO attributed
// findings, but the verified 2026-07-30 post-mortem recorded FIVE (read straight off the persisted
// compliance_json.finding_provenance). One of the two is wrong. This compares the PERSISTED provenance against my
// RECOMPUTED provenance on the same row, so the disagreement is located before any number is reported.
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_census-selfcheck.ts
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";

const AUDIT_ID = "95698f91-ddeb-4ed2-b5c4-eda18495219a";
process.env.AUDIT_ATTACHMENT_COVERAGE = "false";
process.env.AUDIT_COVERAGE_COUNTER_SPLIT = "true";

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await admin.from("audits").select("compliance_json,raw_pdf_text").eq("id", AUDIT_ID).single();
  if (error) throw new Error(JSON.stringify(error));
  const cj = (data as any).compliance_json as Record<string, any>;
  const fullSource = (data as any).raw_pdf_text as string;
  const findings = cj.v3.findings as unknown[];

  const { docRegions, findingProvenance } = await import("../../src/lib/audit-orchestrator");

  const tally = (rows: Array<{ doc: string }>) => {
    const m = new Map<string, number>();
    for (const p of rows) m.set(p.doc, (m.get(p.doc) ?? 0) + 1);
    return m;
  };

  // A — the PERSISTED provenance, exactly the field the post-mortem read.
  const persisted = (cj.finding_provenance ?? cj.v3?.finding_provenance ?? []) as Array<{ doc: string }>;
  console.log(`\nA · PERSISTED compliance_json.finding_provenance — ${persisted.length} rows`);
  if (!persisted.length) console.log(`  (field absent at both paths — checked cj.finding_provenance and cj.v3.finding_provenance)`);
  for (const [doc, n] of [...tally(persisted)].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${doc}`);

  // B — my RECOMPUTATION, the thing the census used.
  const recomputed = findingProvenance(fullSource, findings as never);
  console.log(`\nB · RECOMPUTED findingProvenance(raw_pdf_text, v3.findings) — ${recomputed.length} rows`);
  for (const [doc, n] of [...tally(recomputed)].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${doc}`);

  // C — the region namespace the census iterated, with the isPrimary flag it keyed on.
  console.log(`\nC · docRegions(raw_pdf_text) — the namespace the census iterated`);
  for (const r of docRegions(fullSource)) console.log(`  isPrimary=${String(r.isPrimary).padEnd(5)} ${String(r.text.length).padStart(7)} chars  ${r.name}`);

  console.log(`\nVERDICT — if A and B disagree, the census measured the wrong thing and its 41 hits are void.\n`);
  process.exit(0);
})();
