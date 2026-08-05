// NOOP-REP RELEASE ↔ hasBarSignal PARITY. Pure fixtures, no database, no network, no model call.
//
// WHY. `importanceOf`'s NOOP-REP release tested the RAW `BAR_SIGNAL_RE` while every sibling branch tested
// `hasBarSignal()`, which is that regex PLUS `REGISTER_TOKENS_RE` and `isPrivateIssuerCredentialBar`. Both arms
// are armed in production, as are all five NOOP-REP members, so at that one branch they added no escalation. A
// "boilerplate" return is a FULL release — gradeCoverageV2 drops it, so it never reaches disqualifierUncovered
// and never caps — which makes the failure direction FALSE-BID.
//
// THE ASSERTIONS THAT CARRY THE WEIGHT are the flag-OFF ones and the benign ones. Proving the fix escalates is
// easy; proving it (a) changes nothing until armed and (b) does not break the release these members exist to
// grant is what decides whether it is safe to arm. Over-fire is the risk of any change that adds escalation.
//
// It lives in src/lib/*.test.ts deliberately: CI's `suites` leg globs this directory only, so nothing under
// scripts/audit-ai/ runs on a push. This does.
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { if (c) pass++; else { fail++; console.log(`  ✗ ${l}`); } };

// CI spawns each suite with cwd = repo root (self-audit.ts), so this resolves there and in a hand-run alike.
const PROBE = join(process.cwd(), "scripts", "audit-ai", "_probe-noop-rep-parity.ts");

interface Cell { label: string; importance: string; bar: boolean }
interface Snap { asymmetric: Cell[]; benign: Cell[] }

// The five NOOP_REP_FAMILY member flags are module-load consts, so production's configuration is only
// reachable in a process whose env was set before import. One spawn; the parity flag is call-time and the
// probe toggles it internally, so both cells come back together.
const out = execFileSync("npx", ["tsx", PROBE], {
  env: {
    ...process.env,
    AUDIT_PROTEST_CLAUSE_ALLOWLIST: "true", AUDIT_DEBRIEF_ALLOWLIST: "true", AUDIT_NOOP_REP_ALLOWLIST: "true",
    AUDIT_PRECEDENCE_ALLOWLIST: "true", AUDIT_CLARIFICATION_ALLOWLIST: "true",
    AUDIT_BAR_SIGNAL_REGISTER_TOKENS: "true", AUDIT_PRIVATE_ISSUER_CREDENTIAL_BAR: "true",
    AUDIT_BOND_PAPER_NONBAR: "true",
    AUDIT_NOOP_REP_BAR_SIGNAL_PARITY: "",
  },
  encoding: "utf8",
});
const r = JSON.parse(out.trim().split("\n").pop()!) as { off: Snap; on: Snap; bondPaper: { off: string; on: string } };

// ── 1 · FLAG-OFF — the defect is still there, unchanged. This is what makes the fix safe to land unarmed. ──
console.log("-- flag OFF: production today, byte-identical --");
for (const c of r.off.asymmetric) {
  ok(`released as boilerplate despite a bar signal — ${c.label}`, c.importance === "boilerplate" && c.bar === true);
}
ok("all four asymmetric cases still released", r.off.asymmetric.every((c) => c.importance === "boilerplate"));

// ── 2 · FLAG-ON — the asymmetry closes. Escalation to "ambiguous", where the ratified bar-signal-POSITIVE
//        semantics take over; NOT straight to disqualifier (that would be a second, unratified change). ──
console.log("-- flag ON: parity with hasBarSignal --");
for (const c of r.on.asymmetric) {
  ok(`escalates to ambiguous — ${c.label}`, c.importance === "ambiguous");
}
ok("no asymmetric case is released once armed", r.on.asymmetric.every((c) => c.importance !== "boilerplate"));

// ── 3 · NO OVER-FIRE — the release these members exist to grant still works, in BOTH flag states. ──────────
//        If the fix broke these it would be trading a narrow false-BID for a broad false-NHR, which is the
//        trade the whole offeror-rights family was built to avoid.
console.log("-- benign NOOP-REP sentences keep their release --");
for (const c of r.off.benign) ok(`flag OFF still boilerplate — ${c.label}`, c.importance === "boilerplate");
for (const c of r.on.benign) ok(`flag ON still boilerplate — ${c.label}`, c.importance === "boilerplate");
ok("no benign sentence carries a bar signal (the fixtures are honest)", r.on.benign.every((c) => c.bar === false));

// ── 4 · THE INVARIANT, stated directly: once armed, a NOOP-REP release implies no bar signal. ──────────────
ok("armed: importanceOf==='boilerplate' ⇒ !hasBarSignal, over every fixture",
   [...r.on.asymmetric, ...r.on.benign].every((c) => c.importance !== "boilerplate" || c.bar === false));

// ── 5 · THE ONE DIRECTION THIS LOOSENS, asserted deliberately rather than discovered. ──────────────────────
//        hasBarSignal carries the #587b "bond paper" carve-out (paper stock ≠ a surety bond). The raw regex
//        does not, so today a §L format instruction naming bond paper is REFUSED the release on a false hit.
//        Under the flag it is released — the carve-out working as designed, and the only behaviour here that
//        moves toward less escalation. Named so a future reader does not read it as a regression.
console.log("-- bond paper: the single loosening, by design --");
ok("flag OFF — false surety hit refuses the release", r.bondPaper.off === "ambiguous");
ok("flag ON  — the #587b carve-out grants it", r.bondPaper.on === "boilerplate");

console.log(`\nnoop-rep bar-signal parity: ${pass} passed, ${fail} failed`);
assert.equal(fail, 0, `${fail} assertion(s) failed`);
console.log("✅ OFF byte-identical · ON closes the asymmetry · benign releases intact");
