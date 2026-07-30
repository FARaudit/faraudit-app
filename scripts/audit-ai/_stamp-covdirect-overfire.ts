// DRY-STAMP probe 2 — R4 over-fire hunt through REAL completenessOf: belt-1 direct-binding pre-empt,
// belt-2 8(a) reorder, THING_LEAD genitive, ACCEPTANCE frame. All in-scope (ELIGIBILITY_BAR_RE matches).
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
import { completenessOf } from "@/lib/audit-orchestrator";
import type { TypedFinding } from "@/lib/audit-types";

let pass = 0; const fails: string[] = [];
const ok = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`FAIL ${l}: got ${JSON.stringify(g)} != ${JSON.stringify(e)}`); };
const f = (sec: string, ex: string): TypedFinding =>
  ({ id: "f_" + sec, citation: "§" + sec, excerpt: ex, kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding);
const G = "Inspection will be performed at destination.";
function status(sec: string, extra: string) {
  const src = [`SECTION ${sec} - HEADER`, G, extra].join("\n");
  const r = completenessOf({ fullSource: src } as any, [sec], [f(sec, G)], new Set([sec]));
  return r.attestations.find((a) => a.section === sec)?.status;
}

function main() {
  // ===== BENIGN genitive-THING + eligibility token — R4 belt-1 must NOT pre-empt the thing skip (should be covered_direct).
  ok("[of-gen1] \"The firm's documents shall be registered in the tracking system.\" ⇒ covered_direct",
    status("F", "The firm's documents shall be registered in the tracking system."), "covered_direct");
  ok("[of-gen2] \"The firm's welds shall be certified by an independent inspector.\" ⇒ covered_direct",
    status("F", "The firm's welds shall be certified by an independent inspector."), "covered_direct");
  ok("[of-gen3] \"The offeror's items shall be certified prior to acceptance.\" ⇒ covered_direct",
    status("E", "The offeror's items shall be certified prior to acceptance."), "covered_direct");
  ok("[of-gen4] \"Contractor personnel shall be certified in first aid before performance.\" ⇒ covered_direct",
    status("H", "Contractor personnel shall be certified in first aid before performance."), "covered_direct");

  // ===== ACCEPTANCE frame with an offeror noun elsewhere — must NOT be forced-floored.
  ok("[of-acc1] \"Nonconforming items are ineligible for acceptance by the contractor.\" ⇒ covered_direct",
    status("E", "Nonconforming items are ineligible for acceptance by the contractor."), "covered_direct");
  ok("[of-acc2] \"Any contractor invoices are eligible for payment upon acceptance.\" ⇒ covered_direct",
    status("E", "Any contractor invoices are eligible for payment upon acceptance."), "covered_direct");

  // ===== belt-2 8(a) reorder — benign form-field / FAR-reference 8(a) prose must SKIP (covered_direct).
  ok("[of-8a1] \"Section 8(a) of the FAR applies to this acquisition.\" ⇒ covered_direct",
    status("D", "Section 8(a) of the FAR applies to this acquisition."), "covered_direct");
  ok("[of-8a2] \"Enter the contract line item in block 8(a).\" ⇒ covered_direct",
    status("D", "Enter the contract line item in block 8(a)."), "covered_direct");
  ok("[of-8a3] \"The program manager shall complete item 8(a) of the form.\" ⇒ covered_direct",
    status("D", "The program manager shall complete item 8(a) of the form."), "covered_direct");

  // ===== SELF-CERT DEMOTION IS RATIFIED (card #516): a self-certifiable 8(a) set-aside is demoted to a self-cert
  // caveat by isBidderSelfDeterminableSentence (runs BEFORE isNonBidderEligibilitySentence), NOT floored. This is
  // CORRECT + OUT-OF-CONTRACT for the R4 seams under cert. Confirm the demotion path swallows them (covered_direct).
  ok("[selfcert1] \"Award is limited to certified 8(a) concerns.\" ⇒ self-cert demote (covered_direct)",
    status("C", "Award is limited to certified 8(a) concerns."), "covered_direct");
  ok("[selfcert2] \"This requirement is set aside for 8(a) program participants.\" ⇒ self-cert demote (covered_direct)",
    status("C", "This requirement is set aside for 8(a) program participants."), "covered_direct");

  // ===== UNDER-FIRE HARD-ZERO — a NON-self-determinable firm-only bar (clearance/ITAR/debarment) must STILL floor.
  ok("[uf-hz1] \"The contractor shall possess a Top Secret facility clearance.\" ⇒ floors",
    status("H", "The contractor shall possess a Top Secret facility clearance."), "obligations_ungrounded");
  ok("[uf-hz2] \"The offeror shall be registered in SAM and not be debarred.\" ⇒ floors",
    status("H", "The offeror shall be registered in SAM and not be debarred."), "obligations_ungrounded");
  ok("[uf-hz3] \"Only 8(a) certified firms are eligible for award.\" (NOT self-det per engine) ⇒ floors",
    status("C", "Only 8(a) certified firms are eligible for award."), "obligations_ungrounded");

  console.log(`\n${fails.length === 0 ? "ALL PASS" : "HAS FAILURES"} — ${pass} passed, ${fails.length} failed`);
  fails.forEach((x) => console.log(x));
  if (fails.length) process.exit(1);
}
main();
