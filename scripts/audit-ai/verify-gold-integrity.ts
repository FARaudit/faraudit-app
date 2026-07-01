// $0 REGISTRY-WIDE GOLD INTEGRITY VERIFIER (Brain card 188). Successor to the retired verify-nobid-key.ts.
// Walks gold-set-registry.json and proves chain-of-custody for the WHOLE registry — not one hardcoded key:
//   • every ACTIVE key (keys{} + setasideOvertypeAnchors{}): frozen-file recompute keySha256 == stamped, and
//     (when the key declares a source) sourceSha256 == the on-disk source file's sha256;
//   • every supersedes[] entry: the on-disk retired file's bytes sha256 == the recorded retired_sha256.
// Nonzero exit on ANY failure. Pure, deterministic, no paid runs. Run: npm run verify:gold-integrity
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { keySha256, type JudgmentKey } from "./judgment-score";

const GOLD = "scripts/audit-ai/gold-sets";
const fileSha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const rows: Array<{ pass: boolean | null; label: string; detail: string }> = [];
const ok = (label: string, cond: boolean, detail: string) => rows.push({ pass: cond, label, detail });
const skip = (label: string, detail: string) => rows.push({ pass: null, label, detail });

type AnyKey = JudgmentKey & Record<string, unknown> & { adjudication?: { keySha256?: string; sourceSha256?: string }; source_sha256?: string; authored_against?: string };

function resolveSource(k: AnyKey, sol: string, declared: string, explicit?: string): string | null {
  const cands = [
    explicit,
    k.authored_against?.replace(`${GOLD}/`, ""),
    `${sol}-FULL-SOURCE.txt`, `${sol}-FULL-SOURCE.complete.txt`, `${sol}-FULL-SOURCE.v2.complete.txt`,
  ].filter(Boolean) as string[];
  // prefer a file whose bytes MATCH the declared hash; else the first that exists (so a mismatch is reported, not skipped)
  const match = cands.map((c) => `${GOLD}/${c}`).find((p) => existsSync(p) && fileSha(p) === declared);
  if (match) return match;
  return cands.map((c) => `${GOLD}/${c}`).find((p) => existsSync(p)) ?? null;
}

function checkActive(name: string, e: { file: string; key_type?: string; source_file?: string }) {
  const kp = `${GOLD}/${e.file}`;
  if (!existsSync(kp)) { ok(`${name} :: key file present`, false, `MISSING ${e.file}`); return; }
  const k = JSON.parse(readFileSync(kp, "utf8")) as AnyKey;
  const stampedKey = k.adjudication?.keySha256;
  if (stampedKey) ok(`${name} :: keySha256 recompute==stamped`, keySha256(k) === stampedKey, `${keySha256(k).slice(0, 12)} ${keySha256(k) === stampedKey ? "==" : "≠"} ${stampedKey.slice(0, 12)}`);
  else skip(`${name} :: keySha256`, e.key_type === "oos_detection" ? "oos_detection — no scoreJudgment keySha (expected)" : "no adjudication.keySha256 stamped");
  const declaredSrc = k.adjudication?.sourceSha256 ?? k.source_sha256;
  if (declaredSrc) {
    const sp = resolveSource(k, name, declaredSrc, e.source_file);
    if (!sp) ok(`${name} :: sourceSha256==file`, false, `stamped ${declaredSrc.slice(0, 12)} but NO source file found`);
    else ok(`${name} :: sourceSha256==file`, fileSha(sp) === declaredSrc, `${sp.replace(`${GOLD}/`, "")} ${fileSha(sp) === declaredSrc ? "==" : "≠"} ${declaredSrc.slice(0, 12)}`);
  } else skip(`${name} :: sourceSha256`, "no source hash declared");
}

function checkSupersedes(name: string, sup: unknown) {
  const arr = Array.isArray(sup) ? sup : sup ? [sup] : [];
  for (const s of arr as Array<{ file: string; retired_sha256?: string }>) {
    if (!s.retired_sha256) continue;
    const fp = `${GOLD}/${s.file}`;
    if (!existsSync(fp)) { ok(`${name} :: retired ${s.file}`, false, "retired FILE MISSING"); continue; }
    const actual = fileSha(fp);
    ok(`${name} :: retired ${s.file} bytes==recorded`, actual === s.retired_sha256, `${actual.slice(0, 12)} ${actual === s.retired_sha256 ? "==" : "≠"} ${s.retired_sha256.slice(0, 12)}`);
  }
}

const reg = JSON.parse(readFileSync(`${GOLD}/gold-set-registry.json`, "utf8")) as {
  keys: Record<string, { file: string; key_type?: string; supersedes?: unknown }>;
  setasideOvertypeAnchors?: Record<string, { file: string; source_file?: string; key_type?: string }>;
};

console.log("── ACTIVE keys (keys{}) ──");
for (const [sol, e] of Object.entries(reg.keys)) { checkActive(sol, e); checkSupersedes(sol, e.supersedes); }
console.log("── setasideOvertypeAnchors{} ──");
for (const [name, e] of Object.entries(reg.setasideOvertypeAnchors ?? {})) { if (name.startsWith("_")) continue; checkActive(name, e); }

const w = Math.max(...rows.map((r) => r.label.length));
console.log("\n┌─ GOLD INTEGRITY " + "─".repeat(Math.max(0, w - 6)));
for (const r of rows) console.log(`│ ${r.pass === null ? "➖" : r.pass ? "✅" : "❌"} ${r.label.padEnd(w)}  ${r.detail}`);
console.log("└" + "─".repeat(w + 22));
const failed = rows.filter((r) => r.pass === false);
const skipped = rows.filter((r) => r.pass === null).length;
if (failed.length) { console.error(`\n✗ ${failed.length} INTEGRITY FAILURE(S) (${skipped} skipped).`); process.exit(1); }
console.log(`\n✓ ALL PASS — registry-wide gold integrity clean (${rows.length - skipped} checks, ${skipped} skipped/N-A).`);
