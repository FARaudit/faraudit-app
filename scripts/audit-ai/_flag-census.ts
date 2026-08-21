// $0 FLAG CENSUS — every AUDIT_* switch, classified against what the two production surfaces set.
//
// WHY THIS EXISTS. A flag that is never false is not a flag; it is a branch carried forever. This
// enumerates them so retirement is driven by evidence rather than by memory of what shipped.
//
//   npx tsx scripts/audit-ai/_flag-census.ts <railway.kv> <vercel.names> <run-record.json>
//   npx tsx scripts/audit-ai/_flag-census.ts --self-test        (no surfaces needed)
//
// ⛔ TWO DETECTORS, BOTH WRITTEN AFTER THE NAIVE VERSION GOT IT WRONG ON A LIVE FLAG.
//
//   D1 READS — the first version matched `process.env.AUDIT_X` only. `audit-judgment-layer.ts:29`
//   reads `env.AUDIT_JUDGMENT_LAYER === "true"` through an ALIASED env object, so the flag was
//   filed DEAD and came within one command of being deleted from production — it gates the J1/J2
//   layer. D1 now strips comments and looks for the NAME, which catches every access form
//   (`process.env.X`, `env.X`, `env["X"]`, destructured). Stripping comments is not cosmetic: a
//   prose mention of `AUDIT_AGENTIC_V3_PRIMARY` in a view-model comment is what made a substring
//   match call an inert var "web-served".
//
//   D2 NEGATIVE CONTROLS — the first version looked for `process.env.X =`. `audit-claim-entailment
//   -flag.test.ts` drives its flag through a SPAWNED probe (execFileSync + env), so no assignment
//   appears in the file at all. Retiring the flag made that suite fail (expected 0, actual 9). D2
//   now treats ANY non-comment mention of the name under a test or script as a live consumer of
//   the false branch. That over-reports on purpose: a false "has a control" costs one flag left
//   alone; a false "no control" deletes a proof.
//
// ⛔ A FAILED READ IS NOT AN EMPTY SET. Each surface list must be non-empty or this refuses.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ── comment stripping (D1 + D2 both depend on it) ────────────────────────────────────────────────
export function stripComments(src: string): string {
  let out = "", i = 0, inS: false | '"' | "'" | "`" = false, inLine = false, inBlock = false;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === "\n") { inLine = false; out += c; } i++; continue; }
    if (inBlock) { if (c === "*" && n === "/") { inBlock = false; i += 2; } else i++; continue; }
    if (inS) { if (c === "\\") { out += c + (n ?? ""); i += 2; continue; } if (c === inS) inS = false; out += c; i++; continue; }
    if (c === "/" && n === "/") { inLine = true; i += 2; continue; }
    if (c === "/" && n === "*") { inBlock = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") { inS = c as '"'; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}

const walk = (dir: string, acc: string[] = []): string[] => {
  let ents: string[]; try { ents = readdirSync(dir); } catch { return acc; }
  for (const e of ents) {
    if (e === "node_modules" || e === ".git" || e === ".next") continue;
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|js|mjs)$/.test(e)) acc.push(p);
  }
  return acc;
};

export interface FlagFacts { reads: string[]; controls: string[] }

/** D1 + D2 in one pass over comment-stripped sources. */
export function scanFlags(roots: string[], flags: Iterable<string>): Map<string, FlagFacts> {
  // Exclude THIS file. It names flags in string literals (the self-test anchors), and a scanner that
  // reads itself reports every name it mentions as present — which is exactly what the
  // "name that exists nowhere" negative control caught on the first run.
  const SELF = "_flag-census.ts";
  const files = roots.flatMap((r) => walk(r)).filter((f) => !f.endsWith(SELF));
  const stripped = files.map((f) => { try { return { f, s: stripComments(readFileSync(f, "utf8")) }; } catch { return { f, s: "" }; } });
  const out = new Map<string, FlagFacts>();
  for (const flag of flags) {
    const re = new RegExp(`\\b${flag}\\b`);
    const reads: string[] = [], controls: string[] = [];
    for (const { f, s } of stripped) {
      if (!re.test(s)) continue;
      const isProof = /\.test\.tsx?$/.test(f) || /(^|\/)scripts\//.test(f);
      (isProof ? controls : reads).push(f);
    }
    out.set(flag, { reads, controls });
  }
  return out;
}

// ── self-test: the two flags that broke the naive detectors are permanent regression anchors ─────
if (process.argv[2] === "--self-test") {
  const facts = scanFlags(["src", "scripts", "agents"], ["AUDIT_JUDGMENT_LAYER", "AUDIT_CLAIM_ENTAILMENT", "AUDIT_ZZZ_DOES_NOT_EXIST"]);
  let bad = 0;
  const ok = (l: string, c: boolean, why: string) => { if (c) console.log(`  ✓ ${l}`); else { bad++; console.error(`  ✗ ${l} — ${why}`); } };

  ok("D1 sees an ALIASED env read", (facts.get("AUDIT_JUDGMENT_LAYER")!.reads.length > 0),
     "AUDIT_JUDGMENT_LAYER is read as env.AUDIT_JUDGMENT_LAYER — filing it DEAD nearly deleted the live J1/J2 layer");
  ok("D2 sees a SUBPROCESS-driven control", (facts.get("AUDIT_CLAIM_ENTAILMENT")!.controls.length > 0),
     "its suite drives the flag through a spawned probe; missing this deletes a working negative control");
  ok("a name that exists nowhere reports nothing", (facts.get("AUDIT_ZZZ_DOES_NOT_EXIST")!.reads.length === 0 && facts.get("AUDIT_ZZZ_DOES_NOT_EXIST")!.controls.length === 0),
     "the scanner matches anything — it cannot distinguish present from absent");
  ok("comments are STRIPPED, not matched", !/AUDIT_STRIP_PROBE/.test(stripComments(`// AUDIT_STRIP_PROBE\n/* AUDIT_STRIP_PROBE */\nconst x=1;`)),
     "a prose mention would count as a read — this is what called an inert var web-served");
  ok("code OUTSIDE a comment still matches", /AUDIT_STRIP_PROBE/.test(stripComments(`const y = env.AUDIT_STRIP_PROBE; // AUDIT_STRIP_PROBE`)),
     "the stripper ate real code");

  console.log(bad ? `\n✗ ${bad} detector check(s) failed` : "\n✓ detectors sound");
  process.exit(bad ? 1 : 0);
}

// ── census ───────────────────────────────────────────────────────────────────────────────────────
const [rwFile, vcFile, recFile] = process.argv.slice(2);
if (!rwFile || !vcFile || !recFile) { console.error("usage: _flag-census.ts <railway.kv> <vercel.names> <run-record.json>   |   --self-test"); process.exit(2); }
const lines = (p: string) => readFileSync(p, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
const rwRaw = lines(rwFile), vcRaw = lines(vcFile);
if (!rwRaw.length) { console.error("⛔ railway list EMPTY — refusing: a failed read is not 'nothing is set'"); process.exit(2); }
if (!vcRaw.length) { console.error("⛔ vercel list EMPTY — refusing: a failed read is not 'nothing is set'"); process.exit(2); }

const rw = new Map<string, string>();
for (const l of rwRaw) { const i = l.indexOf("="); if (i > 0 && l.startsWith("AUDIT_")) rw.set(l.slice(0, i), l.slice(i + 1)); }
const vc = new Set(vcRaw.filter((s) => s.startsWith("AUDIT_")));
const fe: Record<string, string> = JSON.parse(readFileSync(recFile, "utf8"))?.meta?.flagEnv ?? {};

// candidate names: every AUDIT_* token anywhere, plus whatever the surfaces set
const nameRe = /\bAUDIT_[A-Z0-9_]+\b/g;
const names = new Set<string>([...rw.keys(), ...vc, ...Object.keys(fe).filter((k) => k.startsWith("AUDIT_"))]);
for (const f of walk("src").concat(walk("scripts"), walk("agents")).filter((f) => !f.endsWith("_flag-census.ts"))) {
  let s: string; try { s = stripComments(readFileSync(f, "utf8")); } catch { continue; }
  for (const m of s.match(nameRe) ?? []) names.add(m);
}
const facts = scanFlags(["src", "scripts", "agents"], names);
const isTrue = (v?: string) => String(v).toLowerCase() === "true";

const rows = [...names].sort().map((flag) => {
  const { reads, controls } = facts.get(flag)!;
  const prodReads = reads.filter((f) => f.startsWith("src") && !/\.test\.tsx?$/.test(f));
  return { flag, prodReads: prodReads.length, controls: controls.length, rw: rw.get(flag), vc: vc.has(flag), run: fe[flag] };
});

const bucket = (r: typeof rows[number]) =>
  r.prodReads === 0 && r.controls === 0 ? "DEAD — no reference in any source, comments excluded"
  : r.prodReads === 0 ? "PROOF-ONLY — referenced only by tests/scripts"
  : isTrue(r.rw) && isTrue(r.run) ? (r.controls ? "ALWAYS-ON, CONTROLLED — retiring deletes a negative control"
                                                : "ALWAYS-ON, FREE — retire the flag, keep the behaviour")
  : r.rw === undefined && !r.vc ? "NEVER SET — runs at its code default"
  : r.rw !== undefined && !isTrue(r.rw) ? "OFF — armed nowhere"
  : "MIXED";

const by = new Map<string, typeof rows>();
for (const r of rows) { const b = bucket(r); (by.get(b) ?? by.set(b, [] as never).get(b)!).push(r as never); }
console.log(`══ AUDIT_* FLAG CENSUS — ${rows.length} distinct switches`);
console.log(`   set on Railway ${rw.size} · set on Vercel ${vc.size} · TRUE in banked run ${Object.entries(fe).filter(([k, v]) => k.startsWith("AUDIT_") && isTrue(v)).length}\n`);
for (const [b, list] of [...by.entries()].sort((a, b2) => b2[1].length - a[1].length)) {
  console.log(`── ${b}  (${list.length})`);
  for (const r of list) console.log(`     ${r.flag.padEnd(44)} prodReads=${String(r.prodReads).padEnd(3)} controls=${String(r.controls).padEnd(3)} railway=${String(r.rw ?? "-").padEnd(6)} vercel=${r.vc ? "set" : "-"}`);
  console.log();
}
