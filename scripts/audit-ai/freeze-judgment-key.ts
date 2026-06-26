// FREEZE + HASH a BLIND-authored judgment key (Brain handoff). Code does NOT author entries — this tool
// ONLY stamps the adjudication block (authoredBlind, frozenAt, sourceSha256, keySha256) over a key file
// AUTHORED BY CEO+BRAIN, and writes the frozen copy. Run:
//   npx tsx scripts/audit-ai/freeze-judgment-key.ts --key <authored.json> --source <raw-source-file> [--out <path>] [--frozenAt <ISO>]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { keySha256, sha256, type JudgmentKey } from "./judgment-score";

const arg = (k: string): string | undefined => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const keyPath = arg("--key");
const srcPath = arg("--source");
if (!keyPath || !existsSync(keyPath)) { console.error(`❌ --key <authored judgment key json> required (Brain's blind-authored file). Got: ${keyPath ?? "(none)"}`); process.exit(2); }
if (!srcPath || !existsSync(srcPath)) { console.error(`❌ --source <raw source file the key was authored from> required for sourceSha256. Got: ${srcPath ?? "(none)"}`); process.exit(2); }

const key = JSON.parse(readFileSync(keyPath, "utf8")) as JudgmentKey;
// Minimal structural sanity (NOT authoring — we do not add/alter entries, only refuse a malformed file).
for (const f of ["packageId", "acquisitionPart", "expectedVerdict", "namedGates", "showStoppers", "decoys"] as const) {
  if (!(f in key)) { console.error(`❌ key missing required field '${f}' — Brain's file does not conform to schema 0.2-approved`); process.exit(2); }
}
if (!("bidderProfile" in key)) { console.error("❌ key missing required top-level 'bidderProfile' (amendment 1)"); process.exit(2); }

const sourceSha256 = sha256(readFileSync(srcPath, "utf8"));
const ksha = keySha256(key); // over ENTRIES only (adjudication block excluded)
const frozenAt = arg("--frozenAt") ?? new Date().toISOString();
key.adjudication = {
  ...(key.adjudication ?? {}),
  authoredBlind: true,
  adjudicatedBy: key.adjudication?.adjudicatedBy ?? ["CEO", "Brain"],
  frozenAt,
  sourceSha256,
  keySha256: ksha,
};
const out = arg("--out") ?? path.join("scripts", "audit-ai", "gold-sets", `${key.packageId}.judgment.frozen.json`);
writeFileSync(out, JSON.stringify(key, null, 2) + "\n");

console.log("════ JUDGMENT KEY FROZEN (Code stamped provenance only — did NOT author entries) ════");
console.log(`packageId        : ${key.packageId}`);
console.log(`entries          : ${key.namedGates.length} gates · ${key.showStoppers.length} show-stoppers · ${key.decoys.length} decoys`);
console.log(`bidderProfile    : ${key.bidderProfile === null ? "null" : "present"}`);
console.log(`acquisitionPart  : ${key.acquisitionPart}`);
console.log(`frozenAt         : ${frozenAt}`);
console.log(`sourceSha256     : ${sourceSha256.slice(0, 12)}… (len ${sourceSha256.length}) — status-only`);
console.log(`keySha256        : ${ksha.slice(0, 12)}… (len ${ksha.length}) — status-only, recomputed at scoring; mismatch ⇒ INVALID run`);
console.log(`frozen key path  : ${out}`);
