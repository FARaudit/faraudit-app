// CONFLATED / BLOATED / DEGRADING — measured, not eyeballed. $0, read-only.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const ROOT = process.cwd(), LIB = join(ROOT, "src", "lib");
function walk(d: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const rel = `${d}/${e.name}`;
    if (e.isDirectory()) walk(rel, out); else if (/\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}
const srcFiles = [...walk("src"), ...walk("agents")];
const text = new Map(srcFiles.map(f => [f, readFileSync(join(ROOT, f), "utf8")]));

// ---- live flag state
let live = new Map<string, string>();
try {
  for (const l of execFileSync("railway", ["variables","--service","audit-worker","--kv"], { encoding:"utf8", stdio:"pipe" }).split("\n")) {
    const i = l.indexOf("="); if (i > 0 && /^AUDIT_/.test(l) && !/\s/.test(l.slice(0,i))) live.set(l.slice(0,i), l.slice(i+1).trim());
  }
} catch {}
const isOn = (v?: string) => v != null && ["true","1","yes","on"].includes(v.toLowerCase());

console.log("═══ BLOAT ═══");
// A flag ON in prod whose code is `=== "true"` gated means its OFF branch is UNREACHABLE in production —
// dead code that still must be read, tested and reasoned about on every change.
const gated = new Set<string>();
for (const [, s] of text) for (const m of s.matchAll(/process\.env\.(AUDIT_[A-Z0-9_]+)\s*===\s*"true"/g)) gated.add(m[1]);
const permanentlyOn = [...gated].filter(f => isOn(live.get(f)));
console.log(`  flag-gated branches in code            ${gated.size}`);
console.log(`  ...permanently ON in production        ${permanentlyOn.length}   <- their OFF branch is dead code`);
console.log(`  ...gated but NEVER set anywhere        ${[...gated].filter(f => !live.has(f)).length}   <- their ON branch has never run in prod`);
const scripts = readdirSync(join(ROOT,"scripts","audit-ai")).filter(f=>f.endsWith(".ts"));
const oneOff = scripts.filter(f => f.startsWith("_"));
console.log(`  scripts/audit-ai/*.ts                  ${scripts.length}  (one-off "_" prefixed: ${oneOff.length})`);
console.log(`  certs                                  ${scripts.filter(f=>/^_cert/.test(f)).length}`);

console.log("\n═══ CONFLATED ═══");
// Two mechanisms deciding the same thing. Proxy: modules that both WRITE f.requirement (report prose) and are
// consulted for verdict/disposition — a single edit then moves two things the reviewer must separate.
const writesReq = srcFiles.filter(f => /requirement:\s|f\.requirement\s*=/.test(text.get(f)!)).filter(f=>!f.includes(".test."));
const touchesVerdict = srcFiles.filter(f => /disposition|deriveVerdict|showStopper|severity/.test(text.get(f)!)).filter(f=>!f.includes(".test."));
const both = writesReq.filter(f => touchesVerdict.includes(f));
console.log(`  modules writing report prose           ${writesReq.length}`);
console.log(`  modules touching verdict/disposition   ${touchesVerdict.length}`);
console.log(`  BOTH (prose + verdict in one module)   ${both.length}`);
for (const f of both.slice(0,8)) console.log(`      ${f}`);

console.log("\n═══ DEGRADING ═══");
// Code referencing a flag that production no longer sets, and comments asserting a state that no longer holds.
const referenced = new Set<string>(); for (const [,s] of text) for (const m of s.matchAll(/AUDIT_[A-Z0-9_]+/g)) referenced.add(m[0]);
const codeExpectsButUnset = [...referenced].filter(f => !live.has(f));
console.log(`  flags referenced in code               ${referenced.size}`);
console.log(`  ...production does not set them        ${codeExpectsButUnset.length}`);
console.log(`  live vars                              ${live.size}  (ON: ${[...live.values()].filter(isOn).length})`);
