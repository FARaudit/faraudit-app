// BLAST-RADIUS SWEEP — every served NHR audit that rendered the false "conflict" step while the flag was off.
// Under flag-OFF (served state 2026-07-14 → 2026-07-24), EVERY non-OOS NHR rendered "Two grounded findings
// conflict…" regardless of its true cause. Blast radius = agentic_v3 complete NHR rows whose true cause != conflict.
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key, { auth: { persistSession: false } });

(async () => {
  // Pull all agentic_v3 complete rows (paginate to be safe).
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("audits").select("id,user_id,created_at,solicitation_number,compliance_json")
      .eq("status", "complete").range(from, from + 999);
    if (error) { console.error("ERR", error.message); process.exit(1); }
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const v3 = rows.filter(r => (r.compliance_json?.engine) === "agentic_v3");
  // NHR / no-verdict poles (what the walkthrough treats as noVerdict, non-OOS).
  const NHR_VERDICTS = new Set(["NEEDS_HUMAN_REVIEW"]);
  const nhr = v3.filter(r => NHR_VERDICTS.has(r.compliance_json?.v3?.verdict));
  const nonOOS = nhr.filter(r => (r.compliance_json?.v3?.pole) !== "OUT_OF_SCOPE");

  // Blast radius = non-OOS NHR whose true cause != conflict (these got the FALSE conflict step).
  const byCause: Record<string, number> = {};
  const affected: any[] = [];
  for (const r of nonOOS) {
    const cause = String(r.compliance_json?.v3?.noVerdictCause ?? "«unset»");
    if (cause !== "conflict") { affected.push(r); byCause[cause] = (byCause[cause] || 0) + 1; }
  }

  console.log("=== POPULATION ===");
  console.log("agentic_v3 complete rows:", v3.length);
  console.log("  of which NHR (NEEDS_HUMAN_REVIEW):", nhr.length, "· non-OOS:", nonOOS.length);
  console.log("\n=== BLAST RADIUS (rendered FALSE conflict step, true cause != conflict) ===");
  console.log("affected records:", affected.length);
  console.log("by true cause:", JSON.stringify(byCause));

  // Ownership: real customer (non-null user_id) vs internal/sam-ingested (user_id null).
  const withUser = affected.filter(r => r.user_id != null);
  const nullUser = affected.filter(r => r.user_id == null);
  console.log("\n=== EXPOSURE ===");
  console.log("owned by a real user_id (potential customer view):", withUser.length);
  console.log("user_id NULL (sam-ingested / internal, no customer):", nullUser.length);
  if (withUser.length) {
    const users = [...new Set(withUser.map(r => r.user_id))];
    console.log("distinct owner user_ids:", users.length, "→", users.map(u => String(u).slice(0,8)).join(", "));
  }
  const dates = affected.map(r => r.created_at).filter(Boolean).sort();
  console.log("created_at range:", dates[0], "→", dates[dates.length-1]);
  console.log("(served-as-v5 window began 2026-07-14 when AUDIT_REPORT_V5=true; fabrication cleared 2026-07-24)");
})();
