// $0 REPLAY CLI (Brain card 197 Part 2). Load a persisted paid-run record and re-run the deterministic
// stages (detectSections → buildManifest → completenessOf → deriveVerdict) with NO paid call, printing the
// per-section obligation grounding PASS/MISS detail + verdict reproduction. This is the tool that answers
// "WHICH section's obligations failed to ground?" on a divergence, without re-spending on the model.
//
//   npx tsx scripts/audit-ai/replay-run-record.ts [path-to-record.json]   (defaults to the newest record)
//
// The flag options mirror the run-env the record was captured under, so the replay is faithful.
import { replayRunRecord, formatReplayReport } from "../../src/lib/audit-run-record";
import { loadRunRecord, latestRunRecord } from "./run-record-io";

const arg = process.argv[2];
const file = arg ?? latestRunRecord();
if (!file) { console.error("no run record found — pass a path or run a paid audit first (scripts/audit-ai/run-records/ is empty)"); process.exit(2); }

const rec = loadRunRecord(file);
console.log(`loaded: ${file}\n`);
const r = replayRunRecord(rec, {
  sectionMDepth: rec.meta.flags.AUDIT_SECTION_M_DEPTH === "true",
  commercialHonestFail: rec.meta.flags.AUDIT_PROCUREMENT_TYPE_SECTIONS === "true",
});
console.log(formatReplayReport(rec, r));
process.exit(r.drift.length ? 1 : 0);
