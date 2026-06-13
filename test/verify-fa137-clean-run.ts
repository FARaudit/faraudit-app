// FA-137 closure gate (b) — clean production-path run on the EXISTING SPRRA
// fixture (inline-base64 sam_fetched arm): call-3 telemetry must persist as
// ok or retried_ok in audits.compliance_json.call3. One paid engine run.
// Run: set -a && source <(grep -E "^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SAM_API_KEY|ANTHROPIC_API_KEY|CLAUDE_TIMEOUT_MS)=" .env.local) && set +a && npx tsx test/verify-fa137-clean-run.ts

process.env.AUDIT_ENGINE_V2 = "true";

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

async function main(): Promise<void> {
  const { executeAudit } = await import("../src/lib/audit-executor");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const pdf = readFileSync("test/pdfs/SPRRA126Q0034.pdf");
  const { data: ins, error } = await supabase.from("audits").insert({ notice_id: "pdf-fa137-clean", title: "FA-137 clean-run telemetry fixture", status: "processing", audit_source: "user", solicitation_number: "SPRRA126Q0034" }).select("id").single();
  if (error) throw new Error(error.message);
  const id = ins.id as string;
  console.log("clean-run fixture →", id, "· real engine run (sam_fetched arm)…");
  try {
    await executeAudit(supabase, id, {
      solicitation: {
        noticeId: "pdf-fa137-clean", solicitationNumber: "SPRRA126Q0034", title: "FA-137 clean-run telemetry fixture",
        department: null, subTier: null, fullParentPathName: null, naicsCode: null, type: null, typeOfSetAside: null,
        postedDate: null, responseDeadLine: null, description: "(FA-137 clean-run fixture)", resourceLinks: []
      },
      agency: null, pdfBuffer: null, pdfBase64: pdf.toString("base64"), pdfFileId: null,
      imageBase64: null, imageMediaType: null, extractedText: null, extractedFormat: null,
      pdfSource: "sam_fetched", pdfUnavailableReason: null
    });
    const { data: row } = await supabase.from("audits").select("status,compliance_json,risks_json").eq("id", id).single();
    console.log("CLEAN-RUN TELEMETRY ROW EVIDENCE:");
    console.log("  audits.id:", id);
    console.log("  status:", row?.status);
    console.log("  compliance_json.call3:", JSON.stringify(row?.compliance_json?.call3));
    console.log("  risk_findings count:", (row?.risks_json?.risk_findings || []).length);
    const ok = row?.status === "complete" && ["ok", "retried_ok"].includes(row?.compliance_json?.call3?.outcome);
    console.log(ok ? "CLOSURE GATE (b): PASS" : "CLOSURE GATE (b): FAIL");
    process.exitCode = ok ? 0 : 1;
  } finally {
    await supabase.from("fa_intelligence_corpus").delete().eq("audit_id", id);
    await supabase.from("audits").delete().eq("id", id);
    console.log("cleanup done");
  }
}

main().catch((e) => { console.error("crashed:", e.message); process.exit(2); });
