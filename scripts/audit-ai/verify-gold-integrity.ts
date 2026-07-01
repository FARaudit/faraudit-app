// $0 REGISTRY-WIDE GOLD INTEGRITY VERIFIER (Brain card 188; HARDENED card 190). Successor to verify-nobid-key.ts.
//
// NATURE OF THIS CONTROL (Brain S3 ruling): this is a DRIFT CHECK — it proves each frozen artifact still
// hashes to the value stamped INTO it (recompute-vs-stamped) and each source-of-record still hashes to the
// key's stamped sourceSha256. It is NOT an authenticity/authorization control: the stamp lives in the same
// file as the content, so anyone who can re-stamp can forge a self-consistent key. It catches accidental
// in-place edits that forgot to re-stamp (the card 187/188 incident), not intentional tampering.
//
// HARDENING (card 190): S1 missing-stamp HARD-FAILS (not skip); S2/#3/#7 source resolved EXCLUSIVELY from the
// key's declared source (authored_against, else the canonical goldSourcePath) — no sibling/glob fallback; S4
// every resolved path is contained to gold-sets/ (PATH_ESCAPE); #4 supersedes verified for ALL sections; #6
// each file hashed exactly once and the compared hash IS the printed hash.
//
// Run: npm run verify:gold-integrity
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { keySha256, type JudgmentKey } from "./judgment-score";
import { GOLD_DIR, goldSourcePath } from "./gold-key-resolver";

export type IntegrityRow = { status: "PASS" | "FAIL" | "SKIP"; cls: string; label: string; detail: string };
type AnyKey = JudgmentKey & Record<string, unknown> & { adjudication?: { keySha256?: string; sourceSha256?: string }; source_sha256?: string; authored_against?: string };
type ActiveEntry = { file: string; key_type?: string; source_file?: string; supersedes?: unknown };

const PREFIX = "scripts/audit-ai/gold-sets/";

/** Resolve a declared file reference against goldDir and CONTAIN it to goldDir (S4). authored_against is stored
 *  with the gold-sets/ prefix; strip it so the same helper handles bare filenames and prefixed paths. */
function safeResolve(goldDir: string, ref: string): { path?: string; escape?: boolean } {
  const stripped = ref.startsWith(PREFIX) ? ref.slice(PREFIX.length) : ref;
  const abs = path.resolve(goldDir, stripped);
  const root = path.resolve(goldDir);
  if (abs !== root && !abs.startsWith(root + path.sep)) return { escape: true };
  return { path: abs };
}

/** Pure, deterministic. Returns one row per check. goldDir is injectable so the negative-test suite can run
 *  against temp fixtures without touching the real gold-sets/. */
export function runGoldIntegrity(goldDir: string = GOLD_DIR): IntegrityRow[] {
  const rows: IntegrityRow[] = [];
  const shaCache = new Map<string, string>();
  const fileSha = (abs: string) => { let v = shaCache.get(abs); if (v === undefined) { v = createHash("sha256").update(readFileSync(abs)).digest("hex"); shaCache.set(abs, v); } return v; };
  const push = (status: IntegrityRow["status"], cls: string, label: string, detail: string) => rows.push({ status, cls, label, detail });

  const checkActive = (name: string, e: ActiveEntry) => {
    const kr = safeResolve(goldDir, e.file);
    if (kr.escape) return push("FAIL", "PATH_ESCAPE", `${name} :: key file`, e.file);
    if (!existsSync(kr.path!)) return push("FAIL", "KEY_FILE_MISSING", `${name} :: key file`, e.file);
    const k = JSON.parse(readFileSync(kr.path!, "utf8")) as AnyKey;
    const isOos = e.key_type === "oos_detection";

    // ── keySha256 (S1: full_verdict MUST be stamped; oos skip is derived ONLY from registry key_type) ──
    const stampedKey = k.adjudication?.keySha256;
    if (isOos) push("SKIP", "OOS_NO_KEYSHA", `${name} :: keySha256`, "oos_detection (registry key_type) — graded by detector, no scoreJudgment keySha");
    else if (!stampedKey) push("FAIL", "MISSING_STAMP", `${name} :: keySha256`, "active full_verdict key has no adjudication.keySha256");
    else { const rec = keySha256(k); const ok = rec === stampedKey; push(ok ? "PASS" : "FAIL", ok ? "KEY_OK" : "KEY_DRIFT", `${name} :: keySha256`, `${rec.slice(0, 12)} ${ok ? "==" : "≠"} ${stampedKey.slice(0, 12)}`); }

    // ── sourceSha256 (S2/#3/#7: pin to the key's DECLARED source only) ──
    const stampedSrc = k.adjudication?.sourceSha256 ?? k.source_sha256;
    if (!stampedSrc) {
      if (isOos) push("SKIP", "OOS_NO_SOURCE", `${name} :: sourceSha256`, "oos_detection — no source hash declared");
      else push("FAIL", "MISSING_SOURCE_DECL", `${name} :: sourceSha256`, "active full_verdict key declares no source hash");
      return;
    }
    // declared source-of-record: explicit source_file (anchors) > key.authored_against > canonical goldSourcePath.
    const declRef = e.source_file ?? k.authored_against;
    let srcAbs: string;
    if (declRef) { const r = safeResolve(goldDir, declRef); if (r.escape) return push("FAIL", "PATH_ESCAPE", `${name} :: source path`, declRef); srcAbs = r.path!; }
    else srcAbs = goldSourcePath(name, goldDir); // name === sol for keys{}; convention, contained by construction
    if (!existsSync(srcAbs)) return push("FAIL", "SOURCE_MISSING_FILE", `${name} :: sourceSha256`, `declared source not found: ${declRef ?? path.basename(srcAbs)}`);
    const fs = fileSha(srcAbs); const oks = fs === stampedSrc;
    push(oks ? "PASS" : "FAIL", oks ? "SOURCE_OK" : "SOURCE_DRIFT", `${name} :: sourceSha256`, `${path.basename(srcAbs)} ${oks ? "==" : "≠"} ${stampedSrc.slice(0, 12)}`);
  };

  const checkSupersedes = (name: string, sup: unknown) => {
    const arr = Array.isArray(sup) ? sup : sup ? [sup] : [];
    for (const s of arr as Array<{ file: string; retired_sha256?: string }>) {
      const label = `${name} :: retired ${s.file}`;
      if (!s.retired_sha256) { push("FAIL", "MISSING_RETIRED_HASH", label, "supersedes entry has no retired_sha256"); continue; }
      const r = safeResolve(goldDir, s.file);
      if (r.escape) { push("FAIL", "PATH_ESCAPE", label, s.file); continue; }
      if (!existsSync(r.path!)) { push("FAIL", "MISSING_RETIRED_FILE", label, "retired file not on disk"); continue; }
      const fs = fileSha(r.path!); const ok = fs === s.retired_sha256;
      push(ok ? "PASS" : "FAIL", ok ? "RETIRED_OK" : "RETIRED_DRIFT", label, `${fs.slice(0, 12)} ${ok ? "==" : "≠"} ${s.retired_sha256.slice(0, 12)}`);
    }
  };

  const reg = JSON.parse(readFileSync(path.join(goldDir, "gold-set-registry.json"), "utf8")) as {
    keys?: Record<string, ActiveEntry>; setasideOvertypeAnchors?: Record<string, ActiveEntry>;
  };
  for (const [sol, e] of Object.entries(reg.keys ?? {})) { checkActive(sol, e); checkSupersedes(sol, e.supersedes); }
  for (const [nm, e] of Object.entries(reg.setasideOvertypeAnchors ?? {})) { if (nm.startsWith("_")) continue; checkActive(nm, e); checkSupersedes(nm, e.supersedes); } // #4: anchors get supersedes too
  return rows;
}

// ── CLI ──
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const rows = runGoldIntegrity();
  const w = Math.max(...rows.map((r) => r.label.length));
  console.log("GOLD INTEGRITY — DRIFT CHECK (recompute-vs-stamped). NOT an authenticity/authorization control (Brain S3): the stamp co-locates with the content, so this catches accidental non-re-stamped drift, not intentional tampering.\n");
  console.log("┌─ checks " + "─".repeat(Math.max(0, w - 2)));
  for (const r of rows) console.log(`│ ${r.status === "SKIP" ? "➖" : r.status === "PASS" ? "✅" : "❌"} ${r.label.padEnd(w)}  [${r.cls}] ${r.detail}`);
  console.log("└" + "─".repeat(w + 22));
  const failed = rows.filter((r) => r.status === "FAIL");
  const skipped = rows.filter((r) => r.status === "SKIP").length;
  if (failed.length) { console.error(`\n✗ ${failed.length} INTEGRITY FAILURE(S): ${[...new Set(failed.map((f) => f.cls))].join(", ")} (${skipped} skipped).`); process.exit(1); }
  console.log(`\n✓ ALL PASS — registry-wide gold integrity clean (${rows.length - skipped} checks, ${skipped} skipped/N-A).`);
}
