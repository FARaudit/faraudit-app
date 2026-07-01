// $0 NEGATIVE-TEST SUITE for the HARDENED gold integrity verifier (Brain card 190). Proves each failure class
// FIRES. Builds throwaway fixtures in a fresh temp dir per case — NEVER touches the real scripts/audit-ai/gold-sets/.
// Run: npx tsx src/lib/gold-integrity-verifier.test.ts
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { runGoldIntegrity } from "../../scripts/audit-ai/verify-gold-integrity";
import { keySha256 } from "../../scripts/audit-ai/judgment-score";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const has = (rows: ReturnType<typeof runGoldIntegrity>, cls: string) => rows.some((r) => r.status === "FAIL" && r.cls === cls);
const anyFail = (rows: ReturnType<typeof runGoldIntegrity>) => rows.some((r) => r.status === "FAIL");

// Build a HEALTHY fixture (valid keySha256 via the REAL stamper + matching source) then apply a mutator.
function fixture(mutate: (dir: string, key: Record<string, unknown>, reg: Record<string, unknown>) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), "gold-integ-"));
  try {
    const srcText = "SYNTHETIC SOURCE OF RECORD — TESTSOL\nbinding clause X.\n";
    writeFileSync(path.join(dir, "TESTSOL-FULL-SOURCE.txt"), srcText);
    const key: Record<string, unknown> = {
      schemaVersion: "test", packageId: "TESTSOL", key_type: "full_verdict", bidderProfile: null,
      acquisitionPart: "PART_12", expectedVerdict: { verdict: "BID", eligible: true, maxShowStoppers: 0 },
      namedGates: [], showStoppers: [], cautionItems: [], decoys: [], authored_against: "TESTSOL-FULL-SOURCE.txt",
    };
    const ksha = keySha256(key as never); // keySha256 strips adjudication → stable before/after stamping
    key.adjudication = { frozenAt: "test", keySha256: ksha, sourceSha256: sha(srcText) };
    const reg: Record<string, unknown> = { keys: { TESTSOL: { file: "TESTSOL.frozen.json", key_type: "full_verdict", active_version: "v1" } } };
    mutate(dir, key, reg); // mutate BEFORE writing so the mutation is what's on disk
    writeFileSync(path.join(dir, "TESTSOL.frozen.json"), JSON.stringify(key, null, 2));
    writeFileSync(path.join(dir, "gold-set-registry.json"), JSON.stringify(reg, null, 2));
    return runGoldIntegrity(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("── 0 · HEALTHY fixture → all PASS, zero FAIL ──");
{
  const rows = fixture(() => {});
  assert(!anyFail(rows), "healthy fixture has no FAIL rows");
  assert(rows.some((r) => r.cls === "KEY_OK") && rows.some((r) => r.cls === "SOURCE_OK"), "healthy fixture emits KEY_OK + SOURCE_OK");
}

console.log("── 1 · S1: stamp field deleted → MISSING_STAMP ──");
{
  const rows = fixture((_d, key) => { delete (key.adjudication as Record<string, unknown>).keySha256; });
  assert(has(rows, "MISSING_STAMP"), "deleting adjudication.keySha256 on an active full_verdict key → MISSING_STAMP FAIL");
}

console.log("── 1b · S1: source hash declaration deleted → MISSING_SOURCE_DECL ──");
{
  const rows = fixture((_d, key) => { delete (key.adjudication as Record<string, unknown>).sourceSha256; });
  assert(has(rows, "MISSING_SOURCE_DECL"), "deleting the source hash on an active full_verdict key → MISSING_SOURCE_DECL FAIL");
}

console.log("── 2 · S2: declared source drifts while a hash-matching DECOY sibling exists → SOURCE_DRIFT (not masked) ──");
{
  const rows = fixture((dir, key) => {
    const orig = readFileSync(path.join(dir, "TESTSOL-FULL-SOURCE.txt"), "utf8");
    // the DECLARED source (authored_against = .txt) drifts:
    writeFileSync(path.join(dir, "TESTSOL-FULL-SOURCE.txt"), orig + "TAMPERED\n");
    // a sibling under the goldSourcePath convention still carries the ORIGINAL (declared-matching) bytes — the decoy:
    writeFileSync(path.join(dir, "TESTSOL-FULL-SOURCE.complete.txt"), orig);
    void key;
  });
  assert(has(rows, "SOURCE_DRIFT"), "pinned to authored_against → drifted declared source FAILs SOURCE_DRIFT despite a matching decoy sibling");
  assert(!rows.some((r) => r.status === "PASS" && r.cls === "SOURCE_OK"), "the decoy sibling is NEVER bound (no false SOURCE_OK)");
}

console.log("── 3 · S1: supersedes retired_sha256 removed → MISSING_RETIRED_HASH ──");
{
  const rows = fixture((dir, key, reg) => {
    // add a retired file + a supersedes entry WITHOUT retired_sha256
    writeFileSync(path.join(dir, "TESTSOL.frozen.v0.json"), "{}\n");
    (reg.keys as Record<string, { supersedes?: unknown }>).TESTSOL.supersedes = [{ file: "TESTSOL.frozen.v0.json", key_type: "full_verdict", status: "retired" }];
    void key;
  });
  assert(has(rows, "MISSING_RETIRED_HASH"), "supersedes entry missing retired_sha256 → MISSING_RETIRED_HASH FAIL");
}

console.log("── 3b · retired file drifts → RETIRED_DRIFT ──");
{
  const rows = fixture((dir, key, reg) => {
    writeFileSync(path.join(dir, "TESTSOL.frozen.v0.json"), "ORIGINAL RETIRED BYTES\n");
    (reg.keys as Record<string, { supersedes?: unknown }>).TESTSOL.supersedes = [{ file: "TESTSOL.frozen.v0.json", retired_sha256: sha("DIFFERENT BYTES\n") }];
    void key;
  });
  assert(has(rows, "RETIRED_DRIFT"), "retired file bytes != recorded retired_sha256 → RETIRED_DRIFT FAIL");
}

console.log("── 4 · S4: path-escape in a declared reference → PATH_ESCAPE ──");
{
  const rows = fixture((_d, key) => { key.authored_against = "../../../../../../etc/passwd"; });
  assert(has(rows, "PATH_ESCAPE"), "authored_against escaping gold-sets/ → PATH_ESCAPE FAIL (no read outside the dir)");
}

console.log("── 5 · oos_detection key with no keySha is a legitimate SKIP (derived from registry key_type), not a FAIL ──");
{
  const rows = fixture((dir, key, reg) => {
    delete (key.adjudication as Record<string, unknown>).keySha256; // oos has no scoreJudgment keySha
    (reg.keys as Record<string, { key_type: string }>).TESTSOL.key_type = "oos_detection";
  });
  assert(rows.some((r) => r.status === "SKIP" && r.cls === "OOS_NO_KEYSHA"), "oos_detection missing keySha → SKIP OOS_NO_KEYSHA");
  assert(!has(rows, "MISSING_STAMP"), "oos_detection missing keySha does NOT trigger MISSING_STAMP (skip is type-derived, not a bypass)");
}

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`} — hardened gold-integrity verifier negative suite.`);
process.exit(failures === 0 ? 0 : 1);
