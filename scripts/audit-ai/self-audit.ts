// ENGINE SELF-AUDIT — "do we ever audit what we built?" (CEO, 2026-07-31). Until now: no. There is no CI in this
// repo, so the 127 suites ran only when someone remembered. Everything below is $0, deterministic, and makes no
// model call or network call except the flag census, which degrades to SKIP without Railway.
//
// WHAT THIS CAN AND CANNOT DO — read this before trusting a green run.
//   CAN   catch SILENT REGRESSION: a suite that starts failing, a parked module that gets re-wired, a flag set in
//         production that no code reads, a verdict-critical module that loses its test, two certs asserting
//         opposite things.
//   CANNOT find a defect that no test encodes. Every serious defect in the REPORT-TRUTH arc — the false PWS claim,
//         the softened site-visit obligation, the token-subset over-refute — was found by adversarial review while
//         the suites were green. This is a floor, not a substitute for the review battery.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const LIB = join(ROOT, "src", "lib");
type Result = { name: string; ok: boolean; skipped?: boolean; detail: string };
const results: Result[] = [];
const add = (name: string, ok: boolean, detail: string, skipped = false) => results.push({ name, ok, detail, skipped });
const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const want = (k: string) => only.length === 0 || only.includes(k);

/** 1 · SUITES — every unit suite in src/lib. The check that would catch a regression between sessions.
 *  EXIT CODE 3 = "this suite needs banked run-records that are not in the repository" (corpus-fixture.ts).
 *  It is reported as a NAMED SKIP, never folded into the pass count — because three suites spent months
 *  passing only on the author's machine, against 74 MB of untracked data, and that green was being counted.
 *  Every other non-zero exit is still a hard failure. The skip cannot spread quietly: a suite has to call
 *  requireCorpus() to earn it. */
if (want("suites")) {
  const files = readdirSync(LIB).filter((f) => f.endsWith(".test.ts")).sort();
  const failed: string[] = [], skipped: string[] = [];
  for (const f of files) {
    try { execFileSync("npx", ["tsx", join(LIB, f)], { stdio: "pipe", cwd: ROOT }); }
    catch (e) {
      if ((e as { status?: number }).status === 3) skipped.push(f.replace(/\.test\.ts$/, ""));
      else failed.push(f);
    }
  }
  const ran = files.length - failed.length - skipped.length;
  add("suites", failed.length === 0,
    `${ran}/${files.length - skipped.length} passed`
    + (skipped.length ? ` · ${skipped.length} SKIPPED (no banked corpus): ${skipped.join(", ")}` : "")
    + (failed.length ? ` · FAILING: ${failed.join(", ")}` : ""));
}

/** 2 · GOLD INTEGRITY — the frozen judgment fixtures. */
if (want("gold")) {
  try {
    const out = execFileSync("npx", ["tsx", "scripts/audit-ai/verify-gold-integrity.ts"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
    add("gold", /ALL PASS/.test(out), (out.trim().split("\n").pop() || "").slice(0, 120));
  } catch (e) { add("gold", false, `threw: ${String((e as Error).message).slice(0, 100)}`); }
}

/** 3 · FLAG CENSUS — production flags that no code reads, using the ENGINE'S OWN tolerant parser.
 *  isEnvOn accepts true/1/yes/on. Every ad-hoc verification in the REPORT-TRUTH arc tested `=== "true"`, which is
 *  NARROWER than the engine: a dashboard-set "1" would have been reported OFF while the engine ran it ON. This
 *  check exists so the drift is measured by the same rule the engine applies. */
if (want("flags")) {
  const isEnvOn = (v: string | undefined) => v != null && ["true", "1", "yes", "on"].includes(v.trim().toLowerCase());
  let live: string[] = [];
  try {
    const kv = execFileSync("railway", ["variables", "--service", "audit-worker", "--kv"], { encoding: "utf8", stdio: "pipe" });
    live = kv.split("\n").filter((l) => /^AUDIT_/.test(l));
  } catch { live = []; }
  if (!live.length) add("flags", true, "SKIP — railway CLI unavailable (CI or offline)", true);
  else {
    const referenced = new Set(grepAll(/AUDIT_[A-Z0-9_]+/g, ["src", "agents"]));
    const keys = live.map((l) => l.split("=")[0]);
    // A key containing whitespace is not a flag — it is a MALFORMED VARIABLE, almost always a mangled
    // `railway variables --set "A B C=true"` that stored the whole list as one name. Reported separately, because
    // lumping it in with orphans hides a config defect behind a vocabulary problem. (Found on the first run: a
    // 790-character key holding 30 flag names, value "true", read by nothing.)
    const malformed = keys.filter((k) => /\s/.test(k));
    const orphans = keys.filter((k) => !/\s/.test(k) && !referenced.has(k));
    const on = live.filter((l) => isEnvOn(l.split("=").slice(1).join("=")));
    const detail = `${on.length} ON of ${live.length} set · ${referenced.size} referenced in code`
      + ` · orphans: ${orphans.length ? orphans.join(", ") : "none"}`
      + (malformed.length ? ` · MALFORMED KEYS: ${malformed.length} (first ${malformed[0].split(/\s+/).length} tokens, ${malformed[0].length} chars)` : "");
    add("flags", orphans.length === 0 && malformed.length === 0, detail);
  }
}

/** 4 · PARKED SEAMS — a parked module must stay unreachable. REPORT-TRUTH #8 was parked because it could soften a
 *  real obligation; the seam was DELETED rather than flag-gated precisely so a stray edit cannot revive it. This
 *  check is what makes that decision durable across sessions. */
if (want("parked")) {
  // The registry is DERIVED, not hardcoded. A module declares itself parked with a `PARKED <date>` banner and a
  // `PARKED-FLAG:`/`PARKED-EXPORT:` line; this check then enforces that nothing reaches it. A hardcoded list would
  // have been wrong the moment it was written — the first version listed REPORT-TRUTH #8, which is parked on its
  // own branch and still wired on main, so the check reported a failure that was really just branch skew. Deriving
  // it means the check is true on every branch and needs no maintenance when the next module is parked.
  const bad: string[] = [];
  let parkedCount = 0;
  for (const f of readdirSync(LIB).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
    const src = readFileSync(join(LIB, f), "utf8");
    if (!/PARKED \d{4}-\d{2}-\d{2}/.test(src)) continue;
    parkedCount++;
    const mod = f.replace(/\.ts$/, "");
    for (const m of src.matchAll(/PARKED-FLAG:\s*([A-Z0-9_]+)/g)) {
      const readers = grepFiles(new RegExp(`process\\.env\\.${m[1]}`), ["src", "agents"]).filter((x) => !x.includes(".test.") && !x.includes(mod));
      if (readers.length) bad.push(`${m[1]} read by ${readers.join(", ")}`);
    }
    for (const m of src.matchAll(/PARKED-EXPORT:\s*(\w+)/g)) {
      const callers = grepFiles(new RegExp(`\\b${m[1]}\\s*\\(`), ["src", "agents"]).filter((x) => !x.includes(".test.") && !x.includes(mod));
      if (callers.length) bad.push(`${m[1]}() called by ${callers.join(", ")}`);
    }
  }
  add("parked", bad.length === 0, bad.length ? bad.join(" · ") : `${parkedCount} parked module(s), all unreachable`);
}

/** 5 · VERDICT-CRITICAL COVERAGE — the Tier-V touch-set from ceo/REVIEW-BATTERY.md must each carry a direct suite.
 *  Indirect coverage through importers is real but is not a spec; a module that decides a verdict needs its own. */
if (want("coverage")) {
  const TIER_V = ["audit-decide", "audit-gate-v2", "audit-findings", "audit-orchestrator", "audit-absence-reconcile"];
  // KNOWN GAPS exist so CI is not red from birth — but they are printed LOUDLY on every run and a NEW gap still
  // fails. A silent allowlist is how a gap becomes permanent; this one is meant to be emptied, not grown.
  // audit-findings: 23 importers, verdict-critical, no direct suite. Covered only indirectly today.
  const KNOWN_GAPS = new Set(["audit-findings"]);
  const missing = TIER_V.filter((m) => existsSync(join(LIB, `${m}.ts`)) && !readdirSync(LIB).some((f) => f.startsWith(`${m}`) && f.endsWith(".test.ts")));
  const unexpected = missing.filter((m) => !KNOWN_GAPS.has(m));
  const allMods = readdirSync(LIB).filter((f) => f.startsWith("audit-") && f.endsWith(".ts") && !f.endsWith(".test.ts"));
  const untested = allMods.filter((f) => !readdirSync(LIB).some((t) => t.startsWith(f.replace(/\.ts$/, "")) && t.endsWith(".test.ts")));
  const known = missing.filter((m) => KNOWN_GAPS.has(m));
  add("coverage", unexpected.length === 0,
    `${unexpected.length ? `NEW Tier-V gap: ${unexpected.join(", ")} · ` : ""}`
    + `${known.length ? `⚠ KNOWN GAP (tracked, must be closed): ${known.join(", ")} · ` : ""}`
    + `overall ${allMods.length - untested.length}/${allMods.length} audit-* modules have a direct suite`);
}

/** 6 · CERT COHERENCE — two certs asserting opposite things is worse than no cert, because whichever runs first
 *  looks authoritative. `_cert-rt8-wiring.ts` survived the #8 park still asserting the seam WAS flag-gated. */
if (want("certs")) {
  const certs = readdirSync(join(ROOT, "scripts", "audit-ai")).filter((f) => /^_cert-.*\.ts$/.test(f));
  const stale: string[] = [];
  for (const c of certs) {
    const src = readFileSync(join(ROOT, "scripts", "audit-ai", c), "utf8");
    for (const m of src.matchAll(/process\.env\.(AUDIT_[A-Z0-9_]+) === "true"/g)) {
      const flag = m[1];
      const readInProd = grepFiles(new RegExp(`process\\.env\\.${flag}`), ["src", "agents"]).filter((f) => !f.includes(".test."));
      if (!readInProd.length && /=== "true"/.test(src)) stale.push(`${c} asserts on ${flag}, which no production code reads`);
    }
  }
  add("certs", stale.length === 0, stale.length ? stale.join(" · ") : `${certs.length} certs, none asserting a dead flag`);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out); else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}
function grepFiles(re: RegExp, dirs: string[]): string[] {
  const hit: string[] = [];
  for (const d of dirs) { if (!existsSync(join(ROOT, d))) continue; for (const f of walk(d)) { if (re.test(readFileSync(join(ROOT, f), "utf8"))) hit.push(f); } }
  return hit;
}
function grepAll(re: RegExp, dirs: string[]): string[] {
  const out: string[] = [];
  for (const d of dirs) { if (!existsSync(join(ROOT, d))) continue; for (const f of walk(d)) { for (const m of readFileSync(join(ROOT, f), "utf8").matchAll(re)) out.push(m[0]); } }
  return out;
}

const failed = results.filter((r) => !r.ok);
console.log("\n══ ENGINE SELF-AUDIT ══");
for (const r of results) console.log(`  ${r.skipped ? "○" : r.ok ? "✓" : "✗"} ${r.name.padEnd(10)} ${r.detail}`);
console.log(failed.length ? `\n✗ ${failed.length} CHECK(S) FAILED` : "\n✓ ALL CHECKS PASS — no silent regression detected (this is a floor, not a substitute for the review battery)");
process.exit(failed.length ? 1 : 0);
