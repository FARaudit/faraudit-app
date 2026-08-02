// $0 BLAST-RADIUS DELTA for AUDIT_BINDING_DOC_ANALYSIS_FLOOR, measured on the banked corpus.
//
// A count moving the SAFE way still needs a named cause. This runs the PRODUCTION `documentsCovered` twice over each
// banked run — flag OFF then flag ON — and reports exactly which documents flip to uncovered and which audits flip
// from complete to incomplete. It also pushes the flipped set through the SAME `uncoveredForGap` filter the verdict
// path applies (AUDIT_COVERAGE_COUNTER_SPLIT=true on the live worker strips any region a grounded finding already
// covers), so a document that flips in documentsCovered but is then filtered back out before it reaches the customer
// is counted as such rather than claimed as a win.
//   npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_floor-delta.ts
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";

// Live worker flag state (railway variables --service audit-worker --kv, 2026-08-02).
process.env.AUDIT_ATTACHMENT_COVERAGE = "false";
process.env.AUDIT_COVERAGE_COUNTER_SPLIT = "true";
process.env.AUDIT_DOC_ANALYZED_TRUTH = "true";

type Row = { id: string; solicitation_number: string | null; compliance_json: Record<string, any> | null; raw_pdf_text: string | null };

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await admin.from("audits").select("id,solicitation_number,compliance_json,raw_pdf_text")
    .not("compliance_json", "is", null).not("raw_pdf_text", "is", null).order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(JSON.stringify(error));

  const { documentsCovered, groundedSourceRegionNames } = await import("../../src/lib/audit-orchestrator");
  const { deriveAnalyzedDocuments } = await import("../../src/lib/audit-executor-v3");

  const run = (fullSource: string, findings: unknown[], on: boolean) => {
    if (on) process.env.AUDIT_BINDING_DOC_ANALYSIS_FLOOR = "true"; else delete process.env.AUDIT_BINDING_DOC_ANALYSIS_FLOOR;
    try { return documentsCovered(fullSource, findings as never, undefined); } finally { delete process.env.AUDIT_BINDING_DOC_ANALYSIS_FLOOR; }
  };

  let rows = 0, completeFlips = 0, docFlips = 0, swallowed = 0;
  const detail: string[] = [];

  for (const r of (data ?? []) as Row[]) {
    const cj = r.compliance_json as Record<string, any>;
    const findings = (cj?.v3?.findings ?? []) as unknown[];
    const fullSource = r.raw_pdf_text ?? "";
    if (!Array.isArray(findings) || !findings.length || fullSource.length < 200) continue;
    rows++;

    let off, on;
    try { off = run(fullSource, findings, false); on = run(fullSource, findings, true); } catch { continue; }
    const added = on.uncovered.filter((n) => !off.uncovered.includes(n));
    if (!added.length) continue;
    docFlips += added.length;
    if (off.complete && !on.complete) completeFlips++;

    // The verdict path does NOT consume documentsCovered.uncovered raw — it filters through groundedSourceRegionNames
    // when AUDIT_COVERAGE_COUNTER_SPLIT is on. Apply the identical filter so the number reported is the number that
    // actually reaches a customer, not the number this function produced.
    const grounded = groundedSourceRegionNames(fullSource, findings as never);
    const forGap = on.uncovered.filter((n) => !grounded.has((n || "").replace(/\s+/g, " ").trim().toLowerCase()));
    const survivors = added.filter((n) => forGap.includes(n));
    swallowed += added.length - survivors.length;

    const truth = deriveAnalyzedDocuments(fullSource, forGap);
    detail.push(`  ${r.id.slice(0, 8)} · ${(r.solicitation_number ?? "(none)").slice(0, 17).padEnd(18)} complete ${off.complete}→${on.complete}  analyzed ${truth.analyzed}/${truth.analyzed_of}`);
    for (const n of added) detail.push(`      ${survivors.includes(n) ? "REACHES CUSTOMER" : "filtered back out"}  ${n}`);
  }

  console.log(`\nDELTA — AUDIT_BINDING_DOC_ANALYSIS_FLOOR OFF → ON (banked corpus, live flag state)\n`);
  console.log(`  audits measured ....................... ${rows}`);
  console.log(`  audits flipping complete → incomplete .. ${completeFlips}`);
  console.log(`  documents newly named uncovered ....... ${docFlips}`);
  console.log(`  of those, filtered out before display .. ${swallowed}`);
  console.log(`  of those, REACHING the customer ....... ${docFlips - swallowed}\n`);
  for (const d of detail) console.log(d);
  console.log();
  process.exit(0);
})();
