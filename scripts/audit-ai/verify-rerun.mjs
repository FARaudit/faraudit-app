// Verify FA-196 scorecard for a given audit_id.
// Usage: node scripts/audit-ai/verify-rerun.mjs <audit_id>
// Checks: model_used · 0 SDVOSB in v2_shadow · gate_conditions populated · set-aside · PoP.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const id = process.argv[2];
if (!id) { console.error("usage: verify-rerun.mjs <audit_id>"); process.exit(1); }

const { data: a, error } = await admin.from("audits")
  .select("id,solicitation_number,notice_id,status,recommendation,model_used,model_version,period_of_performance,set_aside,set_aside_type,compliance_json,created_at,completed_at")
  .eq("id", id).maybeSingle();
if (error || !a) { console.error("not found:", error?.message); process.exit(1); }

const cj = a.compliance_json || {};
const v2 = cj.v2_shadow || null;
const v2str = v2 ? JSON.stringify(v2) : "";
const sdvosbCount = (v2str.match(/SDVOSB|service-disabled/gi) || []).length;
const gates = cj.gate_conditions || [];
const mb = v2?.surfaces?.metadata_brief || {};

console.log("================ AUDIT", id, "================");
console.log("sol:", a.solicitation_number, "| notice:", a.notice_id);
console.log("status:", a.status, "| recommendation:", a.recommendation);
console.log("created:", a.created_at, "| completed:", a.completed_at);
console.log("---- SCORECARD ----");
console.log("1) model_used:", a.model_used, "| model_version:", a.model_version);
console.log("2) SDVOSB occurrences in v2_shadow:", sdvosbCount, sdvosbCount === 0 ? "✅" : "❌ (expected 0)");
console.log("3) gate_conditions count:", gates.length, gates.length > 0 ? "✅" : "❌ (expected >0)");
if (gates.length) for (const g of gates) console.log("     · gate:", g.title || g.gate_label, "|", (g.context||g.blocker_note||"").slice(0,90));
console.log("4) PoP (period_of_performance):", a.period_of_performance || "(null)");
console.log("---- set-aside ----");
console.log("audits.set_aside:", a.set_aside, "| set_aside_type:", a.set_aside_type);
console.log("metadata_brief.set_aside:", mb.set_aside, "| eligibility.set_aside_type:", mb.eligibility?.set_aside_type);
console.log("---- v2_shadow present? ----", v2 ? `yes · path=${v2.path} · engine_ms=${v2.engine_ms}` : "NO (degraded)");
if (cj.v2_error) console.log("v2_error:", String(cj.v2_error).slice(0,200));
if (cj.v2_skipped) console.log("v2_skipped:", JSON.stringify(cj.v2_skipped).slice(0,200));
