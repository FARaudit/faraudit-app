import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
  const { data, error } = await sb.from("audits").select("id, created_at, compliance_json").order("created_at", { ascending: false }).limit(120);
  if (error) { console.error(error.message); process.exit(1); }
  const rows = (data ?? []) as Array<{ id: string; created_at: string; compliance_json: Record<string, unknown> }>;
  const buckets: Record<string, string[]> = {};
  for (const r of rows) {
    const cj = r.compliance_json ?? {};
    const v = (cj.verdict ?? cj.decision ?? "NONE") as string;
    const reason = String(cj.verdict_reason ?? cj.reason ?? (cj.decisionRecord as Record<string, unknown> | undefined)?.reason ?? "");
    let driver = "other";
    if (/could not be grounded/i.test(reason)) driver = "coverage-cap";
    else if (/sole[-\s]?source/i.test(reason)) driver = "sole-source";
    else if (/Adversarial verification/i.test(reason)) driver = "verifier-unsound";
    else if (/missing required typing/i.test(reason)) driver = "untyped-bar";
    else if (/not complete|could not be confirmed read/i.test(reason)) driver = "docs-incomplete";
    else if (/ELIGIBILITY|eligibility/i.test(reason)) driver = "eligibility";
    else if (/set-aside conflict/i.test(reason)) driver = "setaside-conflict";
    const key = `${v} · ${driver}`;
    (buckets[key] ??= []).push(String(r.id).slice(0, 8));
  }
  for (const [k, ids] of Object.entries(buckets).sort((a, b) => b[1].length - a[1].length))
    console.log(String(ids.length).padStart(3), k, ids.length <= 6 ? ` [${ids.join(",")}]` : "");
})();
