// $0 — pull T1 verdict via the FULL audit_id from the pending row (exact eq, no uuid .like, no slice). Read-only.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: pend } = await admin.from("pending_audits").select("audit_id, status, processed_at").eq("solicitation_number", "SPRRA2-26-R-0034").order("created_at", { ascending: false }).limit(1);
  const auditId = pend?.[0]?.audit_id;
  console.log(`pending newest: audit_id=${auditId} status=${pend?.[0]?.status}`);
  if (!auditId) { console.log("no audit_id"); process.exit(1); }
  const { data: a, error } = await admin.from("audits").select("id, status, agentic_status, created_at, compliance_json").eq("id", auditId).single();
  if (error || !a) { console.log(`audits fetch err: ${error?.message}`); process.exit(1); }
  const cj = a.compliance_json || {};
  const v = cj.verdict || {};
  console.log(`\n=== T1 SPRRA2-26-R-0034 · audit ${a.id.slice(0,8)} ===`);
  console.log(`status=${a.status} agentic=${a.agentic_status ?? "-"} created=${a.created_at}`);
  console.log(`\nVERDICT pole=${v.pole ?? "?"} band=${v.band ?? "?"} tone=${v.tone ?? "?"} noVerdict=${v.noVerdict ?? "?"}`);
  console.log(`recommendation=${cj.recommendation ?? "?"} · fit_score=${cj.fit_score ?? "?"}`);
  const ss = cj.show_stoppers || cj.showStoppers || [];
  console.log(`\nshow_stoppers (${ss.length}):`);
  for (const s of ss.slice(0, 6)) console.log(`  • ${JSON.stringify(s).slice(0, 280)}`);
  console.log(`\ncompliance_json keys: ${Object.keys(cj).join(", ")}`);
  if (v.rationale) console.log(`\nrationale: ${String(v.rationale).slice(0, 600)}`);
})().catch((e) => { console.error("THREW:", e instanceof Error ? e.message : e); process.exit(2); });
