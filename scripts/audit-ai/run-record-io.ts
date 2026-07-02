// fs I/O for paid-run records (Brain card 197 Part 2). SEPARATE from the pure lib (src/lib/audit-run-record.ts)
// so the lib stays fs-free. Records live in a GITIGNORE-SAFE dir — `fullSource` carries the real solicitation
// text, so records must never be committed. Consistent with the other local run artifacts under scripts/audit-ai/.
import fs from "fs";
import path from "path";
import type { RunRecord } from "../../src/lib/audit-run-record";

export const RUN_RECORDS_DIR = "scripts/audit-ai/run-records";

/** Write a run record to the gitignored records dir. Returns the file path. Creates the dir if absent. */
export function persistRunRecord(rec: RunRecord, dir: string = RUN_RECORDS_DIR): string {
  fs.mkdirSync(dir, { recursive: true });
  const safe = (rec.meta.sol ?? rec.meta.runId).replace(/[^A-Za-z0-9._-]/g, "_");
  const stamp = rec.meta.startedAt.replace(/[:.]/g, "-");
  const file = path.join(dir, `${safe}.${stamp}.run-record.json`);
  fs.writeFileSync(file, JSON.stringify(rec, null, 2));
  return file;
}

/** Load a run record from disk (validates the schema tag). */
export function loadRunRecord(file: string): RunRecord {
  const rec = JSON.parse(fs.readFileSync(file, "utf8")) as RunRecord;
  if (rec.schema !== "run-record/v1") throw new Error(`not a run-record/v1 file: ${file} (schema=${rec.schema})`);
  return rec;
}

/** Newest run record in the dir (by mtime), or null when the dir is empty/absent. */
export function latestRunRecord(dir: string = RUN_RECORDS_DIR): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".run-record.json")).map((f) => path.join(dir, f));
  if (!files.length) return null;
  return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}
