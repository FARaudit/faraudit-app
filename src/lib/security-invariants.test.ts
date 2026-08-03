// $0 PROOF for RULES 32, 60 and 17 (CEO queue #2).
// Run: npx tsx src/lib/security-invariants.test.ts
//
// These three rules are cited by number in 17, 0 and 14 source files respectively and had, between them, ZERO
// tests. The standing gate — `scripts/security/fort-knox-scan.sh` — cannot fail: no `exit` statement anywhere,
// and its one failure flag is set but never read. A planted `ghp_`-shaped token in `src/` is detected, printed,
// and the script exits 0.
//
// So this suite is written to the opposite standard. Section 2 PLANTS a synthetic violation of every checker
// and asserts each one goes RED. A security gate that has only ever been observed passing is indistinguishable
// from one that is structurally unable to fail, and this repository has shipped that mistake before ("28/28"
// was VOID; "130/130" included three suites that only ran on one laptop).
//
// NOTE ON THIS FILE'S OWN CONTENT: it must never contain a literal credential pattern, or it would trip the
// Rule 32 scan it defines. Every synthetic secret below is ASSEMBLED AT RUNTIME from fragments.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  findCommittedSecretValues,
  findBrowserReachableCredentials,
  findEnvParityGaps,
  PUBLIC_ENV_ALLOWLIST,
  type SourceFile,
} from "./security-invariants";

let failures = 0;
const assert = (c: boolean, m: string) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) failures++; };

const ROOT = process.cwd();
const TEXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|html|css|md|sh|yml|yaml|sql)$/;
const SKIP = /(^|\/)(node_modules|\.next|\.git|run-records|\.run-record-cache|gold-sets|\.verify-tmp|coverage)(\/|$)/;

function walk(dir: string, out: SourceFile[] = []): SourceFile[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const rel = relative(ROOT, p);
    if (SKIP.test(rel)) continue;
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (TEXT.test(e) && st.size < 2_000_000) {
      try { out.push({ path: rel, content: readFileSync(p, "utf8") }); } catch { /* binary-ish, skip */ }
    }
  }
  return out;
}

console.log("── 1. THE REAL REPOSITORY ───────────────────────────────────────────────");
const repo = walk(join(ROOT, "src")).concat(walk(join(ROOT, "public")), walk(join(ROOT, "scripts")), walk(join(ROOT, "agents")), walk(join(ROOT, "test")));
const served = walk(join(ROOT, "public"));
const client = walk(join(ROOT, "src")).filter((f) => /^\s*["']use client["']/m.test(f.content));

// Absence must be a visible fact, never a silent pass — the exact hole in the bash scan, where a missing
// sibling repo took the "✓" branch.
assert(repo.length > 200, `scanned ${repo.length} repository files (a near-empty scan is a broken scan, not a clean one)`);
assert(served.length > 0, `scanned ${served.length} SERVED asset(s) under public/`);
assert(client.length > 0, `scanned ${client.length} browser-executed component(s)`);

{
  const v = findCommittedSecretValues(repo);
  for (const x of v) console.log(`   RULE 32 · ${x.file}:${x.line} — ${x.detail}`);
  assert(v.length === 0, `RULE 32 — no credential VALUE is committed (${v.length} finding(s))`);
}
{
  const v = findBrowserReachableCredentials(served, client);
  for (const x of v) console.log(`   RULE 60 · ${x.file}:${x.line} — ${x.detail}`);
  assert(v.length === 0, `RULE 60 — nothing browser-reachable exposes a credential (${v.length} finding(s))`);
}

console.log("\n── 2. EACH CHECKER PROVEN RED (the section the bash scan never had) ─────");
// Assembled at runtime so this file contains no literal credential.
const FAKE_GH = "ghp_" + "A".repeat(36);
const FAKE_ANT = "sk-" + "ant-api" + "0".repeat(30);
const FAKE_AWS = "AKIA" + "ABCDEFGHIJKLMNOP";
const FAKE_JWT = "eyJ" + "a".repeat(14) + "." + "eyJ" + "b".repeat(14) + "." + "c".repeat(14);

for (const [label, body] of [
  ["GitHub PAT", `const t = "${FAKE_GH}";`],
  ["Anthropic key", `const t = "${FAKE_ANT}";`],
  ["AWS key id", `const t = "${FAKE_AWS}";`],
  ["JWT", `const t = "${FAKE_JWT}";`],
  // Assembled, like the rest. Written as one literal it made this suite's FIRST real finding its own source
  // file — which is the gate working, and is why the fragments above are not decorative.
  ["private key block", ["-----", "BEGIN RSA PRIVATE KEY", "-----"].join("")],
] as Array<[string, string]>) {
  const v = findCommittedSecretValues([{ path: "planted.ts", content: body }]);
  assert(v.length > 0 && v[0].rule === 32, `RULE 32 goes RED on a planted ${label}`);
}
assert(!findCommittedSecretValues([{ path: "planted.ts", content: JSON.stringify({ note: "no secret here", sha: "a".repeat(64) }) }]).length,
  "RULE 32 stays green on a sha256 hash — entropy alone is not a credential");

{
  const v = findBrowserReachableCredentials([{ path: "public/w.js", content: `fetch("https://api.sam.gov/x?api_key=${"z".repeat(40)}")` }], []);
  assert(v.some((x) => /URL query parameter/.test(x.detail)), "RULE 60 goes RED on a key in a URL — the exact SAM.gov exposure shape");
}
{
  const v = findBrowserReachableCredentials([], [{ path: "src/C.tsx", content: `"use client";\nconst k = process.env.SAM_API_KEY;` }]);
  assert(v.some((x) => /reads server env var SAM_API_KEY/.test(x.detail)), "RULE 60 goes RED on browser code reading a server env var");
}
{
  const v = findBrowserReachableCredentials([{ path: "public/w.js", content: `const k = process.env.NEXT_PUBLIC_SAM_API_KEY;` }], []);
  assert(v.some((x) => /reviewed allowlist/.test(x.detail)), "RULE 60 goes RED on a credential-shaped NEXT_PUBLIC_* not on the allowlist");
}
{
  const v = findBrowserReachableCredentials([{ path: "public/w.js", content: `const t = "${FAKE_GH}";` }], []);
  assert(v.some((x) => x.rule === 60 && /SERVED/.test(x.detail)), "RULE 60 goes RED on a credential value in a served asset");
}
{
  // The false-positive control. A comment NAMING a server variable is a disclosure question for the
  // comment-leak gate, not a credential reaching the browser. public/teaming-partners-live.js does exactly
  // this today, and a gate that cries wolf on it is a gate that gets ignored.
  const v = findBrowserReachableCredentials([{ path: "public/w.js", content: `/* the route is SAM_API_KEY-backed */\n// process.env.SAM_API_KEY lives server-side\nconsole.log(1);` }], []);
  assert(v.length === 0, "RULE 60 stays green when a COMMENT merely names a server variable");
}
{
  const v = findBrowserReachableCredentials([{ path: "public/w.js", content: `fetch(\`/api/x?api_key=\${KEY}\`)` }], []);
  assert(v.length === 0, "RULE 60 stays green on a templated key — that is a server call, not a literal");
}
for (const name of PUBLIC_ENV_ALLOWLIST) {
  const v = findBrowserReachableCredentials([{ path: "public/w.js", content: `process.env.${name}` }], []);
  assert(v.length === 0, `RULE 60 stays green on the reviewed public var ${name}`);
}

{
  const gaps = findEnvParityGaps({ AUDIT_A: "true", AUDIT_B: "true", AUDIT_C: "true" }, { AUDIT_A: "true", AUDIT_C: "false" });
  assert(gaps.some((g) => /AUDIT_B set on audit-worker but ABSENT on Vercel/.test(g.detail)), "RULE 17 goes RED on a flag missing from Vercel");
  assert(gaps.some((g) => /AUDIT_C DIFFERS/.test(g.detail)), "RULE 17 goes RED on a flag whose VALUE differs");
  assert(gaps.length === 2, `RULE 17 reports exactly the two real gaps (got ${gaps.length})`);
  assert(!findEnvParityGaps({ AUDIT_A: "true" }, { AUDIT_A: "true" }).length, "RULE 17 stays green at true parity");
  assert(!findEnvParityGaps({ OTHER: "x" }, {}).length, "RULE 17 ignores vars outside the governed set");
}

console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
