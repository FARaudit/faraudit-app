// Re-capture the live-flag snapshot from the worker. The stale snapshot is what made every measurement in the
// 2026-07-31 arc describe a configuration nobody runs — 31 flags of drift, 6 of them pinned FALSE while true
// in production. Writes the snapshot AND prints the diff, so a re-capture can never be a silent overwrite.
export {};
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
const PATH = "scripts/audit-ai/live-flags.snapshot.json";
const raw = execSync("railway variables --service audit-worker --kv", { encoding: "utf8", timeout: 180000 });
const flags: Record<string, string> = {};
const rejected: string[] = [];
for (const line of raw.split("\n")) {
  const m = /^(AUDIT_[A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (!m) continue;
  const v = m[2].trim();
  // Normalise Railway's occasional "True"; reject anything that is not a clean boolean so a malformed value
  // can never be silently applied as a flag state.
  if (/^(true|True)$/.test(v)) flags[m[1]] = "true";
  else if (/^(false|False)$/.test(v)) flags[m[1]] = "false";
  else rejected.push(`${m[1]}=<non-boolean>`);
}
const prev = existsSync(PATH) ? JSON.parse(readFileSync(PATH, "utf8")) : { flags: {} };
const added: string[] = [], changed: string[] = [], gone: string[] = [];
for (const [k, v] of Object.entries(flags)) {
  if (!(k in prev.flags)) added.push(`${k}=${v}`);
  else if (prev.flags[k] !== v) changed.push(`${k}: ${prev.flags[k]} → ${v}`);
}
for (const k of Object.keys(prev.flags)) if (!(k in flags)) gone.push(k);
if (process.env.APPLY === "1") {
  writeFileSync(PATH, JSON.stringify({ _provenance: { capturedAt: new Date().toISOString(), source: "railway variables --service audit-worker --kv", _rejectedKeys: rejected }, flags }, null, 2) + "\n");
}
console.log(`worker AUDIT_* boolean flags: ${Object.keys(flags).length} · non-boolean rejected: ${rejected.length}`);
console.log(`vs snapshot on disk — added ${added.length} · changed ${changed.length} · absent-from-worker ${gone.length}`);
for (const a of added.slice(0, 40)) console.log(`   + ${a}`);
for (const c of changed) console.log(`   ~ ${c}`);
for (const g of gone) console.log(`   - ${g} (no longer on the worker)`);
console.log(process.env.APPLY === "1" ? `\n✅ snapshot rewritten` : `\n(dry run — set APPLY=1 to write)`);
