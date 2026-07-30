// _ub-ledger-samples.ts — name the items AUDIT_CONSEQUENCE_CAPTURE would escalate (released under A, gone under B).
import * as fs from "node:fs";
import * as path from "node:path";
import { loadRunRecord } from "./run-record-io";
import { replayCoverageStage } from "../../src/lib/audit-run-record";

const COHORT = "scripts/audit-ai/run-records/_ua-cohort";
const envFile = process.env.FLAGS_ENV_FILE!;
for (const k of Object.keys(process.env)) if (k.startsWith("AUDIT_")) delete process.env[k];
for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
  const m = line.match(/^(AUDIT_[A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const targets = ["36C25626Q1137__150c3ab3", "697DCK-26-R-00186__9ce4e3fb", "FA303026Q0020__e83887af", "FA813726R0033__bd605b88"];
for (const t of targets) {
  const f = fs.readdirSync(COHORT).find((x) => x.startsWith(t.split("__")[0]) && x.includes(t.split("__")[1]));
  if (!f) { console.log(`${t}: not found`); continue; }
  const rec = loadRunRecord(path.join(COHORT, f));
  process.env.AUDIT_RELEASE_LEDGER = "true";
  delete process.env.AUDIT_CONSEQUENCE_CAPTURE;
  const a = ((replayCoverageStage(rec).coverageV2 as any).releasedBoilerplate ?? []) as Array<{ section: string; obligation: string }>;
  process.env.AUDIT_CONSEQUENCE_CAPTURE = "true";
  const b = ((replayCoverageStage(rec).coverageV2 as any).releasedBoilerplate ?? []) as Array<{ section: string; obligation: string }>;
  delete process.env.AUDIT_CONSEQUENCE_CAPTURE;
  const bSet = new Set(b.map((x) => x.section + "|" + x.obligation));
  const esc = a.filter((x) => !bSet.has(x.section + "|" + x.obligation));
  console.log(`\n── ${f.replace(".json", "")} — ${esc.length} escalated:`);
  for (const e of esc) console.log(`  §${e.section} · ${e.obligation.slice(0, 150)}`);
}
