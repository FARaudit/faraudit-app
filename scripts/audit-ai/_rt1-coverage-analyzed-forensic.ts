// $0 FORENSIC — REPORT-TRUTH fix #1. Root-cause WHY the Wage Determination doc, read mode:full with ZERO
// findings, was certified COVERED on audit 95698f91. Reads the PERSISTED row only. No re-fire, no code change.
// Reproduces documentsCovered's per-region decision path and prints WHICH valve credited each doc.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";

const ID_PREFIX = "95698f91";

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: recent, error: e0 } = await admin.from("audits").select("id,created_at,solicitation_number").order("created_at", { ascending: false }).limit(60);
  if (e0) throw new Error(JSON.stringify(e0));
  const hit = (recent ?? []).find((r) => String(r.id).startsWith(ID_PREFIX));
  if (!hit) { console.log("recent ids:", (recent ?? []).map((r) => `${String(r.id).slice(0, 8)} ${r.solicitation_number}`).join("\n  ")); throw new Error(`no audit row matching ${ID_PREFIX}`); }
  const { data: row, error } = await admin.from("audits").select("*").eq("id", hit.id).single();
  if (error) throw new Error(JSON.stringify(error));
  console.log(`row id=${row.id} sol=${row.solicitation_number} status=${row.status} verdict=${row.bid_recommendation}`);

  const cj = row.compliance_json || {};
  console.log("\n===== STORED COVERAGE VERDICT =====");
  console.log("doc_count=", cj.doc_count, "| documents_complete=", cj.documents_complete, "| coverage_complete=", cj.coverage_complete, "| honest_fail=", cj.honest_fail);
  console.log("read_modes:");
  for (const r of (cj.read_modes || [])) console.log(`   [${r.mode}] ${r.name}`);
  console.log("docs_read=", JSON.stringify(cj.docs_read ?? null));
  console.log("attestations=", JSON.stringify(cj.attestations ?? null));
  console.log("uncovered=", JSON.stringify(cj.documents_uncovered ?? cj.uncovered ?? null));

  // ---- region census over the stored fullSource ----
  const full: string = row.raw_pdf_text || "";
  console.log(`\nfullSource len=${full.length}`);
  const { docRegions } = await import("../../src/lib/audit-orchestrator");
  const regions = docRegions(full);
  console.log(`regions=${regions.length}`);
  for (const r of regions) console.log(`   ${r.isPrimary ? "PRIMARY " : "attach  "} "${r.name}" len=${r.text.length}`);

  // ---- per-doc: obligations found, findings grounded in it ----
  // obligationsOf is module-private in audit-orchestrator — mirrored VERBATIM from src/lib/audit-orchestrator.ts:365-369.
  const obligationsOf = (text: string) => {
    const all = text.split(/(?<=[.;\n])/).map((s) => s.trim())
      .filter((s) => s.length > 12 && /\b(shall|must|provide|submit|furnish|required|quote|deliver)\b/i.test(s));
    return { obligations: all.slice(0, 200), truncated: all.length > 200 };
  };
  const { isBindingDoc } = await import("../../src/lib/sam-attachments");
  const findings = Array.isArray(row.findings) ? row.findings : (row.findings?.findings ?? []);
  const norm = (s: string) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const primaryNorm = norm(regions.find((r) => r.isPrimary)?.text ?? "");

  console.log("\n===== PER-DOC ANALYZED CENSUS =====");
  for (const r of regions) {
    if (r.isPrimary) { console.log(`PRIMARY "${r.name}" — governed by section completeness`); continue; }
    const binding = isBindingDoc({ role: "attachment", name: r.name });
    const obs = obligationsOf(r.text).obligations;
    const nRegion = norm(r.text);
    const grounded = findings.filter((f: Record<string, unknown>) => {
      const ex = norm(String(f.excerpt ?? f.source_excerpt ?? ""));
      return ex.length > 0 && nRegion.includes(ex) && !primaryNorm.includes(ex);
    });
    const verdict = !binding ? "EXEMPT (non-binding)"
      : obs.length === 0 ? "COVERED via read_no_obligation VALVE (obligationsOf empty)"
      : grounded.length > 0 ? `COVERED via ${grounded.length} grounded finding(s)`
      : "→ would fall through to attestation valve / uncovered";
    console.log(`attach "${r.name}" binding=${binding} obligations=${obs.length} groundedFindings=${grounded.length}`);
    console.log(`        VERDICT: ${verdict}`);
    if (obs.length) console.log(`        first obligation: ${obs[0].slice(0, 140).replace(/\s+/g, " ")}`);
  }

  // ---- the specific contradiction: WD content present vs report claim ----
  console.log("\n===== WD CONTENT PRESENT IN SOURCE? =====");
  for (const pat of [/2015-5631/i, /\$?\s*27\.19/, /health\s*(?:&|and)\s*welfare/i, /\$?\s*5\.55/, /52\.222-43/, /52\.219-6/]) {
    const m = pat.exec(full);
    console.log(`   ${String(pat).padEnd(34)} ${m ? `FOUND @${m.index}` : "ABSENT"}`);
  }
})();
