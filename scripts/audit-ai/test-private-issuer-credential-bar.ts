// $0 gate — CREDENTIAL WITH A NAMED PRIVATE ISSUER (flag AUDIT_PRIVATE_ISSUER_CREDENTIAL_BAR, default-OFF).
//   npx tsx scripts/audit-ai/test-private-issuer-credential-bar.ts
//
// WHAT IT ENFORCES. Brain ruled on card #800 (2026-08-04) that "…its status as an authorized OEM distributor for
// Caterpillar" is NOT a new class — it is the CREDENTIAL class the recognizer already carries, with the issuer
// being a named private manufacturer instead of a government or accreditation body. The discriminator is the
// SUBJECT, not the noun: bidder-as-subject + named grantor + temporal binding. Three structural conditions, so it
// holds under paraphrase and is not a vocabulary blocklist.
//
// THE NEGATIVE CONTROLS ARE THE POINT. Condition (1) exists to keep third-party supply-chain prose out — the
// contractor BUYING from an authorized dealer is not the contractor BEING one. If a control here trips, the shape
// is wrong and the run is DISCARDED; narrowing the controls until they pass is a placebo (see the same discipline
// in _cert-card576-gauntlet.ts: do NOT tune-to-pass).
//
// Also asserts the end-to-end effect: the gauntlet's F4 case flips from demote to ESCALATE with the flag on, and
// the benign proposal-prep population the ambiguous demotion exists to dissolve still demotes.
import { isPrivateIssuerCredentialBar, hasBarSignal, gradeCoverageV2, verifyRecitalInSource } from "@/lib/audit-gate-v2";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean, detail = "") => { if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fails.push(label); console.log(`  ✗ FAIL ${label}${detail ? ` — ${detail}` : ""}`); } };

// ── THE SHAPE — pure predicate, flag-independent (the flag governs whether hasBarSignal CONSULTS it) ───────────
console.log("POSITIVES — bidder-as-subject + named private grantor + temporal binding");
for (const s of [
  "maintain product liability insurance and its status as an authorized OEM distributor for Caterpillar during the entire period of performance",
  "The offeror must be an authorized service center for Cummins at time of award.",
  "The contractor shall maintain its status as a franchised dealer for John Deere throughout the ordering period.",
  "Quoter shall remain a factory-authorized installer for Trane at all times during performance.",
  "The vendor shall hold an approved repair station designation from Honeywell for the duration of the contract.",
  "The contractor shall maintain its authorized distributor status for Caterpillar during the period of performance.",
  "Offeror shall maintain a factory-authorized dealer agreement with John Deere throughout performance.",
]) ok(`fires: "${s.slice(0, 62)}…"`, isPrivateIssuerCredentialBar(s));

console.log("\nNEGATIVE CONTROLS — must NOT fire (a tripped control DISCARDS the run, never narrows the shape)");
for (const [why, s] of [
  ["third party: the bidder BUYS from one", "The contractor may procure replacement parts from authorized distributors for Caterpillar during performance."],
  ["third party: passive, source-of-supply", "Parts shall be obtained from an authorized dealer for Caterpillar throughout the period of performance."],
  ["no named grantor: generic trade prose", "The contractor shall maintain its status as an authorized distributor during the period of performance."],
  ["no temporal binding", "The offeror is an authorized dealer for Caterpillar."],
  ["government issuer, already covered elsewhere", "The contractor shall maintain an active SAM registration during the period of performance."],
  ["ordinary proposal-prep residual", "Quotes shall be prepared in the English language and submitted through the portal."],
  ["delivery term naming a manufacturer", "The contractor shall maintain delivery schedules for Caterpillar parts during performance."],
] as const) ok(`silent (${why})`, !isPrivateIssuerCredentialBar(s), s.slice(0, 70));

// ── FLAG WIRING — hasBarSignal consults the shape ONLY under the flag ─────────────────────────────────────────
console.log("\nFLAG WIRING on hasBarSignal");
{
  const ob = "maintain product liability insurance and its status as an authorized OEM distributor for Caterpillar during the entire period of performance";
  const withFlag = (v: string | undefined, fn: () => boolean) => {
    const prev = process.env.AUDIT_PRIVATE_ISSUER_CREDENTIAL_BAR;
    if (v === undefined) delete process.env.AUDIT_PRIVATE_ISSUER_CREDENTIAL_BAR; else process.env.AUDIT_PRIVATE_ISSUER_CREDENTIAL_BAR = v;
    try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_PRIVATE_ISSUER_CREDENTIAL_BAR; else process.env.AUDIT_PRIVATE_ISSUER_CREDENTIAL_BAR = prev; }
  };
  ok("flag OFF: hasBarSignal blind to it (byte-identical)", withFlag(undefined, () => !hasBarSignal(ob)));
  ok("flag ON: hasBarSignal sees it", withFlag("true", () => hasBarSignal(ob)));
}

// ── END TO END — the gauntlet's F4 case through the real demotion path ────────────────────────────────────────
console.log("\nEND TO END — gradeCoverageV2 under the live-armed demotion set");
{
  process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
  process.env.AUDIT_BENIGN_RECITAL_COVERED = "true";
  process.env.AUDIT_PERFORMANCE_UPKEEP_CAVEAT = "true";
  const att = (ob: string) => ({ section: "L", status: "obligations_ungrounded", obligations: [ob], citedFindingIds: [], ungrounded: [ob] } as never);
  const buckets = (ob: string, source: string, on: boolean) => {
    const prev = process.env.AUDIT_PRIVATE_ISSUER_CREDENTIAL_BAR;
    process.env.AUDIT_PRIVATE_ISSUER_CREDENTIAL_BAR = on ? "true" : "false";
    try {
      const cov = gradeCoverageV2([att(ob)], { verifyRecitalPresence: (o: string) => verifyRecitalInSource(source, o) }) as unknown as { disqualifierUncovered: unknown[]; ungroundedNonBarSignal?: unknown[] };
      return { disq: cov.disqualifierUncovered.length > 0, nonBar: (cov.ungroundedNonBarSignal ?? []).length > 0 };
    } finally { if (prev === undefined) delete process.env.AUDIT_PRIVATE_ISSUER_CREDENTIAL_BAR; else process.env.AUDIT_PRIVATE_ISSUER_CREDENTIAL_BAR = prev; }
  };
  const F4 = "maintain product liability insurance and its status as an authorized OEM distributor for Caterpillar during the entire period of performance";
  ok("F4 flag OFF: demotes (the defect, preserved)", (() => { const b = buckets(F4, `SOW. ${F4}.`, false); return b.nonBar && !b.disq; })());
  ok("F4 flag ON: ESCALATES", (() => { const b = buckets(F4, `SOW. ${F4}.`, true); return b.disq && !b.nonBar; })());
  const BENIGN = "Quotes shall be prepared in the English language";
  ok("benign §L residual still demotes with the flag ON (no mass-escalation)", (() => { const b = buckets(BENIGN, `${BENIGN}. Page limits follow.`, true); return b.nonBar && !b.disq; })());
}

console.log(`\n${fails.length === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fails.length} failed`);
process.exit(fails.length === 0 ? 0 : 1);
