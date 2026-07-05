// $0 REGRESSION — Brain card 285 Fix 2: §I/§K deterministic trap detector + boilerplate attestation.
// Proves the 3 attestation conditions + the safety negatives: (1) present + hash-bound; (2) trap detectors swept
// (no sweep ⇒ NO attestation, never a free pass); (3) a detector hit is never suppressed (it surfaces as a finding
// → covered_direct). Flag-off is byte-identical. The named §I/§K traps (52.219-14 / prohibited-source) are grounded.
import { completenessOf } from "@/lib/audit-orchestrator";
import { boilerplateTrapSweep, highSignalSweep } from "@/lib/audit-grounding-sweep";
import type { AuditToolContext } from "@/lib/audit-tools";

let pass = 0; const fails: string[] = [];
const ok = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`${l}: ${JSON.stringify(g)} != ${JSON.stringify(e)}`); };

// §I with a real "shall" obligation (so WITHOUT attestation it is obligations_ungrounded → missing) + a 52.219-14 trap.
const SRC_I_TRAP = [
  "SECTION I - CONTRACT CLAUSES",
  "The offeror shall comply with all incorporated clauses set forth herein.",
  "FAR 52.219-14 Limitations on Subcontracting applies: the concern must self-perform at least 50 percent of the cost of the work.",
].join("\n");
// §I boilerplate with a shall obligation but NO trap clause (the clean-boilerplate case attestation must cover).
const SRC_I_CLEAN = [
  "SECTION I - CONTRACT CLAUSES",
  "The offeror shall comply with all incorporated clauses set forth herein by reference.",
].join("\n");
const ATTEST = { boilerplateAttest: { sections: ["I", "K"], swept: true } };

function main() {
  // ── (A) trap detector grounds the NAMED §I/§K traps. ──
  const traps = boilerplateTrapSweep(SRC_I_TRAP);
  ok("trap sweep grounds 52.219-14 limitation-on-subcontracting", traps.some((f) => f.sweepArchetype === "limitation_on_subcontracting"), true);
  ok("trap finding is clause_flowdown + bidder_controls (grounds, never a bar)", traps[0] && traps[0].kind === "clause_flowdown" && traps[0].controllability === "bidder_controls", true);
  ok("prohibited-source trap grounded", boilerplateTrapSweep("SECTION K\nThe offeror represents it will not provide covered telecommunications equipment (52.204-25).").some((f) => f.sweepArchetype === "prohibited_source"), true);
  ok("no trap text ⇒ no trap findings", boilerplateTrapSweep("SECTION I\nStandard clauses apply by reference.").length, 0);
  ok("highSignalSweep still EXCLUDES set-aside/sub-k (byte-identical archetype sweep)", highSignalSweep(SRC_I_TRAP).length, 0);

  // ── (B) attestation covers clean boilerplate §I — hash-bound (condition 1). ──
  const clean = completenessOf({ fullSource: SRC_I_CLEAN }, ["I"], [], new Set(["I"]), ATTEST);
  ok("clean §I attested covered (not missing)", clean.missing, []);
  const att = clean.attestations.find((a) => a.section === "I");
  ok("status is covered_attested_boilerplate", att?.status, "covered_attested_boilerplate");
  ok("attestation is HASH-BOUND (sha256, 64 hex)", !!att?.sectionHash && /^[0-9a-f]{64}$/.test(att.sectionHash), true);

  // ── (C) SAFETY: no sweep ⇒ NO attestation (never a free pass) — condition 2. ──
  const noSweep = completenessOf({ fullSource: SRC_I_CLEAN }, ["I"], [], new Set(["I"]), { boilerplateAttest: { sections: ["I", "K"], swept: false } });
  ok("swept=false ⇒ §I NOT attested ⇒ missing", noSweep.missing, ["I"]);
  // flag OFF (no opts) ⇒ byte-identical old behaviour: ungrounded obligations ⇒ missing.
  const flagOff = completenessOf({ fullSource: SRC_I_CLEAN }, ["I"], [], new Set(["I"]));
  ok("flag OFF ⇒ §I missing (byte-identical)", flagOff.missing, ["I"]);

  // ── (D) SCOPE: attestation is §I/§K-only — a non-boilerplate section (§C) is never attested. ──
  const scoped = completenessOf({ fullSource: "SECTION C\nThe contractor shall furnish widgets meeting spec." }, ["C"], [], new Set(["C"]), ATTEST);
  ok("§C never boilerplate-attested (missing stands)", scoped.missing, ["C"]);

  // ── (E) condition 3: a §I WITH a trap is NEVER swallowed — the trap surfaces as a finding → covered_direct. ──
  const trapFindings = boilerplateTrapSweep(SRC_I_TRAP).map((f, j) => ({ ...f, id: `boilerplate_trap#${j}` }));
  const withTrap = completenessOf({ fullSource: SRC_I_TRAP }, ["I"], trapFindings, new Set(["I"]), ATTEST);
  const iatt = withTrap.attestations.find((a) => a.section === "I");
  ok("§I with a grounded trap ⇒ covered_direct (finding drives verdict, not suppressed)", iatt?.status, "covered_direct");
  ok("the trap finding is cited to the §I coverage", (iatt?.citedFindingIds.length ?? 0) > 0, true);

  // ── (F) unread §I stays unread even with attestation (attestation ≠ skip). ──
  const unread = completenessOf({ fullSource: SRC_I_CLEAN }, ["I"], [], new Set(), ATTEST);
  ok("unread §I stays unread (attestation requires READ)", unread.attestations.find((a) => a.section === "I")?.status, "unread");

  // ── (G) HARDENING — INTERNAL CLAMP: a caller passing a binding-obligation section (§M) must NEVER attest it,
  //      even though the arg lists it. The fixed {I,K} allowlist governs. Closes the exported-API footgun. ──
  const mClamp = completenessOf({ fullSource: "SECTION M - EVALUATION FACTORS\nThe Government shall evaluate on best value and price." }, ["M"], [], new Set(["M"]), { boilerplateAttest: { sections: ["I", "K", "M"], swept: true } });
  ok("§M never boilerplate-attested even when arg lists it (internal clamp)", mClamp.attestations.find((a) => a.section === "M")?.status !== "covered_attested_boilerplate", true);
  ok("§M with an ungrounded obligation stays MISSING (clamp holds)", mClamp.missing.includes("M"), true);

  // ── (H) HARDENING — expanded §I/§K trap coverage so "swept" is meaningful (facility clearance + OCI). ──
  ok("trap sweep grounds facility-clearance / DD-254 (structural eligibility bar)", boilerplateTrapSweep("SECTION K\nOfferor must hold a Secret facility security clearance and DD-254.").some((x) => x.sweepArchetype === "facility_clearance"), true);
  ok("trap sweep grounds organizational conflict of interest", boilerplateTrapSweep("SECTION I\nAn organizational conflict of interest (OCI) may render an offeror ineligible.").some((x) => x.sweepArchetype === "organizational_conflict_of_interest"), true);
  ok("trap sweep grounds the LOS clause family (52.219-27 SDVOSB)", boilerplateTrapSweep("SECTION I\nClause 52.219-27 applies to this SDVOSB set-aside.").some((x) => x.sweepArchetype === "limitation_on_subcontracting"), true);

  console.log(`\ncard285 Fix2 boilerplate attestation — ${pass} passed, ${fails.length} failed`);
  for (const x of fails) console.log("  ✗ " + x);
  process.exit(fails.length ? 1 : 0);
}
main();
