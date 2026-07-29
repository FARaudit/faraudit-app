// U-A cap-not-mute · step 0 — pull the two flip-and-hold target records ($0, read-only).
//   bb1d6997 (T2) — expected to FLIP to committal-with-caution under U-A
//   d0664ba2      — genuine-NHR control, expected to HOLD
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const PREFIXES = process.argv.slice(2).length ? process.argv.slice(2) : ["bb1d6997", "d0664ba2"];
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);

(async () => {
  const { data, error } = await sb.from("audits").select("id, solicitation_number, created_at").order("created_at", { ascending: false }).limit(400);
  if (error) { console.error("audits query:", error.message); process.exit(1); }
  const rows = (data ?? []) as Array<{ id: string; solicitation_number: string; verdict: string; created_at: string }>;
  if (!existsSync("scripts/audit-ai/run-records")) mkdirSync("scripts/audit-ai/run-records", { recursive: true });

  for (const prefix of PREFIXES) {
    const row = rows.find((r) => String(r.id).startsWith(prefix));
    if (!row) { console.log(`${prefix}: NOT FOUND in the ${rows.length} most recent audits`); continue; }
    const safeSol = (row.solicitation_number || "unknown").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
    const path = `${safeSol}/${row.id}.json`;
    const { data: blob, error: dlErr } = await sb.storage.from("run-records").download(path);
    if (dlErr || !blob) { console.log(`${prefix}: banked record MISSING at ${path} — ${dlErr?.message}`); continue; }
    const txt = await blob.text();
    const out = `scripts/audit-ai/run-records/_ua-${prefix}.json`;
    writeFileSync(out, txt);
    const rec = JSON.parse(txt);
    const res = rec.result ?? {};
    const cov2 = res.inputs?.coverageV2 ?? {};
    console.log(`${prefix}: sol=${row.solicitation_number} verdict=${res.verdict} → ${out} (${txt.length}B)`);
    console.log(`   reason: ${(res.reason || "").slice(0, 200)}`);
    console.log(`   disqualifierUncovered=${(cov2.disqualifierUncovered ?? []).length} unreadable=${(cov2.unreadable ?? []).length} boilerplate-ok=${(cov2.boilerplateUngrounded ?? []).length}`);
    for (const d of (cov2.disqualifierUncovered ?? []).slice(0, 8)) console.log(`     [${d.section}] ${(d.obligation || "").slice(0, 140)}`);
  }
})();
