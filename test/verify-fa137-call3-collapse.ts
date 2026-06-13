// FA-137 gate — call-3 silent-collapse resilience + loud degradation marker.
// Run: set -a && source <(grep -E "^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SAM_API_KEY|ANTHROPIC_API_KEY|CLAUDE_TIMEOUT_MS)=" .env.local) && set +a && npx tsx test/verify-fa137-call3-collapse.ts
//
// COST NOTE: two metadata-arm executeAudit runs (calls 1-2 + classifier real,
// call-3 stubbed via __setCall3StubForTests; pdfSource=sam_unavailable so no
// document tokens). Local, never against the production worker.
//
// Layers:
//   V — validateRisksJson structural units (no thinness heuristics asserted).
//   C — forced collapse: stub returns {"risk_findings":[]} on BOTH attempts →
//       ladder fires (attempt 2 observed) → run completes NOT-clean with
//       compliance_json.call3 = {outcome:"collapsed", reason} · local render
//       shows the §05 data-call3-degraded banner.
//   R — forced retried_ok: attempt 1 invalid, attempt 2 valid → telemetry
//       {outcome:"retried_ok", saved_by:<retry model>} and NO banner.

process.env.AUDIT_ENGINE_V2 = "true";

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  console.log(`${cond ? "PASS" : "FAIL"} · ${name}${cond ? "" : " — " + detail}`);
  if (!cond) failures++;
}

const VALID_RISKS = JSON.stringify({
  risk_findings: [
    { title: "FA-137 fixture risk", text: "Synthetic finding for retried_ok path.", category: "Compliance", citation: "FAR 52.204-7", faraudit_action: "Verify SAM registration.", offerorActionRequired: true }
  ]
});

async function main(): Promise<void> {
  const engine = await import("../src/lib/audit-engine");
  const { executeAudit } = await import("../src/lib/audit-executor");
  const { buildViewModel } = await import("../src/app/audit/[id]/_view-model");
  const { renderAuditReportComplete } = await import("../src/app/audit/[id]/_render");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const template = readFileSync("src/app/audit/[id]/_template.html", "utf8");

  // ── V · structural validator units ─────────────────────────────────────────
  check("V1 null json invalid", !engine.validateRisksJson(null).valid);
  check("V2 missing risk_findings invalid", !engine.validateRisksJson({ other: 1 }).valid);
  check("V3 empty risk_findings invalid (contract floor, not thinness)", !engine.validateRisksJson({ risk_findings: [] }).valid);
  check("V4 all rows schema-invalid → invalid", !engine.validateRisksJson({ risk_findings: [{ category: "x" }, {}] }).valid);
  check("V5 single valid row → valid (NO count threshold)", engine.validateRisksJson({ risk_findings: [{ title: "t", text: "x" }] }).valid);
  check("V6 19-risk real shape → valid", engine.validateRisksJson(JSON.parse(VALID_RISKS)).valid);

  const mkInput = (label: string) => ({
    solicitation: {
      noticeId: `pdf-fa137-${label}`, solicitationNumber: "FA137-FIXTURE", title: `FA-137 ${label} fixture`,
      department: null, subTier: null, fullParentPathName: null,
      naicsCode: "561210", type: "Solicitation", typeOfSetAside: "SBA",
      postedDate: "2026-06-12", responseDeadLine: "2026-07-15T17:00:00-05:00",
      description: "Synthetic FA-137 fixture: replace thirteen interior door assemblies at a federal facility, contractor furnishes all labor and materials, FFP, site visit required before quote submission. This text exists so the metadata arm has a real synopsis.",
      resourceLinks: []
    },
    agency: "FA-137 TEST AGENCY",
    pdfBuffer: null, pdfBase64: null, pdfFileId: null,
    imageBase64: null, imageMediaType: null as null, extractedText: null, extractedFormat: null as null,
    pdfSource: "sam_unavailable" as const, pdfUnavailableReason: "FA-137 forced-collapse fixture (no document by design)"
  });

  const insertRow = async (label: string): Promise<string> => {
    const { data, error } = await supabase.from("audits").insert({ notice_id: `pdf-fa137-${label}`, title: `FA-137 ${label} fixture`, status: "processing", audit_source: "user", solicitation_number: "FA137-FIXTURE" }).select("id").single();
    if (error) throw new Error(`insert(${label}): ${error.message}`);
    return data.id as string;
  };

  const ids: string[] = [];
  try {
    // ── C · forced collapse ────────────────────────────────────────────────
    const attempts: Array<{ n: number; model: string }> = [];
    engine.__setCall3StubForTests((n, model) => { attempts.push({ n, model }); return '{"risk_findings": []}'; });
    const cId = await insertRow("collapse");
    ids.push(cId);
    console.log("collapse fixture →", cId, "· running executeAudit (metadata arm, call-3 stubbed)…");
    await executeAudit(supabase, cId, mkInput("collapse"));
    check("C1 ladder fired both rungs (Sonnet → Opus)", attempts.length === 2 && attempts[0].n === 1 && attempts[1].n === 2, JSON.stringify(attempts));
    const { data: cRow } = await supabase.from("audits").select("*").eq("id", cId).single();
    const c3 = cRow?.compliance_json?.call3;
    check("C2 run persisted complete WITH marker (not clean-failed)", cRow?.status === "complete", `status=${cRow?.status}`);
    check("C3 audits.compliance_json.call3.outcome = collapsed", c3?.outcome === "collapsed", JSON.stringify(c3));
    check("C4 collapse reason recorded per attempt", typeof c3?.reason === "string" && /attempt1/.test(c3.reason) && /attempt2/.test(c3.reason), c3?.reason);
    const vm = buildViewModel(cRow);
    check("C5 VM exposes call3_collapsed + customer note", vm.call3_collapsed === true && /degraded/i.test(vm.call3_degradation_note));
    const html = renderAuditReportComplete(template, vm, cRow);
    const sec05 = html.slice(html.indexOf('id="sec-risks"'), html.indexOf('id="sec-risks"') + 3000);
    check("C6 §05 renders the loud degradation banner", /data-call3-degraded/.test(sec05) && /Risk register degraded/i.test(sec05), "banner missing from sec-risks");
    check("C7 banner copy is the VM note (no silent empty §05)", /structurally valid findings/i.test(sec05));

    // ── R · forced retried_ok ──────────────────────────────────────────────
    engine.__setCall3StubForTests((n) => (n === 1 ? "not json at all {{{" : VALID_RISKS));
    const rId = await insertRow("retriedok");
    ids.push(rId);
    console.log("retried_ok fixture →", rId, "· running executeAudit…");
    await executeAudit(supabase, rId, mkInput("retriedok"));
    const { data: rRow } = await supabase.from("audits").select("*").eq("id", rId).single();
    const r3 = rRow?.compliance_json?.call3;
    check("R1 telemetry retried_ok with saving model recorded", r3?.outcome === "retried_ok" && typeof r3?.saved_by === "string" && r3.saved_by.length > 0, JSON.stringify(r3));
    check("R2 risks persisted from the saving attempt", Array.isArray(rRow?.risks_json?.risk_findings) && rRow.risks_json.risk_findings.length === 1);
    const rvm = buildViewModel(rRow);
    const rhtml = renderAuditReportComplete(template, rvm, rRow);
    check("R3 NO degradation banner on retried_ok", !/data-call3-degraded/.test(rhtml));
  } finally {
    engine.__setCall3StubForTests(null);
    for (const id of ids) {
      await supabase.from("fa_intelligence_corpus").delete().eq("audit_id", id);
      await supabase.from("audits").delete().eq("id", id);
    }
    console.log(`cleanup done (${ids.length} fixture rows + corpus)`);
  }

  console.log(failures === 0 ? "\nFA-137 gate: ALL PASS" : `\nFA-137 gate: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("FA-137 gate crashed:", e.message); process.exit(2); });
