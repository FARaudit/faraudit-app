// Render an audit report to HTML locally (mirrors route.ts) for FA-195
// verification without the auth wall. Run: npx tsx scripts/audit-ai/render-audit.ts <audit_id>
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as dotenv from "dotenv";
import { buildViewModel } from "../../src/app/audit/[id]/_view-model";
import { renderAuditReportComplete } from "../../src/app/audit/[id]/_render";

dotenv.config({ path: ".env.local", quiet: true });

async function main() {
  const id = process.argv[2];
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const { data: audit, error } = await admin.from("audits").select("*").eq("id", id).maybeSingle();
  if (error || !audit) { console.error("audit not found:", error?.message); process.exit(1); }

  const vm = buildViewModel(audit as never, { isWatching: false, hasCapabilityStatement: true });
  const templatePath = join(process.cwd(), "src", "app", "audit", "[id]", "_template.html");
  const template = readFileSync(templatePath, "utf8");
  const html = renderAuditReportComplete(template, vm as never, audit as Record<string, unknown>);
  const out = `/tmp/audit-${id}.html`;
  writeFileSync(out, html, "utf8");
  const v = vm as unknown as Record<string, unknown>;
  console.log("rendered →", out, "·", html.length, "bytes");
  console.log("vm.set_aside:", v.set_aside);
  console.log("vm.contract_type:", v.contract_type);
  console.log("vm.is_metadata_only:", v.is_metadata_only);
  console.log("vm.period_of_performance:", String(v.period_of_performance).slice(0, 110));
}
main().catch((e) => { console.error(e); process.exit(1); });
