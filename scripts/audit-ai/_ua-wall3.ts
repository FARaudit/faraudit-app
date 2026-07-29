// U-A verification · live-wall composition — last 120 audits, verdict + reason from compliance_json.v3.
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const { data, error } = await sb.from("audits").select("id, created_at, compliance_json").order("created_at", { ascending: false }).limit(120);
  if (error) { console.error(error.message); process.exit(1); }
  const rows = (data ?? []) as Array<{ id: string; created_at: string; compliance_json: { v3?: { verdict?: string; reason?: string } } }>;
  const withV3 = rows.filter((r) => r.compliance_json?.v3?.verdict);
  console.log(`rows: ${rows.length} · with v3 verdict: ${withV3.length}`);
  const counts: Record<string, number> = {};
  const drivers: Record<string, string[]> = {};
  for (const r of withV3) {
    const v = r.compliance_json.v3!.verdict!;
    const reason = r.compliance_json.v3!.reason ?? "";
    counts[v] = (counts[v] ?? 0) + 1;
    if (v !== "NEEDS_HUMAN_REVIEW") continue;
    let d = "other";
    if (/could not be grounded/i.test(reason)) d = "coverage-cap (U-A target)";
    else if (/sole[-\s]?source/i.test(reason)) d = "sole-source conditional";
    else if (/Adversarial verification/i.test(reason)) d = "verifier-unsound";
    else if (/missing required typing/i.test(reason)) d = "untyped-bar";
    else if (/eligibility|ELIGIBILITY|site visit|clearance/i.test(reason)) d = "eligibility";
    else if (/set-aside/i.test(reason)) d = "set-aside";
    else if (/CONDITIONAL NO-BID|Non-curable/i.test(reason)) d = "non-curable conditional";
    (drivers[d] ??= []).push(`${r.id.slice(0, 8)}:${reason.slice(0, 60)}`);
  }
  console.log("verdicts:", JSON.stringify(counts));
  console.log("\nNHR drivers:");
  for (const [d, ids] of Object.entries(drivers).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(ids.length).padStart(3)}  ${d}`);
    for (const s of ids.slice(0, 4)) console.log(`        ${s}`);
  }
})();
