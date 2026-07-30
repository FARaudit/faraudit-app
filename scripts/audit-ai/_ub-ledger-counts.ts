// _ub-ledger-counts.ts — $0 read: releasedBoilerplate ledger counts off the banked U-A cohort,
// replayed under the LIVE worker AUDIT_* flag env (snapshot passed via FLAGS_ENV_FILE), plus the
// AUDIT_CONSEQUENCE_CAPTURE delta (what the CEO's capture arm would escalate).
// Probe leg: with AUDIT_RELEASE_LEDGER deleted the field must be ABSENT — proves the read is live, not inert.
import * as fs from "node:fs";
import * as path from "node:path";
import { loadRunRecord } from "./run-record-io";
import { replayCoverageStage } from "../../src/lib/audit-run-record";

const COHORT = "scripts/audit-ai/run-records/_ua-cohort";
const envFile = process.env.FLAGS_ENV_FILE;
if (!envFile) { console.error("FLAGS_ENV_FILE required"); process.exit(1); }

// Apply the live worker flag env: clear all AUDIT_* first so local .env noise can't leak in.
for (const k of Object.keys(process.env)) if (k.startsWith("AUDIT_")) delete process.env[k];
for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
  const m = line.match(/^(AUDIT_[A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const files = fs.readdirSync(COHORT).filter((f) => f.endsWith(".json")).sort();
console.log(`cohort records: ${files.length} · flag env: ${Object.keys(process.env).filter((k) => k.startsWith("AUDIT_")).length} AUDIT_* keys (live worker snapshot)`);

// ── PROBE (fail-closed): first record, ledger flag DELETED ⇒ field must be ABSENT; restored ⇒ present.
{
  const rec = loadRunRecord(path.join(COHORT, files[0]));
  delete process.env.AUDIT_RELEASE_LEDGER;
  const off = replayCoverageStage(rec).coverageV2 as any;
  process.env.AUDIT_RELEASE_LEDGER = "true";
  const on = replayCoverageStage(rec).coverageV2 as any;
  const offAbsent = !("releasedBoilerplate" in off);
  const onPresent = Array.isArray(on.releasedBoilerplate);
  console.log(`probe: flag-OFF field absent=${offAbsent} · flag-ON field present=${onPresent}`);
  if (!offAbsent || !onPresent) { console.error("PROBE RED — instrument cannot see the ledger flag; counts below would be meaningless"); process.exit(1); }
}

let totReleased = 0, totEscalated = 0, recsWithReleases = 0, recsCaptureTouches = 0;
const rows: string[] = [];
for (const f of files) {
  const rec = loadRunRecord(path.join(COHORT, f));
  // A — as production is armed today: LEDGER on, CAPTURE unset.
  process.env.AUDIT_RELEASE_LEDGER = "true";
  delete process.env.AUDIT_CONSEQUENCE_CAPTURE;
  const a = replayCoverageStage(rec);
  const aRel = ((a.coverageV2 as any).releasedBoilerplate ?? []).length;
  const aDisq = a.disqualifierUncovered;
  // B — capture armed on top.
  process.env.AUDIT_CONSEQUENCE_CAPTURE = "true";
  const b = replayCoverageStage(rec);
  const bRel = ((b.coverageV2 as any).releasedBoilerplate ?? []).length;
  const bDisq = b.disqualifierUncovered;
  delete process.env.AUDIT_CONSEQUENCE_CAPTURE;
  const escalated = aRel - bRel;              // items capture moves released → disqualifierUncovered
  const disqDelta = bDisq - aDisq;            // must equal escalated unless something else moved
  totReleased += aRel; totEscalated += escalated;
  if (aRel > 0) recsWithReleases++;
  if (escalated > 0) recsCaptureTouches++;
  const label = f.replace(/__.*$/, "") + "·" + (f.match(/__([0-9a-f]{8})/)?.[1] ?? "?");
  rows.push(`${label.padEnd(28)} released=${String(aRel).padStart(3)}  captureEscalates=${String(escalated).padStart(2)}  disqUncov ${aDisq}→${bDisq}${disqDelta !== escalated ? "  ⚠ disqDelta≠escalated" : ""}  v=${rec.result.verdict}`);
}
console.log(rows.join("\n"));
console.log(`\nTOTALS · records=${files.length} · withReleases=${recsWithReleases} · released(items)=${totReleased} · capture-would-escalate=${totEscalated} (touching ${recsCaptureTouches} records)`);
