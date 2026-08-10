// CLAIM↔EXCERPT ENTAILMENT — the flag split. Pure fixtures, no database, no network, no model call.
//
// WHY THIS SUITE EXISTS. The entailment guard (cards #372/#373) was built, proven, and dark: all three of its
// parts read ATTACHMENT_COVERAGE_ENABLED, and that flag also switches on the coverage-lens pre-inject, which
// exhausted the 270s budget on two live runs. So the only way to arm a correctness guard was to re-introduce a
// known wall-clock regression, and the guard stayed off. This splits it onto AUDIT_CLAIM_ENTAILMENT.
//
// THE LOAD-BEARING ASSERTIONS ARE THE INDEPENDENCE ONES. Proving the guard fires is easy and _prove-card373
// already does it. What this suite has to prove is that the split is REAL — that the new flag arms the
// entailment signal and NOTHING ELSE, and that the old flag still arms both (nobody's configuration changes).
//
// It lives in src/lib/*.test.ts deliberately: CI's `suites` leg globs this directory only, so the seven
// hand-written verifier gates under scripts/audit-ai/ never run on a push. This one does.
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { if (c) pass++; else { fail++; console.log(`  ✗ ${l}`); } };

// CI's suites leg spawns each suite with cwd = repo root (self-audit.ts), so this resolves there and in a
// hand-run from the root alike. Anchored on the repo root rather than import.meta, which tsx's CJS output
// does not provide.
const PROBE = join(process.cwd(), "scripts", "audit-ai", "_probe-entailment-flag.ts");

interface Shape {
  entailArmed: boolean; promptSaysOnly: boolean; schemaHasEntailmentFail: boolean;
  attestationsInSubmitSchema: boolean; readDocumentExposed: boolean;
}

/** Run the probe in a CHILD process with a given env. Required because ATTACHMENT_COVERAGE_ENABLED is a
 *  module-load const — the attachment-coverage arms are not reachable by mutating process.env in-process,
 *  and a suite that pretended otherwise would be asserting nothing. */
function run(env: Record<string, string>, args: string[] = []): unknown {
  const out = execFileSync("npx", ["tsx", PROBE, ...args], {
    env: { ...process.env, AUDIT_CLAIM_ENTAILMENT: "", AUDIT_ATTACHMENT_COVERAGE: "", AUDIT_LENS_DISCOVERY: "", ...env },
    encoding: "utf8",
  });
  return JSON.parse(out.trim().split("\n").pop()!);
}
const probe = (env: Record<string, string>) => run(env) as Shape;

// ── 1 · BOTH OFF — today's production shape. The guard is inert and the skeptic is told not to look. ────────
console.log("-- both flags OFF (production today) --");
{
  const p = probe({});
  ok("entailment NOT armed", p.entailArmed === false);
  ok("prompt still says 'Challenge ONLY the classification'", p.promptSaysOnly === true);
  ok("entailmentFail ABSENT from the response schema (the model cannot return it)", p.schemaHasEntailmentFail === false);
  ok("coverage sweep off: attestations ABSENT from submit_findings", p.attestationsInSubmitSchema === false);
  ok("read_document NOT exposed", p.readDocumentExposed === false);
}

// ── 2 · THE NEW FLAG ALONE — entailment arms, and NOTHING from the coverage sweep does. ─────────────────────
//
// This is the whole point of the change. If any coverage-sweep assertion below flips, the split is cosmetic:
// the new flag would be dragging the 270s pre-inject along behind it, which is the failure the old flag had.
console.log("-- AUDIT_CLAIM_ENTAILMENT alone --");
{
  const p = probe({ AUDIT_CLAIM_ENTAILMENT: "true" });
  ok("entailment ARMED", p.entailArmed === true);
  ok("prompt drops 'ONLY' — sufficiency is now in scope", p.promptSaysOnly === false);
  ok("entailmentFail PRESENT in the response schema", p.schemaHasEntailmentFail === true);
  ok("INDEPENDENCE: attestations still ABSENT from submit_findings", p.attestationsInSubmitSchema === false);
  ok("INDEPENDENCE: read_document still NOT exposed (no pre-inject, no token cost)", p.readDocumentExposed === false);
}

// ── 3 · THE OLD FLAG ALONE — unchanged behaviour. Nobody's configuration moves. ─────────────────────────────
console.log("-- AUDIT_ATTACHMENT_COVERAGE alone (backward compatibility) --");
{
  const p = probe({ AUDIT_ATTACHMENT_COVERAGE: "true" });
  ok("entailment STILL armed by the old flag", p.entailArmed === true);
  ok("prompt drops 'ONLY'", p.promptSaysOnly === false);
  ok("entailmentFail PRESENT in the response schema", p.schemaHasEntailmentFail === true);
  ok("coverage sweep still arms too: attestations PRESENT", p.attestationsInSubmitSchema === true);
  ok("coverage sweep still arms too: read_document exposed", p.readDocumentExposed === true);
}

// ── 4 · TOLERANT PARSE — a dashboard-set "True" must not silently leave the guard off. ──────────────────────
//
// Not hypothetical: AUDIT_AGENTIC_PRIMARY is set to "True" on the live worker today. It happens to have no
// runtime consumer, so it costs nothing — but the same hand set this value, and a correctness guard that a
// capital T disables is a guard that fails in exactly the way it is meant to prevent.
console.log("-- tolerant env parse --");
for (const v of ["True", "TRUE", " true ", "1", "yes", "on"]) {
  ok(`"${v}" arms the guard`, probe({ AUDIT_CLAIM_ENTAILMENT: v }).entailArmed === true);
}
for (const v of ["false", "False", "0", "no", "off", ""]) {
  ok(`"${v}" leaves the guard off`, probe({ AUDIT_CLAIM_ENTAILMENT: v }).entailArmed === false);
}

// ── 5 · THE DROP ITSELF — armed by the NEW flag, the hard-drop branch still dominates a re-type. ────────────
//
// _prove-card373 locks the branch ORDER under the old flag. This asserts the same dominance is reachable
// through the new one; without it, the split could arm the prompt and schema while leaving the drop dead.
console.log("-- hard-drop reachable through the new flag --");
{
  const r = run({ AUDIT_CLAIM_ENTAILMENT: "true" }, ["--drop"]) as { survived: number; rejected: number; dropReason: string | null };
  ok("a fabricated finding carrying a full corrected:{} is DROPPED, not re-typed", r.survived === 0 && r.rejected === 1);
  ok("it took the ENTAILMENT branch (order preserved)", r.dropReason === "entailment_fail");
}

// ── 6 · THE TERMINATOR GUARDS ITSELF ────────────────────────────────────────────────────────────────────────
//
// This suite COUNTS failures instead of throwing where they happen, so the one line below is the only thing
// that turns a printed ✗ into a red build. Anything appended under it runs, prints, increments `fail` and
// exits 0. Measured, not assumed: a failing assertion appended below the terminator exited 0.
//
// Same class as _capability-statement-truth (PR #604) and audit-decide-temporal, whose fourteen-assertion F1
// regression bank sat below its own exit. This reads THIS file so the next block appended in the wrong place
// fails the run that appends it.
console.log("-- the terminator is the last thing in this file --");
{
  const self = readFileSync(join(import.meta.dirname ?? __dirname, "audit-claim-entailment-flag.test.ts"), "utf8");
  // Anchored to the STATEMENT form at line start. A plain substring search also matches the search term
  // written out here, which is an assertion failing on its own source rather than on the file.
  const hits = [...self.matchAll(/^assert\.equal\(fail, 0, /gm)];
  ok(`the terminator is present exactly once (found ${hits.length}) — an earlier one truncates the run`,
    hits.length === 1);
  const last = hits[hits.length - 1];
  const after = last ? self.slice((last.index ?? 0) + last[0].length) : "";
  // A trailing comment or console.log is not a test; a call to the helper is.
  const orphans = (after.match(/\bok\(/g) || []).length;
  ok(`no assertion is written below the terminator (found ${orphans} that would run but never fail the build)`,
    orphans === 0);
}

console.log(`\nclaim-entailment flag split: ${pass} passed, ${fail} failed`);
assert.equal(fail, 0, `${fail} assertion(s) failed`);
console.log("✅ entailment arms alone · coverage sweep does not ride along · old flag unchanged");
