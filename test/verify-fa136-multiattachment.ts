// FA-136 gate — multi-attachment ingestion: deterministic form-first
// selection, budgeted full-set ingestion, loud completeness flag.
// Run: set -a && source <(grep -E "^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SAM_API_KEY|ANTHROPIC_API_KEY|CLAUDE_TIMEOUT_MS)=" .env.local) && set +a && npx tsx test/verify-fa136-multiattachment.ts
//
// COST DISCIPLINE: exactly ONE paid engine run (the 1232SA26R0020 live
// exhibit — the multi-attachment evidence run the gate requires). Everything
// else is pure logic, SAM downloads, or local render.
//
// Layers:
//   P — planDocumentOrder on the two REAL recorded manifests: the form is
//       found at manifest position 13 (1232) and position 2 (FA4600).
//   B — applyBudget on the 1232 manifest: form+amendment always in, ZIPs and
//       oversize drawing sets out, overflow reasons named.
//   L — live assembly of the real 1232 set (SAM downloads, no LLM).
//   E — THE paid evidence run: executeAudit on the assembled 1232 set →
//       compliance_json.ingestion persisted, form_identified=true, overflow
//       flagged · VM + render show the loud partial-ingestion banner.
//   S — single-doc regression: RE-RENDER (not re-run) of stored audit
//       05b44783 → no ingestion banner on clean single-doc audits.

process.env.AUDIT_ENGINE_V2 = "true";

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const NOTICE_1232 = "91745b32750e4c9a918b0c7a0028619f";

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  console.log(`${cond ? "PASS" : "FAIL"} · ${name}${cond ? "" : " — " + detail}`);
  if (!cond) failures++;
}

async function main(): Promise<void> {
  const att = await import("../src/lib/sam-attachments");
  const { executeAudit } = await import("../src/lib/audit-executor");
  const { buildViewModel } = await import("../src/app/audit/[id]/_view-model");
  const { renderAuditReportComplete } = await import("../src/app/audit/[id]/_render");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const template = readFileSync("src/app/audit/[id]/_template.html", "utf8");

  // ── P · deterministic plan on real manifests ───────────────────────────────
  const m1232 = await att.fetchAttachmentManifest(NOTICE_1232);
  check("P1 1232 manifest readable (18 files)", !!m1232 && m1232.length === 18, `got ${m1232?.length}`);
  const plan1232 = att.planDocumentOrder(m1232!, "1232SA26R0020");
  check("P2 1232 form identified by name (manifest position was 13)", plan1232[0].role === "form" && plan1232[0].name === "1232SA26R0020.pdf", plan1232[0].name);
  check("P3 1232 amendment ranked second", plan1232[1].role === "amendment" && /Amd_0001/.test(plan1232[1].name), plan1232[1].name);
  const m4600 = await att.fetchAttachmentManifest("d612cc613d33400b96cec0a906247382");
  const plan4600 = att.planDocumentOrder(m4600!, "FA460026Q0047");
  check("P4 FA4600 form identified (audits had ingested the PWS)", plan4600[0].role === "form" && plan4600[0].name === "Solicitation - FA460026Q0047.pdf", plan4600[0].name);

  // ── B · budget on the 1232 set ─────────────────────────────────────────────
  const { ingest, skipped } = att.applyBudget(plan1232);
  const totalBytes = ingest.reduce((s, e) => s + (e.sizeBytes ?? 0), 0);
  check("B1 form + amendment always ingested", ingest.some((e) => e.role === "form") && ingest.some((e) => e.role === "amendment"));
  // FA-INGEST4: the pre-download byte gate is now the 80MB MAX_DOWNLOAD_BYTES
  // sanity guard (the 15MB inline ceiling was wrongly pre-dropping text-readable
  // docs). NOTE: B4's "Drawing Set" exclusion now only fires if the set exceeds
  // 80MB OR the 30-doc cap — re-confirm against the live 1232 manifest when this
  // paid evidence script is next run.
  check(`B2 budget respected (${ingest.length} docs, ${(totalBytes / 1048576).toFixed(1)}MB)`, ingest.length <= att.MAX_DOCS && totalBytes <= att.MAX_DOWNLOAD_BYTES);
  check("B3 ZIPs excluded with named reason", skipped.some((s) => /\.zip$/i.test(s.entry.name) && /non-PDF/.test(s.reason)));
  check("B4 oversize drawing sets excluded with named reason", skipped.some((s) => /Drawing Set/.test(s.entry.name)));

  // ── L · live assembly ──────────────────────────────────────────────────────
  console.log("downloading 1232 budgeted set (SAM, no LLM)…");
  const assembled = await att.assembleSamDocumentSet(NOTICE_1232, "1232SA26R0020");
  check("L1 primary is THE FORM", assembled?.primary?.name === "1232SA26R0020.pdf", assembled?.primary?.name);
  check("L2 ingestion meta: 18 total, partial, form_identified", assembled!.ingestion.files_total === 18 && assembled!.ingestion.form_identified === true && assembled!.ingestion.files_ingested < 18, JSON.stringify({ t: assembled!.ingestion.files_total, i: assembled!.ingestion.files_ingested }));
  check("L3 overflow flag present + named", typeof assembled!.ingestion.overflow === "string" && assembled!.ingestion.overflow!.length > 0);

  // ── E · THE paid evidence run ──────────────────────────────────────────────
  const { data: ins, error: insErr } = await supabase.from("audits").insert({ notice_id: NOTICE_1232, title: "FA-136 multi-attachment evidence run (1232SA26R0020)", status: "processing", audit_source: "user", solicitation_number: "1232SA26R0020" }).select("id").single();
  if (insErr) throw new Error(insErr.message);
  const id = ins.id as string;
  console.log("evidence run →", id, `· ${1 + assembled!.attachments.length} documents to the engine · real run…`);
  try {
    await executeAudit(supabase, id, {
      solicitation: {
        noticeId: NOTICE_1232, solicitationNumber: "1232SA26R0020", title: "Tornado Repairs USHRL",
        department: null, subTier: null, fullParentPathName: null, naicsCode: null, type: "Solicitation", typeOfSetAside: null,
        postedDate: null, responseDeadLine: null, description: "", resourceLinks: []
      },
      agency: "USDA ARS",
      pdfBuffer: assembled!.primary!.buffer,
      pdfBase64: assembled!.primary!.base64,
      pdfFileId: null, imageBase64: null, imageMediaType: null, extractedText: null, extractedFormat: null,
      pdfSource: "sam_fetched", pdfUnavailableReason: null,
      attachmentPdfs: assembled!.attachments,
      primaryDocName: assembled!.primary!.name,
      ingestion: assembled!.ingestion
    });
    const { data: row } = await supabase.from("audits").select("*").eq("id", id).single();
    const ing = row?.compliance_json?.ingestion;
    console.log("EVIDENCE ROW FIELDS (audits.compliance_json.ingestion):");
    console.log(JSON.stringify({ files_total: ing?.files_total, files_ingested: ing?.files_ingested, form_identified: ing?.form_identified, form_name: ing?.form_name, overflow: ing?.overflow }, null, 1));
    console.log("call3:", JSON.stringify(row?.compliance_json?.call3));
    check("E1 run complete", row?.status === "complete", row?.status);
    check("E2 ingestion persisted: form_identified=true", ing?.form_identified === true);
    check("E3 files_total=18, files_ingested matches assembly", ing?.files_total === 18 && ing?.files_ingested === assembled!.ingestion.files_ingested);
    check("E4 overflow flagged loudly (budget-limited set)", typeof ing?.overflow === "string");
    check("E5 per-file roles + reasons persisted", Array.isArray(ing?.files) && ing.files.length === 18 && ing.files.every((f: { ingested: boolean; reason?: string }) => f.ingested || !!f.reason));
    const vm = buildViewModel(row);
    check("E6 VM flags ingestion_incomplete", vm.ingestion_incomplete === true && /18/.test(vm.ingestion_note));
    const html = renderAuditReportComplete(template, vm, row);
    check("E7 report renders the loud ingestion banner", /data-ingestion-incomplete/.test(html) && /Document set partially ingested/i.test(html));
  } finally {
    await supabase.from("fa_intelligence_corpus").delete().eq("audit_id", id);
    await supabase.from("audits").delete().eq("id", id);
    console.log("evidence row cleaned up");
  }

  // ── S · single-doc regression (re-render, NOT re-run; 41a2baa0 off limits) ─
  // uuid columns reject `like` — find the 05b44783 fixture via its
  // solicitation family and prefix-match client-side.
  const { data: r0081 } = await supabase.from("audits").select("id").eq("solicitation_number", "SPRTA1-26-R-0081");
  const singleId = (r0081 ?? []).map((r) => r.id as string).find((i) => i.startsWith("05b44783"));
  const { data: single } = singleId
    ? await supabase.from("audits").select("*").eq("id", singleId).single()
    : { data: null };
  check("S0 single-doc fixture 05b44783 loaded", !!single, "row not found");
  const svm = buildViewModel(single);
  check("S1 no ingestion flag on single-doc audit", svm.ingestion_incomplete === false && svm.ingestion_note === "");
  const shtml = renderAuditReportComplete(template, svm, single);
  check("S2 no ingestion banner in single-doc render", !/data-ingestion-incomplete/.test(shtml));

  console.log(failures === 0 ? "\nFA-136 gate: ALL PASS" : `\nFA-136 gate: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("FA-136 gate crashed:", e.message); process.exit(2); });
