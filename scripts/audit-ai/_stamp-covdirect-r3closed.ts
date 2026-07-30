// DRY-STAMP probe 1 — R4 closure of the two R3 DRY-cert over-fires + belt-1 direct-binding seams.
// PROD QUARTET armed BEFORE import. Real completenessOf (no stubs).
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

function status(sec: string, lines: string[], findingExcerpt: string) {
  const src = [`SECTION ${sec} - HEADER`, ...lines].join("\n");
  const r = completenessOf({ fullSource: src } as any, [sec], [f(sec, findingExcerpt)], new Set([sec]));
  return r.attestations.find((a) => a.section === sec)?.status;
}

function main() {
  const GROUNDED = "Inspection will be performed at destination.";

  // ===== R3 OVER-FIRE #1 (belt-1 30-char adjacency) — MUST now be covered_direct (R4 replaced adjacency w/ direct-binding).
  ok("[R3-of1a] 'The firm's samples shall be registered in the tracking log upon delivery.' ⇒ covered_direct",
    status("F", [GROUNDED, "The firm's samples shall be registered in the tracking log upon delivery."], GROUNDED), "covered_direct");
  ok("[R3-of1b] 'Contractor personnel shall be registered in the visitor system.' ⇒ covered_direct",
    status("F", [GROUNDED, "Contractor personnel shall be registered in the visitor system."], GROUNDED), "covered_direct");

  // ===== R3 OVER-FIRE #2 (belt-2 8(a)-reverse pre-empts form-field) — MUST now be covered_direct.
  ok("[R3-of2a] 'The program described in block 8(a) shall be delivered per schedule.' ⇒ covered_direct",
    status("D", [GROUNDED, "The program described in block 8(a) shall be delivered per schedule."], GROUNDED), "covered_direct");
  ok("[R3-of2b] 'Enter the applicable program identifier in field 8(a) of the DD-250.' ⇒ covered_direct",
    status("D", [GROUNDED, "Enter the applicable program identifier in field 8(a) of the DD-250."], GROUNDED), "covered_direct");
  ok("[R3-of2c] 'Reference the program element in field 8(a) of the exhibit.' ⇒ covered_direct",
    status("D", [GROUNDED, "Reference the program element in field 8(a) of the exhibit."], GROUNDED), "covered_direct");
  ok("[R3-of2d] 'The offeror's program manager shall be identified in item 8(a).' ⇒ covered_direct",
    status("D", [GROUNDED, "The offeror's program manager shall be identified in item 8(a)."], GROUNDED), "covered_direct");
  ok("[R3-of2e] 'Only block 8(a) requires an entry.' ⇒ covered_direct",
    status("D", [GROUNDED, "Only block 8(a) requires an entry."], GROUNDED), "covered_direct");

  // ===== UNDER-FIRE PRESERVED (belt-2 real 8(a)-program restriction & clearance must still FLOOR).
  ok("[uf1] 'Award is restricted to 8(a) program participants only.' ⇒ floors",
    status("C", [GROUNDED, "Award is restricted to 8(a) program participants only."], GROUNDED), "obligations_ungrounded");
  ok("[uf2] real §H clearance bar STILL floors",
    status("H", [GROUNDED, "The contractor shall possess a Top Secret facility clearance at time of award."], GROUNDED), "obligations_ungrounded");
  ok("[uf3] 'The contractor's personnel shall be registered in SAM prior to award.' ⇒ floors (belt-2 registered-in-sam)",
    status("H", [GROUNDED, "The contractor's personnel shall be registered in SAM prior to award."], GROUNDED), "obligations_ungrounded");

  // ===== FRESH ATTACK — belt-1 direct-binding misses (real offeror↔eligibility bars). If they FLOOR, under-fire safe.
  ok("[fa1] 'The successful offeror must be an eligible small business at time of award.' ⇒ floors",
    status("C", [GROUNDED, "The successful offeror must be an eligible small business at time of award."], GROUNDED), "obligations_ungrounded");
  ok("[fa2] 'Only an offeror that is an eligible small business may receive award.' ⇒ floors",
    status("C", [GROUNDED, "Only an offeror that is an eligible small business may receive award."], GROUNDED), "obligations_ungrounded");
  ok("[fa3] 'The firm's status must be that of an eligible small business concern.' ⇒ floors",
    status("C", [GROUNDED, "The firm's status must be that of an eligible small business concern."], GROUNDED), "obligations_ungrounded");

  console.log(`\n${fails.length === 0 ? "ALL PASS" : "HAS FAILURES"} — ${pass} passed, ${fails.length} failed`);
  fails.forEach((x) => console.log(x));
  if (fails.length) process.exit(1);
}
main();
