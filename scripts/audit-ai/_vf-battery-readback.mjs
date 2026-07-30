// VEHICLE-F post-run FULL BATTERY readback — audit 496a9a21 (FA813726R0033 live fire under armed vehicle-F flags).
// Pulls: audits row · run-record (Storage, meta.flagEnv = per-flag table) · usage_events (exact cost).
// Verifies: two-tier eligibility target · true-cause narrative · noVerdictCause=eligibility · no conflict language ·
// raw_pdf_text persisted + BOA/site-visit grounding · pole=NHR. Emits a JSON verdict block for the card.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ID = "496a9a21-8391-41b4-9e24-cff212971fd3";
const SOL = "FA813726R0033";

const { data: a, error } = await admin.from("audits").select("*").eq("id", ID).single();
if (error) { console.error("audits err:", error.message); process.exit(1); }

console.log("═══════════ a. INTEGRITY ═══════════");
console.log("status:", a.status, "| stage:", a.current_stage, "| model:", a.model_used, "| processing_ms:", a.processing_time_ms);
console.log("completed_at:", a.completed_at, "| quality_flag:", a.quality_flag, "| quality_score:", a.quality_score);
const rpt = a.raw_pdf_text || "";
console.log("raw_pdf_text:", rpt ? `PERSISTED (${rpt.length} chars)` : "❌ NULL — INFRA-A persistence FAILED");
// provenance grounding: the two eligibility bars must be present in the source text
const boaInSrc = /BOA|Basic Ordering Agreement/i.test(rpt);
const siteInSrc = /site visit/i.test(rpt);
console.log("  grounding — 'BOA/Basic Ordering Agreement' in raw_pdf_text:", boaInSrc);
console.log("  grounding — 'site visit' in raw_pdf_text:", siteInSrc);
const cj = a.compliance_json || {};
console.log("compliance_json.engine:", cj.engine, "| finding_provenance present:", !!cj.finding_provenance);

console.log("\n═══════════ verdict / pole ═══════════");
const br = a.bid_recommendation || "";
console.log("bid_recommendation (full):\n  " + br.replace(/\n/g, "\n  "));

// usage_events — exact cost
const { data: ue } = await admin.from("usage_events").select("*").eq("audit_id", ID).maybeSingle();
console.log("\n═══════════ COST ═══════════");
if (ue) console.log(`verdict=${ue.verdict} · billable=${ue.billable} · honest_fail=${ue.honest_fail} · cost_usd=$${Number(ue.cost_usd).toFixed(4)} · src=${ue.cost_source} · in=${ue.input_tokens} out=${ue.output_tokens} cache_r=${ue.cache_read_tokens}`);
else console.log("no usage_events row yet");

// run-record from Storage → meta.flagEnv (per-flag table) + coverageV2 + noVerdictCause
console.log("\n═══════════ b. PER-FLAG (run-record meta.flagEnv) ═══════════");
const { data: blob, error: dlErr } = await admin.storage.from("run-records").download(`${SOL}/${ID}.json`);
let rr = null;
if (dlErr || !blob) { console.log("run-record not in Storage yet:", dlErr?.message); }
else {
  rr = JSON.parse(await blob.text());
  const fe = rr.meta?.flagEnv || {};
  const VF = ["AUDIT_NHR_NARRATIVE_TRUE_CAUSE","AUDIT_ELIG_OPERATIVE_EXCERPT","AUDIT_SITEVISIT_CONCLUDED_NOTICEWIDE","AUDIT_VERDICT_POLE_PRECEDENCE","AUDIT_COVERAGE_COUNTER_SPLIT","AUDIT_CYBER_RFI_RECONCILE"];
  for (const f of VF) console.log(`  ${f} = ${fe[f] ?? "<absent>"}`);
  console.log("  DO-NOT-ARM in run-env: AUDIT_VETO_NARROW_UNIVERSAL=" + (fe.AUDIT_VETO_NARROW_UNIVERSAL ?? "<absent>") + " · AUDIT_RETIRE_VERBATIM_VETO=" + (fe.AUDIT_RETIRE_VERBATIM_VETO ?? "<absent>"));
  const res = rr.result || {};
  console.log("\n  run-record verdict:", res.verdict, "| eligible:", res.eligible, "| noVerdictCause:", res.noVerdictCause ?? "(absent)");
  const cov2 = res.inputs?.coverageV2 || res.coverageV2 || {};
  console.log("  coverageV2 buckets:", JSON.stringify(Object.fromEntries(Object.entries(cov2).map(([k,v])=>[k,Array.isArray(v)?v.length:v]))).slice(0,300));
  const ss = res.showStoppers || res.inputs?.showStoppers || [];
  console.log("  showStoppers (" + ss.length + "):");
  for (const s of ss.slice(0,8)) console.log("    - [" + (s.citation||s.kind||"?") + "] " + String(s.obligation||s.text||s.reason||"").slice(0,130));
}

console.log("\n═══════════ c. TWO-TIER TARGET VERIFICATION ═══════════");
const boaBar = /BOA|Basic Ordering Agreement/i.test(br);
const siteBar = /site visit/i.test(br);
const conflictLang = /\bconflict|contradict|inconsistent|discrepan/i.test(br);
const eligLead = /eligib/i.test(br.slice(0, 140));
const noVC = rr?.result?.noVerdictCause;
console.log("  tier-1 headline LEADS with eligibility:", eligLead ? "✅" : "❌");
console.log("  BOA bar present in headline/reco:", boaBar ? "✅" : "❌");
console.log("  concluded site-visit bar surfaced:", siteBar ? "✅ (tier check)" : "⚠ not in reco head — check showStoppers");
console.log("  noVerdictCause == 'eligibility':", noVC === "eligibility" ? "✅" : `⚠ got '${noVC ?? "absent"}'`);
console.log("  ZERO conflict language (cause=eligibility):", conflictLang ? "❌ CONFLICT WORD PRESENT" : "✅ none");

console.log("\n═══════════ d/e. EXPECTED-STATE GATE ═══════════");
const pole = ue?.verdict || rr?.result?.verdict || "?";
const isNHR = pole === "NEEDS_HUMAN_REVIEW";
const isCommittal = ["BID","NO_BID","BID_WITH_CONDITIONS"].includes(pole);
const isFalseIncomplete = pole === "INCOMPLETE";
console.log("  verdict pole:", pole);
if (isNHR) console.log("  ✅ EXPECTED: conditional NHR");
else if (isCommittal) console.log("  ⛔ COMMITTAL — adjudicate before anything else (interrupt)");
else if (isFalseIncomplete) console.log("  ⛔ INCOMPLETE — regression toward the e63bd1e7 F; investigate");
else console.log("  ⚠ unexpected pole:", pole);
console.log("\nBATTERY_JSON=" + JSON.stringify({ status:a.status, pole, cost_usd: ue?.cost_usd ?? null, cost_source: ue?.cost_source ?? null, raw_pdf_text_chars: rpt.length, boaBar, siteBar, eligLead, noVC: noVC ?? null, conflictLang, processing_ms: a.processing_time_ms }));
