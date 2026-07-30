// NARRATIVE-SITE INVENTORY — ARC #747 · V2, Gauntlet gate 1 ($0, read-only, changes nothing).
//
// THE QUESTION. V2's defect is that the engine asserted a record fact the record does not carry: v3.reason
// told the reader the escape hatch was "an authorized distributor at fixed transfer pricing," a financing
// mechanism that appears nowhere in the solicitation or the SAM record — inside the sentence telling them what
// to confirm. Four hardcoded literals carry that phrase. The CEO's ruling is to close the CLASS, not the four,
// so the first question is not "where is that phrase" but "how much prose do we assert without consulting the
// record at all, and where does it live?"
//
// WHY THIS IS DERIVED. Every hand-maintained inventory in this repo has been wrong — the stranded-flag set was
// wrong three times in one session, twice by me. A grep-and-eyeball list of narrative sites would be the same
// artefact. So this enumerates by parsing, and it reports what it CANNOT decide instead of guessing.
//
// WHAT IT DOES
//   1. Walks engine + report source (tests excluded — a literal in a fixture is not a customer sentence).
//   2. Blanks comments with the same scanner the flag deriver uses, so prose ABOUT narrative is never counted
//      as narrative. (The regex version of that scanner silently ate live code; this one is state-machine.)
//   3. Finds string and template literals assigned to a field or returned, extracts the LITERAL text only —
//      the quasis, i.e. the parts that survive regardless of what the record says — and keeps those that read
//      as a sentence (>= MIN_WORDS words).
//   4. Buckets each by whether its literal text asserts something SPECIFIC and checkable about the world.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not decide which clauses are fabrications. "Asserts a record fact"
// is a judgment about meaning, and a phrase denylist is forbidden doctrine here (shape allowlists only) — it
// would also rot exactly like the flag count did. The tool enumerates and ranks; the registry design decides.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIN_WORDS = 6;

const TARGETS = [
  "src/lib/audit-decide.ts", "src/lib/audit-engine.ts", "src/lib/audit-orchestrator.ts",
  "src/lib/audit-v3-report.ts", "src/lib/audit-run-record.ts", "src/lib/audit-gate-v2.ts",
  "src/lib/v4-report", "src/lib/v5-report", "src/app/audit",
  // R2 (Brain ruling 2026-07-26): coverage is a PRECONDITION, not a revision item — acceptance criteria may
  // not be drawn from a census that cannot see served non-code surfaces. public/*.html IS served directly and
  // asserts things to customers: run-audit.html is where the six-pole verdict labels live (the F2-LIVE defect)
  // and past-audits.html is where the outcome filter offers three of six (L2). Excluding them was the same
  // blind spot as _template.html, one directory over.
  "public",
];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  const st = statSync(dir);
  if (st.isFile()) { out.push(dir); return out; }
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    // .html IS included. The first cut filtered to /\.tsx?$/ and therefore could not see
    // src/app/audit/[id]/_template.html — a SERVED customer surface (route.ts falls through to it for any row
    // whose engine is not agentic_v3). That made the design's "the inventory over-reports, which is the safe
    // direction" claim exactly backwards: it UNDER-reported, and a build-time ratchet seeded from it would
    // have passed green while the richest fabrication surface shipped. Caught by the ex-KO seat, not by me.
    else if (/\.(tsx?|html)$/.test(e) && !/\.d\.ts$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

// Comment scanner — identical contract to the flag deriver: blank COMMENTS only, never strings, and do it
// with a state machine so a backtick inside a comment cannot unbalance template detection.
function blankComments(s: string): string {
  const out: string[] = [];
  let st: "code" | "line" | "block" | "sq" | "dq" | "tpl" = "code";
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (st === "code") {
      if (c === "/" && n === "/") { st = "line"; out.push("  "); i++; continue; }
      if (c === "/" && n === "*") { st = "block"; out.push("  "); i++; continue; }
      if (c === "'") st = "sq"; else if (c === '"') st = "dq"; else if (c === "`") st = "tpl";
      out.push(c); continue;
    }
    if (st === "line") { if (c === "\n") { st = "code"; out.push("\n"); } else out.push(" "); continue; }
    if (st === "block") { if (c === "*" && n === "/") { st = "code"; out.push("  "); i++; } else out.push(c === "\n" ? "\n" : " "); continue; }
    out.push(c);
    if (c === "\\") { if (i + 1 < s.length) { out.push(s[i + 1]); i++; } continue; }
    if ((st === "sq" && c === "'") || (st === "dq" && c === '"') || (st === "tpl" && c === "`")) st = "code";
  }
  return out.join("");
}

const lineOf = (src: string, idx: number) => src.slice(0, idx).split("\n").length;

// A literal chunk is "sentence-like" if it carries enough words to be prose rather than a label/class name.
// CSS, font stacks and JS plumbing kept landing in the "specific" bucket — I reported 3 such items when the
// real number was 11 (capture seat, against my own output file). Suppress them structurally rather than by
// eyeballing the list, because eyeballing the list is what produced the 3.
const isNotProse = (t: string) =>
  /[{};]\s*$|^[.#@:]|--[a-z-]+\s*:|\b(?:var|calc|rgba?|px|rem|em|woff2?|base64|font-family|z-index|border|margin|padding)\b\s*[:(]/i.test(t)
  || /^[a-z-]+\s*:\s*[^ ]+;/i.test(t)
  || (t.match(/[{};:]/g)?.length ?? 0) >= 3;

const words = (s: string) => s.trim().split(/\s+/).filter((w) => /[a-z]{2,}/i.test(w)).length;

// Ranking heuristic — NOT a verdict. It asks: does this literal name a specific, checkable thing about the
// world (a mechanism, an instrument, a price basis, a relationship) that only the RECORD could establish?
// Those are where a fabrication can hide. Generic advice ("confirm before pursuing") cannot be false.
const SPECIFIC = /\b(?:fixed|transfer pric\w+|distributor|dealer|reseller|agreement|licen[sc]\w+|contract vehicle|subcontract\w*|teaming|price|pricing|cost|rate|fee|discount|margin|lead[- ]time|delivery|warranty|clearance|certif\w+|accredit\w+|registrat\w+|only known source|sole source|market[- ]structure|incumbent|recompete)\b/i;

// ── AUDIT-NARRATIVE vs MARKETING (R2 scoping split) ─────────────────────────────────────────
// FIRST ATTEMPT WAS WRONG AND THE SANITY CHECK CAUGHT IT. I tested for tokens (`data-field`,
// `compliance_json`, `v3_verdict`…) and called it a shape test. It put `audit-decide.ts` — the file holding
// the ORIGINAL V2 defect at :3700 — OUT of scope, because that module receives audit data as function
// parameters and happens to contain none of those strings. A classifier that excludes the founding defect is
// disqualified. It was a string match wearing a shape test's clothes: the exact thing the spec's standing
// question asks about.
//
// THE REAL SHAPE: a surface is AUDIT-NARRATIVE iff its output can VARY WITH THE AUDIT. For code that means
// the audit compute/render path can reach it — established by import reachability, not by vocabulary. For a
// static template it means the file carries data-binding slots. Everything else renders identical bytes for
// every visitor and cannot fabricate a fact about your acquisition.
const AUDIT_ROOTS = [
  "src/lib/audit-decide.ts", "src/lib/audit-engine.ts", "src/lib/audit-orchestrator.ts",
  "src/lib/audit-v3-report.ts", "src/lib/v4-report/build-data.ts", "src/lib/v5-report/report.ts",
  "src/app/audit/[id]/_view-model.ts", "src/app/audit/[id]/route.ts",
].map((x) => join(ROOT, x)).filter((x) => existsSync(x));

const RESOLVE_EXT = ["", ".ts", ".tsx", "/index.ts"];
function resolveSpec(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const e of RESOLVE_EXT) { const c = base + e; if (existsSync(c) && statSync(c).isFile()) return c; }
  return null;
}
function auditReachable(roots: string[]): Set<string> {
  const seen = new Set<string>(); const stack = [...roots];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    let raw = ""; try { raw = readFileSync(f, "utf8"); } catch { continue; }
    for (const m of raw.matchAll(/\bfrom\s+["'`]([^"'`\n]+)["'`]|\bimport\s*\(\s*["'`]([^"'`\n]+)["'`]\s*\)/g)) {
      const r = resolveSpec(m[1] ?? m[2], f);
      if (r && !seen.has(r)) stack.push(r);
    }
  }
  return seen;
}
const AUDIT_PATH = auditReachable(AUDIT_ROOTS);
// A static template is audit-bound when it carries binding slots the view-model fills.
// Binding slots OR a client-side fetch of audit rows. run-audit.html has no data-field slots — it fetches
// /api/audits and builds each row in JS — so a slots-only test would have called it static. It carries no
// prose above the word threshold today, so this is a LATENT false negative rather than a live one, but it is
// the same class as the two coverage misses already found and is closed here rather than waited for.
const TEMPLATE_BOUND = /data-field=|\{\{\s*[a-z_.]+\s*\}\}|id="digest-data"|data-audit|\/api\/audits?\b|verdictOf\s*\(|fetchRecentAudits/i;
const bindsAuditData = new Map<string, boolean>();

type Hit = { file: string; line: number; kind: "template" | "string"; text: string; interpolated: boolean; specific: boolean };
const hits: Hit[] = [];

for (const t of TARGETS) {
  for (const f of walk(join(ROOT, t))) {
    const raw = readFileSync(f, "utf8");
    const src = blankComments(raw);
    const rel = f.replace(ROOT + "/", "");
    bindsAuditData.set(rel, AUDIT_PATH.has(f) || TEMPLATE_BOUND.test(raw));

    // template literals: capture, then keep only the QUASIS (literal parts between ${...})
    for (const m of src.matchAll(/`(?:\\.|[^`\\])*`/gs)) {
      const body = m[0].slice(1, -1);
      const interpolated = /\$\{/.test(body);
      for (const chunk of body.split(/\$\{[^}]*\}/s)) {
        const txt = chunk.replace(/\s+/g, " ").trim();
        if (words(txt) < MIN_WORDS) continue;
        if (/^[<>/\s]*[a-z]+[ >]/.test(txt) && /<\/?[a-z]/i.test(txt)) continue; // HTML chrome, not prose
        if (isNotProse(txt)) continue;
        hits.push({ file: rel, line: lineOf(src, m.index!), kind: "template", text: txt, interpolated, specific: SPECIFIC.test(txt) });
      }
    }
    // HTML text nodes. Adding .html to the walk was NOT enough and I shipped that as a "fix" for one run:
    // the extractors above only see backtick templates and `field: "string"` pairs, neither of which exists in
    // an HTML file, so the served template still returned ZERO hits while the census reported itself fixed.
    // That is the same shape as everything else this arc is about — a change that looks like coverage and is
    // not. Real extraction: strip script/style, drop tags, keep the text a customer actually reads.
    if (/\.html$/.test(f)) {
      const text = raw
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ");
      for (const m of text.matchAll(/>([^<>]{25,})</g)) {
        const txt = m[1].replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
        if (words(txt) < MIN_WORDS) continue;
        if (isNotProse(txt)) continue;
        hits.push({ file: rel, line: lineOf(text, m.index!), kind: "string", text: txt, interpolated: false, specific: SPECIFIC.test(txt) });
      }
      continue;
    }
    // plain string literals assigned to a field
    for (const m of src.matchAll(/(?:^|[\s,{(])([a-z_][a-zA-Z_]*)\s*:\s*("(?:\\.|[^"\\])*")/g)) {
      const txt = m[2].slice(1, -1).replace(/\s+/g, " ").trim();
      if (words(txt) < MIN_WORDS) continue;
      hits.push({ file: rel, line: lineOf(src, m.index!), kind: "string", text: txt, interpolated: false, specific: SPECIFIC.test(txt) });
    }
  }
}

const specific = hits.filter((h) => h.specific);
const inScope = specific.filter((h) => bindsAuditData.get(h.file));
const outScope = specific.filter((h) => !bindsAuditData.get(h.file));
const byFile = new Map<string, Hit[]>();
for (const h of inScope) { if (!byFile.has(h.file)) byFile.set(h.file, []); byFile.get(h.file)!.push(h); }

console.log(`\nNARRATIVE-SITE INVENTORY — derived ${new Date().toISOString().slice(0, 10)}`);
console.log(`total sentence-like literal chunks: ${hits.length}`);
console.log(`of those, chunks naming something SPECIFIC about the world: ${specific.length}`);
console.log(`files carrying them: ${byFile.size}`);
console.log(`  AUDIT-NARRATIVE (binds per-audit data → V2 IN SCOPE): ${inScope.length} sites, ${new Set(inScope.map((h) => h.file)).size} files`);
console.log(`  STATIC/MARKETING (same bytes every visitor → OUT of V2): ${outScope.length} sites, ${new Set(outScope.map((h) => h.file)).size} files\n`);
console.log("OUT-OF-SCOPE files (recorded, not ignored — they just cannot fabricate a per-audit fact):");
console.log("  " + [...new Set(outScope.map((h) => h.file))].sort().join("\n  ") + "\n");
console.log("These are sentences we can emit to a customer WITHOUT consulting the record. Each one is either");
console.log("(a) generic and unfalsifiable, (b) grounded elsewhere, or (c) an assertion we cannot support.");
console.log("The registry design classifies them; this tool only guarantees none is missing.\n");

for (const [file, hs] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`── ${file}  (${hs.length})`);
  for (const h of hs.sort((a, b) => a.line - b.line)) {
    const t = h.text.length > 150 ? h.text.slice(0, 149) + "…" : h.text;
    console.log(`   :${String(h.line).padEnd(5)} ${h.interpolated ? "[tpl]" : "[lit]"} ${t}`);
  }
  console.log("");
}
