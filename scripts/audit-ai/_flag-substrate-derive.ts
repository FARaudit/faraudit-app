// FLAG-SUBSTRATE DERIVER — answers "which flags are on the wrong platform?" by COMPUTING it, never by
// reading a recorded number.
//
// WHY THIS EXISTS. The board carried "four render flags are stranded." A hand check said five. The truth was
// two. Every one of those numbers was maintained by hand and every one of them was wrong, in a repo that
// already has a written lesson (L44) about flags on the wrong platform shipping a fabrication to customers.
// A count that has been wrong three times is not a count, it is a rumour. So: derive it.
//
// METHOD (nothing here is a name-match — name-matching is what produced the "five"; one of those five was a
// flag mentioned in a COMMENT, not read at all):
//   1. Find every `process.env.AUDIT_*` READ in src/ + agents/, with comments blanked by a real scanner
//      (see stripComments — the regex version silently ate live code).
//   2. Build the import graph and compute reachability from two roots:
//        · WORKER root  = agents/audit-worker/*        → runs on RAILWAY (computes the verdict)
//        · RENDER roots = the report builders/renderers    → run on VERCEL  (render the customer report)
//      A file reachable from BOTH is SHARED and is reported as undecidable, never guessed either way.
//   3. Read what is actually armed on each substrate, live, by execution.
//   4. NEEDS (derived) vs ARMED (live) ⇒ the verdict per flag.
//
// Output is the answer, not a number to copy into a file. Re-run it instead of trusting any prior run.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = resolve(__dirname, "../..");
const SRC = join(ROOT, "src");
const AGENTS = join(ROOT, "agents");

// ── file walk ────────────────────────────────────────────────────────────────
function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    // Tests are excluded: a flag READ inside a .test.ts is a test exercising both branches, not a production
    // read. Counting them was the other half of the bogus "30 stranded" — several flags appeared render-facing
    // solely because a test file mentioned them.
    else if (/\.(ts|tsx|mts|cts)$/.test(e) && !/\.d\.ts$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

// Blank out COMMENTS ONLY, with a real single-pass scanner.
//
// The first version did this with chained regexes and it silently ate live code. Order was the trap: strip
// `//` comments first and any backtick INSIDE a comment disappears, which unbalances the template-literal
// regex, so a later `/`...`/` match spans from one template across unrelated code into the next. That is how
// `AUDIT_COVERAGE_DISPLAY_COHERENT` — a genuine read at v4-report/render.ts:120 — vanished from the results
// while a comment two lines above it was correctly ignored. A deriver that loses real reads is worse than the
// hand count it replaces, because it looks rigorous.
//
// Strings and templates are NOT blanked, only comments. `process.env.X` is unambiguous as a read; the only
// thing we needed to suppress was a flag NAMED in prose, and prose lives in comments.
function stripComments(s: string): string {
  const out: string[] = [];
  type St = "code" | "line" | "block" | "sq" | "dq" | "tpl";
  let st: St = "code";
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (st === "code") {
      if (c === "/" && n === "/") { st = "line"; out.push("  "); i++; continue; }
      if (c === "/" && n === "*") { st = "block"; out.push("  "); i++; continue; }
      if (c === "'") st = "sq"; else if (c === '"') st = "dq"; else if (c === "`") st = "tpl";
      out.push(c); continue;
    }
    if (st === "line") { if (c === "\n") { st = "code"; out.push("\n"); } else out.push(" "); continue; }
    if (st === "block") {
      if (c === "*" && n === "/") { st = "code"; out.push("  "); i++; } else out.push(c === "\n" ? "\n" : " ");
      continue;
    }
    // inside a string/template: copy through, honour escapes, exit on the matching quote
    out.push(c);
    if (c === "\\") { if (i + 1 < s.length) { out.push(s[i + 1]); i++; } continue; }
    if ((st === "sq" && c === "'") || (st === "dq" && c === '"') || (st === "tpl" && c === "`")) st = "code";
  }
  return out.join("");
}

const files = [...walk(SRC), ...walk(AGENTS)];
const code = new Map<string, string>();
for (const f of files) { try { code.set(f, stripComments(readFileSync(f, "utf8"))); } catch { /* unreadable */ } }

// ── 1. flag reads ────────────────────────────────────────────────────────────
const readsByFlag = new Map<string, Set<string>>();
for (const [f, src] of code) {
  for (const m of src.matchAll(/process\.env\.(AUDIT_[A-Z0-9_]+)/g)) {
    const flag = m[1];
    if (!readsByFlag.has(flag)) readsByFlag.set(flag, new Set());
    readsByFlag.get(flag)!.add(f);
  }
  // bracket form: process.env["AUDIT_X"] survives string-stripping as process.env[""] — catch it on raw text.
  const raw = readFileSync(f, "utf8");
  for (const m of raw.matchAll(/process\.env\[\s*["'`](AUDIT_[A-Z0-9_]+)["'`]\s*\]/g)) {
    const flag = m[1];
    if (!readsByFlag.has(flag)) readsByFlag.set(flag, new Set());
    readsByFlag.get(flag)!.add(f);
  }
}

// ── 2. import graph + reachability ───────────────────────────────────────────
const CAND = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
function resolveSpec(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // bare package
  for (const ext of CAND) { const p = base + ext; if (existsSync(p) && statSync(p).isFile()) return p; }
  return null;
}
const edges = new Map<string, Set<string>>();
for (const [f, src] of code) {
  const out = new Set<string>();
  const specs = [
    ...src.matchAll(/\bfrom\s+["'`]([^"'`]+)["'`]/g),
    ...src.matchAll(/\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g),
    ...src.matchAll(/\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g),
  ];
  // the stripper blanks string bodies, so re-scan raw for specifiers only
  const raw = readFileSync(f, "utf8");
  const rawSpecs = [
    ...raw.matchAll(/\bfrom\s+["'`]([^"'`\n]+)["'`]/g),
    ...raw.matchAll(/\bimport\s*\(\s*["'`]([^"'`\n]+)["'`]\s*\)/g),
  ];
  for (const m of [...specs, ...rawSpecs]) {
    const r = resolveSpec(m[1], f);
    if (r) out.add(r);
  }
  edges.set(f, out);
}
function reach(roots: string[]): Set<string> {
  const seen = new Set<string>(); const stack = [...roots];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const n of edges.get(f) ?? []) if (!seen.has(n)) stack.push(n);
  }
  return seen;
}
// ROOTS — the distinction that matters is WHEN the flag executes, not what happens to be in the bundle.
//
// A first cut used "every src/app route" as the render root and called 30 flags stranded. That was wrong, and
// wrong in the direction that manufactures alarm: `audit-decide.ts` is import-reachable from a Next route, so
// every engine flag looked render-facing. But engine flags execute when the AUDIT is COMPUTED (on the worker)
// and their result is PERSISTED to compliance_json; at render time the report reads that persisted row. Being
// in the bundle is not being on the render path.
//
// So the roots are the actual entry FUNCTIONS of each phase, not the HTTP surface:
//   RENDER = the report builders/renderers that run per page view
//   WORKER = the audit-worker process that computes and persists
const RENDER_ENTRIES = [
  "src/lib/v5-report/report.ts", "src/lib/v5-report/render.ts",
  "src/lib/v5-report/render-pdf.ts", "src/lib/v5-report/render-deck.ts",
  "src/lib/v4-report/build-data.ts", "src/lib/v4-report/render.ts",
  "src/app/audits/[id]/_view-model.ts", "src/app/audits/[id]/_render.ts",
].map((p) => join(ROOT, p)).filter((p) => existsSync(p));
const workerRoots = files.filter((f) => f.startsWith(join(AGENTS, "audit-worker")));
const WORKER = reach(workerRoots);
const RENDER = reach(RENDER_ENTRIES);

// ── 3. live arm state, by execution ──────────────────────────────────────────
function railwayVars(): Map<string, string> {
  const m = new Map<string, string>();
  try {
    const out = execFileSync("railway", ["variables", "--service", "audit-worker", "--kv"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    for (const line of out.split("\n")) { const i = line.indexOf("="); if (i > 0 && line.startsWith("AUDIT_")) m.set(line.slice(0, i), line.slice(i + 1).trim()); }
  } catch { console.error("!! railway read FAILED — worker column is UNKNOWN, not absent"); return m; }
  return m;
}
function vercelKeys(): Set<string> | null {
  try {
    const out = execFileSync("node", [join(ROOT, "scripts/audit-ai/card214-vercel-env.mjs"), "list"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const s = new Set<string>();
    for (const m of out.matchAll(/^\s*(AUDIT_[A-Z0-9_]+)\s*::.*target=\[([^\]]*)\]/gm)) if (m[2].includes("production")) s.add(m[1]);
    return s;
  } catch { console.error("!! vercel read FAILED — render column is UNKNOWN, not absent"); return null; }
}

(async () => {
  const rail = railwayVars();
  const verc = vercelKeys();
  if (verc === null) { console.error("ABORT: cannot derive without both substrates. An absent read is not an absent flag."); process.exit(2); }

  const rows: { flag: string; needEngine: boolean; needRender: boolean; onRail: boolean; onVerc: boolean; verdict: string; where: string[] }[] = [];
  for (const [flag, fs_] of [...readsByFlag].sort()) {
    const where = [...fs_].map((f) => f.replace(ROOT + "/", ""));
    const needEngine = [...fs_].some((f) => WORKER.has(f));
    const needRender = [...fs_].some((f) => RENDER.has(f));
    const onRail = rail.get(flag) === "true";
    const onVerc = verc.has(flag);
    // VERDICT. The only class this can decide with certainty is RENDER-ONLY: read in a file reachable from a
    // report builder and NOT from the worker. Those must live on Vercel, full stop.
    //
    // A file reachable from BOTH is genuinely undecidable by static reachability — the read may execute at
    // audit time (worker computes, persists to compliance_json) or at render time. Calling those "stranded"
    // is how a first cut produced 30 false alarms. Guessing either way here would BE the uncomputed-default
    // class this whole arc exists to kill, so the deriver refuses: it reports SHARED and says what would
    // settle it. Compute or abstain — never default.
    let verdict: string;
    const renderOnly = needRender && !needEngine;
    const engineOnly = needEngine && !needRender;
    if (!needEngine && !needRender) verdict = "UNREACHED   (no live entrypoint reaches this read)";
    else if (renderOnly) verdict =
      onVerc ? "OK-RENDER   (render-only, armed on Vercel)"
      : onRail ? "STRANDED    (render-only, armed on RAILWAY, absent on Vercel — no-op for the report)"
      : "OFF-RENDER  (render-only, armed on neither)";
    else if (engineOnly) verdict =
      onRail ? "OK-ENGINE   (engine-only, armed on the worker)"
      : onVerc ? "MISPLACED   (engine-only, armed on Vercel only)"
      : "OFF-ENGINE  (engine-only, armed on neither)";
    else verdict = `SHARED      (undecidable statically — settle by execution) rail=${onRail ? "T" : "·"} vercel=${onVerc ? "T" : "·"}`;
    rows.push({ flag, needEngine, needRender, onRail, onVerc, verdict, where });
  }

  const stranded = rows.filter((r) => r.verdict.startsWith("STRANDED"));
  const shared = rows.filter((r) => r.verdict.startsWith("SHARED"));
  const offRender = rows.filter((r) => r.verdict.startsWith("OFF-RENDER"));
  console.log(`\nDERIVED ${new Date().toISOString().slice(0, 10)} — ${rows.length} AUDIT_* flags read in code`);
  console.log(`worker-reachable files: ${WORKER.size} · render-reachable files: ${RENDER.size}\n`);
  console.log("FLAG".padEnd(42) + "ENG RND RAIL VRC  VERDICT");
  for (const r of rows) {
    console.log(
      r.flag.padEnd(42) +
      (r.needEngine ? " ✓ " : " · ") + (r.needRender ? " ✓  " : " ·  ") +
      (r.onRail ? " ✓  " : " ·  ") + (r.onVerc ? " ✓  " : " ·  ") + r.verdict);
  }
  console.log(`\n── STRANDED (the answer; derived, not recorded): ${stranded.length} ──`);
  for (const r of stranded) { console.log(`  ${r.flag}`); for (const w of r.where) console.log(`      read at ${w}`); }
  if (!stranded.length) console.log("  none");
  console.log(`\n── OFF-RENDER (render-only, armed nowhere): ${offRender.length} ──`);
  for (const r of offRender) console.log(`  ${r.flag}  ← ${r.where.join(", ")}`);
  if (!offRender.length) console.log("  none");
  console.log(`\n── SHARED / undecidable statically: ${shared.length} ──`);
  console.log("  These are read in modules reachable from BOTH the worker and a report builder. Static");
  console.log("  reachability cannot say whether the read fires at audit time or render time. Settle each by");
  console.log("  EXECUTION (log the read on a live render) before arming or alarming — do not default.");
  for (const r of shared) console.log(`  ${r.flag}`);
  console.log("");
})();
