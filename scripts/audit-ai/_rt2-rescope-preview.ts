import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import { createClient } from "@supabase/supabase-js";
(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: row } = await admin.from("audits").select("compliance_json").eq("id", "95698f91-ddeb-4ed2-b5c4-eda18495219a").single();
  const findings = (row as any).compliance_json.v3.findings as Array<Record<string, unknown>>;
  const { applyNonPresenceHonesty } = await import("../../src/lib/audit-nonpresence-honesty");
  const withIds = findings.map((f, i) => ({ ...f, id: `f#${i}` }));
  const { rewrites } = applyNonPresenceHonesty(withIds as never);
  console.log(`REWRITES: ${rewrites.length} of ${findings.length} findings\n`);
  for (const r of rewrites) {
    console.log(`── ${r.id}  [${r.shape}]`);
    console.log(`   BEFORE: ${r.before.slice(0, 260).replace(/\s+/g, " ")}`);
    console.log(`   AFTER : ${r.after.slice(0, 320).replace(/\s+/g, " ")}`);
    console.log("");
  }
})();
