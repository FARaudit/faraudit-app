// $0 — pull the completed verdict for the T1 live run. Client-side prefix match (NO .like on uuid). Read-only.
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await admin.from("audits").select("id, status, agentic_status, created_at, compliance_json").order("created_at", { ascending: false }).limit(30);
  const a = (data || []).find((r: any) => typeof r.id === "string" && r.id.startsWith("a7727dfc"));
  if (!a) { console.log("a7727dfc not in newest 30"); process.exit(1); }
  const cj = a.compliance_json || {};
  const v = cj.verdict || {};
  console.log(`=== T1 SPRRA2-26-R-0034 · audit ${a.id.slice(0,8)} ===`);
  console.log(`status=${a.status} agentic=${a.agentic_status ?? "-"} created=${a.created_at}`);
  console.log(`\nVERDICT pole=${v.pole ?? "?"} band=${v.band ?? "?"} tone=${v.tone ?? "?"} noVerdict=${v.noVerdict ?? "?"}`);
  console.log(`recommendation=${cj.recommendation ?? "?"} · fit_score=${cj.fit_score ?? "?"} · compliance_score=${cj.compliance_score ?? "?"}`);
  const ss = cj.show_stoppers || cj.showStoppers || [];
  console.log(`\nshow_stoppers (${ss.length}):`);
  for (const s of ss.slice(0, 6)) console.log(`  • ${JSON.stringify(s).slice(0, 260)}`);
  // top-level keys for orientation
  console.log(`\ncompliance_json keys: ${Object.keys(cj).join(", ")}`);
  if (v.rationale) console.log(`\nrationale: ${String(v.rationale).slice(0, 500)}`);
  if (cj.headline) console.log(`headline: ${String(cj.headline).slice(0, 300)}`);
})().catch((e) => { console.error("THREW:", e instanceof Error ? e.message : e); process.exit(2); });
