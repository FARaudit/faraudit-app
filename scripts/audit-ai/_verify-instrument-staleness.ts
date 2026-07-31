// RED-TEAM P0#3: _instrument's applyStampedConfig("live") is claimed to be STALE vs the worker, and to
// hard-pin flags FALSE that are TRUE in production. If so, every measurement I took this session under
// that config was taken against a configuration that is not production. Verify against the live worker.
export {};
import { applyStampedConfig } from "./_instrument";
import { execSync } from "node:child_process";
for (const k of Object.keys(process.env)) if (k.startsWith("AUDIT_")) delete process.env[k];
applyStampedConfig("live");
const stamped = new Map<string, string>();
for (const [k, v] of Object.entries(process.env)) if (k.startsWith("AUDIT_")) stamped.set(k, String(v));
let raw = "";
try { raw = execSync('railway variables --service audit-worker --kv 2>/dev/null', { encoding: "utf8", timeout: 120000 }); } catch { }
const live = new Map<string, string>();
for (const line of raw.split("\n")) { const m = /^(AUDIT_[A-Z0-9_]+)=(.*)$/.exec(line.trim()); if (m) live.set(m[1], m[2]); }
if (!live.size) { console.log("could not read worker vars — cannot verify"); process.exit(2); }
console.log(`stamped "live" config: ${stamped.size} AUDIT_* keys · worker: ${live.size} AUDIT_* keys\n`);
// Railway emits "True"/"False" for some keys; normalise BOTH sides or the comparator reports a phantom
// disagreement that is pure capitalisation (it did, on AUDIT_AGENTIC_PRIMARY, after the re-capture).
const norm = (v: string | undefined) => { if (v === undefined) return "(unset)"; const t = v.trim().toLowerCase(); return t === "true" ? "true" : t === "false" ? "false" : v; };
const disagree: string[] = [];
for (const [k, lv] of live) {
  const sv = stamped.get(k);
  const l = norm(lv), s = norm(sv);
  if (l === "true" && s !== "true") disagree.push(`   LIVE=true  stamped=${s.padEnd(8)} ${k}`);
  else if (l !== "true" && s === "true") disagree.push(`   LIVE=${l.padEnd(6)} stamped=true     ${k}`);
}
for (const [k, sv] of stamped) if (!live.has(k) && norm(sv) === "true") disagree.push(`   LIVE=(absent) stamped=true    ${k}`);
console.log(`DISAGREEMENTS between the config I called "live" and the actual worker: ${disagree.length}`);
for (const d of disagree.sort()) console.log(d);
console.log(disagree.length ? `\n⇒ every number measured under applyStampedConfig("live") was taken under a config that differs\n  from production in ${disagree.length} flags.` : "\n⇒ stamped config matches production.");
