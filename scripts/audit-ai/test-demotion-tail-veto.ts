// $0 gate — DEMOTION TAIL VETO (flag AUDIT_DEMOTION_TAIL_VETO, default-OFF).
//   npx tsx scripts/audit-ai/test-demotion-tail-veto.ts
//
// THE DEFECT IT CLOSES. `_cert-card576-gauntlet.ts` case F3 escaped under the live production flag set: the
// card-#572/#576 severed-tail belt guards the benign-recital and performance-upkeep demotion exits, but the
// ambiguous-signal demotion BELOW them reads hasBarSignal on the obligation TEXT ALONE. obligationsOf splits on
// `[.;\n]`, so a bonding/surety bar living in the severed tail is invisible at that exit and the whole obligation
// demotes to ungroundedNonBarSignal instead of escalating. Bisected to AUDIT_AMBIGUOUS_SIGNAL_DEMOTION on
// 2026-08-05: with that flag alone forced off, F3 and F4 both pass.
//
// PROVES: (1) flag-OFF byte-identity — F3 still demotes, every bucket identical; (2) flag-ON F3 ESCALATES;
// (3) NEGATIVE CONTROL — a benign §L residual with a benign tail still demotes under the flag (no mass-escalation
// of the proposal-prep population the demotion exists to dissolve); (4) the unlocatable-recital population is
// UNTOUCHED in both flag states (the deliberate scope limit — this exit has no benign claim to fail closed on).
//
// NOT CLOSED HERE: gauntlet case F4 ("maintain product liability insurance AND its status as an authorized OEM
// distributor"). Its bar is in the obligation text itself, not a severed tail — hasBarSignal simply does not
// recognize distributor-authorization vocabulary. That is bar-signal EXPANSION (over-fire risk, corpus-measured),
// carded to Brain rather than fixed here. This gate asserts F4 still demotes so the split stays visible.
import { gradeCoverageV2, verifyRecitalInSource } from "@/lib/audit-gate-v2";

const att = (ob: string) => ({ section: "L", status: "obligations_ungrounded", obligations: [ob], citedFindingIds: [], ungrounded: [ob] } as never);

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fails.push(label); console.log(`  ✗ FAIL ${label}${detail ? ` — ${detail}` : ""}`); } };

// Buckets under the FULL live-armed demotion set. verifyRecitalPresence is supplied exactly as the orchestrator
// supplies it (audit-orchestrator.ts:3105) so the tail the production locator would see is the tail under test.
const buckets = (ob: string, source: string, tailVeto: boolean) => {
  const prev = process.env.AUDIT_DEMOTION_TAIL_VETO;
  process.env.AUDIT_DEMOTION_TAIL_VETO = tailVeto ? "true" : "false";
  try {
    const cov = gradeCoverageV2([att(ob)], { verifyRecitalPresence: (o: string) => verifyRecitalInSource(source, o) }) as unknown as {
      disqualifierUncovered: unknown[]; ungroundedNonBarSignal?: unknown[]; caveatRecital?: unknown[];
    };
    return { disq: cov.disqualifierUncovered.length > 0, nonBar: (cov.ungroundedNonBarSignal ?? []).length > 0, caveat: (cov.caveatRecital ?? []).length > 0 };
  } finally { if (prev === undefined) delete process.env.AUDIT_DEMOTION_TAIL_VETO; else process.env.AUDIT_DEMOTION_TAIL_VETO = prev; }
};

// The demotion this gate patches is only reachable with its own flag armed; arm the live-production set here so the
// gate measures the LIVE path, not a default-OFF one where every ambiguous obligation escalates anyway.
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
process.env.AUDIT_BENIGN_RECITAL_COVERED = "true";
process.env.AUDIT_PERFORMANCE_UPKEEP_CAVEAT = "true";

// ── F3 — the defect: bonding/surety in the severed tail ────────────────────────────────────────────────────────
const F3_OB = "The contractor shall maintain the required insurance";
const F3_SRC = "The contractor shall maintain the required insurance and shall maintain bonding capacity of $5,000,000 with a Treasury-listed surety during performance.";
console.log("F3 — bonding/surety in the severed tail");
{
  const off = buckets(F3_OB, F3_SRC, false);
  ok("flag OFF: demotes (the defect, preserved byte-identical)", off.nonBar && !off.disq, JSON.stringify(off));
  const on = buckets(F3_OB, F3_SRC, true);
  ok("flag ON: ESCALATES to disqualifierUncovered", on.disq && !on.nonBar, JSON.stringify(on));
}

// ── NEGATIVE CONTROL — a benign proposal-prep residual with a BENIGN tail must still demote under the flag ─────
// This is the population the ambiguous demotion exists to dissolve; if the veto swallows it, the fix has traded
// one defect for a worse one (mass over-escalation on every large negotiated §L).
const BENIGN_OB = "Quotes shall be prepared in the English language";
const BENIGN_SRC = "Quotes shall be prepared in the English language. Page limits are stated in the attached instructions.";
console.log("\nNEGATIVE CONTROL — benign §L residual, benign tail");
{
  const off = buckets(BENIGN_OB, BENIGN_SRC, false);
  const on = buckets(BENIGN_OB, BENIGN_SRC, true);
  ok("flag OFF: demotes", off.nonBar && !off.disq, JSON.stringify(off));
  ok("flag ON: STILL demotes (veto did not widen to the benign population)", on.nonBar && !on.disq, JSON.stringify(on));
}

// ── SCOPE LIMIT — an unlocatable recital is untouched in BOTH states (documented, deliberate) ──────────────────
console.log("\nSCOPE LIMIT — recital not locatable in source");
{
  const ob = "vendors are encouraged to review the attached drawings before quoting";
  const src = "Unrelated text that does not contain the obligation at all.";
  const off = buckets(ob, src, false);
  const on = buckets(ob, src, true);
  ok("unlocatable recital: flag ON === flag OFF (no recall change)", off.disq === on.disq && off.nonBar === on.nonBar, `${JSON.stringify(off)} vs ${JSON.stringify(on)}`);
}

// ── F4 — NOT closed here; asserted so the remaining half stays visible rather than silently assumed fixed ──────
console.log("\nF4 — OEM-distributor status (bar in the obligation text, NOT a tail) — carded to Brain, not fixed here");
{
  const ob = "maintain product liability insurance and its status as an authorized OEM distributor for Caterpillar during the entire period of performance";
  const src = `SOW. ${ob}.`;
  const on = buckets(ob, src, true);
  ok("flag ON: still demotes (tail veto does not reach an in-text bar)", on.nonBar && !on.disq, JSON.stringify(on));
}

console.log(`\n${fails.length === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fails.length} failed`);
process.exit(fails.length === 0 ? 0 : 1);
