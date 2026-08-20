// $0 FLAG CENSUS — the "under-configured / under-decided" measurement, made reproducible.
//
// WHY THIS EXISTS. A flag that is never false is not a flag; it is a branch that must be carried forever.
// This enumerates every AUDIT_* switch the engine reads and classifies it against what the two production
// surfaces actually set, so retirement is driven by evidence rather than by memory of what shipped.
//
//   npx tsx scripts/audit-ai/_flag-census.ts <railway.kv> <vercel.names> <run-record.json>
//
// ⛔ A FAILED READ IS NOT AN EMPTY SET. Each input file must be non-empty or this refuses to classify —
// a zero-length surface list would silently reclassify every flag on that surface as "never set".
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const [rwFile, vcFile, recFile] = process.argv.slice(2);
if (!rwFile || !vcFile || !recFile) { console.error("usage: _flag-census.ts <railway.kv> <vercel.names> <run-record.json>"); process.exit(2); }

const lines = (p: string) => readFileSync(p, "utf8").split("\n").map(s => s.trim()).filter(Boolean);
const rwRaw = lines(rwFile), vcRaw = lines(vcFile);
if (!rwRaw.length) { console.error("⛔ railway list is EMPTY — refusing: a failed read is not 'nothing is set'"); process.exit(2); }
if (!vcRaw.length) { console.error("⛔ vercel list is EMPTY — refusing: a failed read is not 'nothing is set'"); process.exit(2); }

const rw = new Map<string,string>();
for (const l of rwRaw) { const i = l.indexOf("="); if (i > 0 && l.startsWith("AUDIT_")) rw.set(l.slice(0,i), l.slice(i+1)); }
const vc = new Set(vcRaw.filter(s => s.startsWith("AUDIT_")));

const code = new Set(
  execSync(`grep -rhoE "process\\.env\\.AUDIT_[A-Z0-9_]+" src/ scripts/ agents/ 2>/dev/null | sed 's/.*env\\.//' | sort -u`,
    { encoding: "utf8", cwd: process.cwd() }).split("\n").map(s=>s.trim()).filter(Boolean));

const rec = JSON.parse(readFileSync(recFile, "utf8"));
const fe: Record<string,string> = rec?.meta?.flagEnv ?? {};

type Row = { flag: string; code: boolean; rw?: string; vc: boolean; run?: string };
const all = new Set<string>([...code, ...rw.keys(), ...vc]);
const rows: Row[] = [...all].sort().map(f => ({ flag: f, code: code.has(f), rw: rw.get(f), vc: vc.has(f), run: fe[f] }));

const isTrue = (v?: string) => String(v).toLowerCase() === "true";
const bucket = (r: Row): string => {
  if (!r.code) return "DEAD — set on a surface, read by no code";
  if (isTrue(r.rw) && isTrue(r.run)) return "ALWAYS-ON — retire the flag, keep the behaviour";
  if (r.rw === undefined && !r.vc) return "NEVER SET — runs at its code default on both surfaces";
  if (isTrue(r.rw) !== r.vc && r.rw !== undefined) return "PARITY BREAK — the two surfaces disagree";
  if (r.rw !== undefined && !isTrue(r.rw)) return "OFF — armed nowhere";
  return "MIXED";
};

const by = new Map<string, Row[]>();
for (const r of rows) { const b = bucket(r); (by.get(b) ?? by.set(b, []).get(b)!).push(r); }

console.log(`══ AUDIT_* FLAG CENSUS — ${rows.length} distinct switches\n`);
console.log(`   read in code            ${[...code].length}`);
console.log(`   set on Railway          ${rw.size}`);
console.log(`   set on Vercel           ${vc.size}`);
console.log(`   TRUE in banked run      ${Object.entries(fe).filter(([k,v])=>k.startsWith("AUDIT_")&&isTrue(v)).length}\n`);
for (const [b, list] of [...by.entries()].sort((a,b)=>b[1].length-a[1].length)) {
  console.log(`── ${b}  (${list.length})`);
  for (const r of list) console.log(`     ${r.flag.padEnd(46)} railway=${String(r.rw ?? "-").padEnd(6)} vercel=${r.vc?"set":"-"}   run=${r.run ?? "-"}`);
  console.log();
}
