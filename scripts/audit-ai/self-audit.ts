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
    // READ, not merely NAMED. The first version of this check counted any occurrence of the flag name as a
    // reference — so AUDIT_AGENTIC_PRIMARY and AUDIT_ENGINE_V2 passed as "referenced" on the strength of a
    // boot-log string array in agents/audit-worker/index.ts, months after commit 5dc9b18d deleted the only
    // code that read them. A census whose denominator is "the name appears somewhere" cannot find a dead
    // flag, which is the one thing it exists to find. A read is the name inside an env ACCESS.
    // The `env.AUDIT_X` form is a read too — several gates take `env: NodeJS.ProcessEnv = process.env` as a
    // parameter so they can be tested without mutating the real environment. Omitting it reported
    // AUDIT_JUDGMENT_LAYER and AUDIT_SETASIDE_OVERTYPE_GUARD as orphans while both are read on every run:
    // a census that condemns a live flag is as useless as one that clears a dead one.
    const readSites = new Set(
      grepAll(/(?:process\.)?env\.(AUDIT_[A-Z0-9_]+)|process\.env\[\s*["'](AUDIT_[A-Z0-9_]+)["']\s*\]/g, ["src", "agents"])
        .map((m) => (m.match(/AUDIT_[A-Z0-9_]+/) ?? [""])[0]),
    );
    // A flag reached through a named constant (`process.env[EXCERPT_HEAD_REGROUND_FLAG]`) is a real read the
    // pattern above cannot see, so string constants holding a flag name count too. Narrower than "appears
    // anywhere" — a name inside an array literal of log labels is still not a read.
    for (const m of grepAll(/=\s*["'](AUDIT_[A-Z0-9_]+)["']\s*;/g, ["src", "agents"])) {
      const k = (m.match(/AUDIT_[A-Z0-9_]+/) ?? [""])[0];
      if (k) readSites.add(k);
    }
    const referenced = readSites;
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

/** 3b · FLAG PARSE UNIFORMITY — every env flag must go through src/lib/env-flags.ts. Check 3 finds flags that no
 *  code reads; this finds flags the code reads WRONG. They are different failures: a flag can be read at 191 sites
 *  and still be mis-parsed at every one of them. Unlike the census this needs no network, so it never SKIPs. */
if (want("parse")) {
  try {
    const out = execFileSync("npx", ["tsx", "scripts/audit-ai/_cert-env-flag-parse-uniformity.ts"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
    add("parse", /✅ CLEAN/.test(out), (out.trim().split("\n").pop() || "").trim().slice(0, 120));
  } catch (e) {
    const out = String((e as { stdout?: string }).stdout ?? "");
    const hits = out.split("\n").filter((l) => /bypass src\/lib\/env-flags/.test(l));
    add("parse", false, hits[0]?.trim() || `threw: ${String((e as Error).message).slice(0, 100)}`);
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
  // MEMBERSHIP IS BY DECLARATION, NOT BY MENTION (corrected 2026-08-04). Deriving the registry from "the file says
  // PARKED <date>" put audit-executor-v3.ts — the SHIPPING file — in the registry, because it carries a comment
  // explaining the park. It reported "2 parked module(s)" for one parked module.
  //
  // AND THE ENFORCEMENT WAS INERT: neither file declared a single PARKED-FLAG or PARKED-EXPORT, so both inner loops
  // iterated ZERO times and the check printed "all unreachable" — a claim it had never tested — for the whole of its
  // existence. It is the check that makes the CEO's #8 park durable, on a gate parked for UNDER-WARNING a bidder.
  // Found by a negative control: restoring a deleted armer did not turn it red.
  //
  // So a banner without declarations is now a FAILURE, never a silent pass. That is the leg that would have caught
  // this, and it is why the count below is trustworthy rather than decorative.
  const bad: string[] = [];
  let parkedCount = 0;
  for (const f of readdirSync(LIB).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
    const src = readFileSync(join(LIB, f), "utf8");
    if (!/PARKED \d{4}-\d{2}-\d{2}/.test(src)) continue;
    const declares = /PARKED-FLAG:\s*[A-Z0-9_]+/.test(src) || /PARKED-EXPORT:\s*\w+/.test(src);
    // A file that only DISCUSSES a park (the executor's seam comment) is not a parked module and is not counted.
    if (!declares && !/NOT WIRED, NOT SHIPPING/.test(src)) continue;
    if (!declares) { bad.push(`${f} carries a PARKED banner but declares no PARKED-FLAG/PARKED-EXPORT — nothing is enforced`); continue; }
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
    // ...and no TOOLING may still arm the parked flag. Reachability alone was not enough: the #8 park left behind
    // BOTH a cert asserting the seam was still wired and a script that armed the dead flag on Vercel, and this
    // check reported "all unreachable" beside them. Arming a flag nothing reads is inert, which is exactly why it
    // is dangerous to leave lying around — it reads as a live control, and the next session finds a documented
    // arm procedure for a gate that was parked for under-warning a bidder. Both were deleted 2026-08-04; this is
    // what stops the third one. Scoped to arm/enable tooling, so a disarm script stays legitimate.
    for (const m of src.matchAll(/PARKED-FLAG:\s*([A-Z0-9_]+)/g)) {
      const armers = grepFiles(new RegExp(`${m[1]}`), ["scripts"])
        .filter((x) => /(^|\/)_?(arm|enable)[-_]/i.test(x) && !x.includes("disarm"));
      if (armers.length) bad.push(`${m[1]} still armed by ${armers.join(", ")}`);
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

/** 7 · STALE BLOCKERS — a backlog item marked blocked whose blocker is GONE.
 *
 *  WHY: `status_normalized: blocked_chain` is set by hand and NOTHING re-checks it when the cause disappears, so an
 *  item keeps reading as "not your problem yet" long after it became actionable. Measured 2026-08-04 across the 22
 *  blocked items: only TWO name a dependency that resolves to a real backlog id. SEQ4-FIRE waited on
 *  FA-640-EFFMAP, closed 2026-07-26 as superseded and no longer in the backlog at all; SEQ5-ROOTS and
 *  CERT-PROVENANCE-RULING record NO blocker of any kind. Three P0s sat behind blockers that did not exist.
 *
 *  WHAT COUNTS AS A FAILURE — two shapes, both meaning "this can never be re-checked or is provably resolved":
 *    (a) blocked with NEITHER waiting_on NOR blocker_reason — nothing records why, so nothing can ever clear it;
 *    (b) waiting_on names an id that is ABSENT from the backlog, or present and already closed.
 *
 *  waiting_on holding PROSE instead of an id (Rule 52 says it is an FA-N reference) is counted and NAMED rather
 *  than failed: it is a schema debt, not a stale blocker, and failing it would make this check red from birth,
 *  which is how a check gets narrowed until it is inert. It is printed on every run so the number is visible.
 *
 *  KNOWN list follows the `coverage` convention exactly — printed loudly, meant to be emptied, and a NEW stale
 *  blocker still fails. Deliberately NOT auto-fixed: SEQ4-FIRE's own record says "Not silently unblocked by Code",
 *  and unblocking is a CEO ruling. This check SURFACES, it does not decide. */
if (want("blockers")) {
  const DIGEST = join(ROOT, "ceo", "digest-data.json");
  if (!existsSync(DIGEST)) {
    // ceo/ is gitignored and absent in worktrees and CI — a NAMED SKIP, never a silent pass.
    add("blockers", true, "SKIP — ceo/digest-data.json not present (gitignored; runs from the primary checkout)", true);
  } else {
    const items = (JSON.parse(readFileSync(DIGEST, "utf8")).action_items || []) as Array<Record<string, string>>;
    const byId = new Map(items.map((i) => [i.id, i]));
    const CLOSED = new Set(["done", "closed", "shipped", "complete"]);
    const BLOCKED = new Set(["blocked_chain", "blocked_external"]);
    // KNOWN is meant to be EMPTIED, and on 2026-08-04 it went from 9 entries to 2 in a single pass. Six were
    // cleared on a CEO ruling and are REMOVED here rather than left listed: an id kept in KNOWN after it stops
    // violating is a silent exemption — the item would be free to regress and this check would stay green.
    //   CLEARED  V5-OOS-ELIG-TILE     → actionable_now (nothing was ever recorded; ready_state was already `go`)
    //   CLEARED  CLAUDEMD-FULL-AUDIT  → monitor (ready_state is `monitor`; promoting it would misreport it)
    //   CLEARED  FA-4                 → monitor (event-driven — a third party accepting a connection)
    //   CLEARED  FA-12 · FA-13 · BUNDLE-STRIPE → blocker RE-POINTED, still blocked_external. NOT promoted: each
    //            names a real bank dependency (Mercury funding, card issuance, account state) that was never a
    //            backlog row. Flipping the money path to actionable would report that a customer can pay.
    //   CLEARED  CERT-PROVENANCE-RULING — never actually flagged; its status is `today`, not blocked. Listing it
    //            was defensive clutter, and a KNOWN entry that cannot fire teaches nothing.
    // The two that remain are the two the CEO reserved to rule on himself.
    //   SEQ4-FIRE   blocker cites FA-640-EFFMAP, closed 2026-07-26 as superseded and gone from the backlog
    //   SEQ5-ROOTS  blocked_chain with no waiting_on and no blocker_reason; engineering done and armed
    const KNOWN = new Set(["SEQ4-FIRE", "SEQ5-ROOTS"]);
    const stale: string[] = [];
    let prose = 0, resolved = 0;
    for (const i of items) {
      if (!BLOCKED.has(i.status_normalized)) continue;
      const w = (i.waiting_on || "").trim();
      const b = (i.blocker_reason || "").trim();
      if (!w && !b) { stale.push(`${i.id}: blocked with no waiting_on and no blocker_reason — nothing can ever clear it`); continue; }
      // A blocker written as PROSE still cites its dependency, and the specimen that motivated this whole check is
      // exactly that shape: SEQ4-FIRE's blocker names FA-640-EFFMAP, closed 2026-07-26 and gone from the backlog.
      // Skipping prose would have made this check miss the case it was built for — the same way the cert-coherence
      // check missed the one cert its own comment named. So prose IS scanned, but only for the `FA-N` family, which
      // is the one id shape this backlog uses unambiguously. HONEST LIMIT, stated rather than implied: a dependency
      // cited in prose under any other style is NOT machine-checkable here and is not claimed to be. Deriving the
      // shape from the data mattered — a general "CAPS-with-hyphens" pattern also matched RE-DECIDING, CERT-5 and
      // R5-R7, and a check that cries wolf gets narrowed until it is inert.
      for (const tok of new Set((b.match(/\bFA-\d+(?:-[A-Z0-9]+)*\b/g) || []))) {
        const cited = byId.get(tok);
        if (!cited) stale.push(`${i.id}: blocker cites ${tok}, which is NOT in the backlog`);
        else if (CLOSED.has(cited.status_normalized)) stale.push(`${i.id}: blocker cites ${tok}, which is ${cited.status_normalized}`);
      }
      if (!w) continue;
      if (w.length > 40 || /\s/.test(w.replace(/^[A-Z0-9-]+$/, ""))) { prose++; continue; }
      const dep = byId.get(w);
      if (!dep) { stale.push(`${i.id}: waiting_on ${w}, which is NOT in the backlog`); continue; }
      if (CLOSED.has(dep.status_normalized)) { stale.push(`${i.id}: waiting_on ${w}, which is ${dep.status_normalized}`); continue; }
      resolved++;
    }
    const uniq = [...new Set(stale)];                     // one item can be caught by both legs; report it once
    const fresh = uniq.filter((s) => !KNOWN.has(s.split(":")[0]));
    const known = [...new Set(uniq.filter((s) => KNOWN.has(s.split(":")[0])).map((s) => s.split(":")[0]))];
    add("blockers", fresh.length === 0,
      `${fresh.length ? `NEW stale blocker: ${fresh.join(" · ")} · ` : ""}`
      + `${known.length ? `⚠ ${known.length} KNOWN stale blocker(s), awaiting a CEO ruling (must be emptied): ${known.join(", ")} · ` : ""}`
      + `${resolved} blocker(s) resolve to an open item · ${prose} waiting_on hold prose, not an id (Rule 52)`);
  }
}

/** 6 · CERT COHERENCE — two certs asserting opposite things is worse than no cert, because whichever runs first
 *  looks authoritative. `_cert-rt8-wiring.ts` survived the #8 park still asserting the seam WAS flag-gated.
 *
 *  THIS CHECK WAS A PLACEBO UNTIL 2026-08-04, and the way it failed is the lesson. It scanned for
 *  `process.env.AUDIT_X === "true"` INSIDE the cert — but a cert does not read the flag, it greps the EXECUTOR
 *  for the guard, so the assertion is written as a bare regex literal:
 *      ok("seam is flag-gated", /AUDIT_FORCE_GROUNDING === "true"/.test(src))
 *  No `process.env.` prefix, no match, zero hits in the exact file the comment above names. It reported
 *  "59 certs, none asserting a dead flag" on every push while that specimen sat RED in the same directory.
 *
 *  TWO REWRITES WERE WRONG BEFORE THIS ONE, both for the same reason — they tried to RECOGNIZE the assertion.
 *  Cut 1 scanned every AUDIT_* token on a non-comment line: three false positives, because `const AUDIT_ID = "..."`
 *  and a `process.env.X = "true"` setup line mention a token while asserting nothing. Cut 2 restricted to lines
 *  containing `ok(` — and its fail-closed leg immediately reported 24 certs it could not read, because this corpus
 *  has no single assertion helper (`ok(`, `probe(`, `run(`, and bare inline ✓/✗ all appear). Recognizing the
 *  assertion is the treadmill; there is always a next spelling.
 *
 *  WHAT IS CHECKED INSTEAD needs no convention, no polarity and no line classification. A cert that embeds the
 *  literal guard `AUDIT_X === "true"` is, by embedding it, asserting production CONTAINS that guard. So: find the
 *  guards each cert embeds, and require production to actually contain them. The park shape passes by
 *  construction — `!/process\.env\.AUDIT_FORCE_GROUNDING/.test(ex)` embeds no `=== "true"` guard — and so do the
 *  setup line (single `=`) and the const binding (never `AUDIT_ID === "true"`). Zero false positives by shape,
 *  not by exemption. */
if (want("certs")) {
  const certs = readdirSync(join(ROOT, "scripts", "audit-ai")).filter((f) => /^_cert-.*\.ts$/.test(f));
  const stale: string[] = [];
  let claims = 0;
  for (const c of certs) {
    const src = readFileSync(join(ROOT, "scripts", "audit-ai", c), "utf8");
    // A guard claim is embedded in EITHER spelling. Production was routed through env-flags.isEnvOn on
    // 2026-08-04; a matcher pinned to `=== "true"` reported three healthy certs stale the moment the parser
    // changed, which is the same defect one layer up — asserting the SPELLING of a guard instead of the guard.
    const embedded = new Set([
      ...[...src.matchAll(/\b(AUDIT_[A-Z0-9_]+) === "true"/g)].map((m) => m[1]),
      ...[...src.matchAll(/isEnvOn\(process\.env\.(AUDIT_[A-Z0-9_]+)\)/g)].map((m) => m[1]),
    ]);
    for (const flag of embedded) {
      claims++;
      const guard = new RegExp(`${flag} === "true"|isEnvOn\\(process\\.env\\.${flag}\\)|isEnvOff\\(process\\.env\\.${flag}\\)`);
      const inProd = grepFiles(guard, ["src", "agents"]).filter((f) => !f.includes(".test."));
      if (!inProd.length) stale.push(`${c} asserts production guards on ${flag}, but no production code contains that guard`);
    }
  }
  add("certs", stale.length === 0,
    stale.length ? stale.join(" · ") : `${certs.length} certs, ${claims} guard claims, all present in production`);
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
