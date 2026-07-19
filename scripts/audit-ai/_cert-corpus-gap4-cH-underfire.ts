/* Corpus gap #4 (card #560) — the Phase-4 covered_direct floor UNDER-fire side: DENSE §C/§H cleared-work SOWs where a
 * benign GROUNDED finding sits co-resident with an UNGROUNDED firm bar. R6 covered the OVER-fire side (§E/§F goods-
 * acceptance that must stay covered); this proves the under-fire — the section must NOT blanket-certify covered_direct.
 * Drives the REAL completenessOf() (production composition) with BOTH floors armed. Also writes the specimens to the
 * tracked corpus. Run: npx tsx scripts/audit-ai/_cert-corpus-gap4-cH-underfire.ts
 */
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
process.env.AUDIT_ELIG_BAR_PASSIVE_FRAME = "true";
import { completenessOf } from "@/lib/audit-orchestrator";
import type { TypedFinding } from "@/lib/audit-types";
import { writeFileSync } from "fs";

let fail = 0; const ok = (l: string, g: unknown, e: unknown) => { const p = JSON.stringify(g) === JSON.stringify(e); console.log(`${p ? "✅" : "❌"} ${l}${p ? "" : ` (got ${JSON.stringify(g)})`}`); if (!p) fail++; };
const F = (sec: string, ex: string): TypedFinding => ({ id: "f_" + sec, citation: "§" + sec, excerpt: ex, kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding);

// 3 dense, realistic cleared-work SOW sections. Each: a benign GROUNDED finding (the ONE thing the panel analyzed) +
// a co-resident UNGROUNDED firm bar (passive/noun frame — ELIGIBILITY_BAR_RE MISSES it) that must escalate.
const SPECS = [
  { id: "R6-under-H-tssci", sec: "H", benign: "The Government will provide workspace and IT equipment at the contractor's on-site facility.",
    section: [
      "SECTION H - SPECIAL CONTRACT REQUIREMENTS",
      "H.1 The Government will provide workspace and IT equipment at the contractor's on-site facility.",
      "H.2 Work under this effort involves access to Sensitive Compartmented Information. A current TS/SCI clearance is required for all personnel prior to performance; personnel who cannot obtain it may not be assigned.",
      "H.3 The contractor shall coordinate visitor access requests through the Government security office.",
    ].join("\n"), barRe: /ts\/sci clearance is required/i },
  { id: "R6-under-C-fcl", sec: "C", benign: "The contractor shall perform routine and preventive maintenance on the described systems.",
    section: [
      "SECTION C - DESCRIPTION / SPECIFICATIONS / STATEMENT OF WORK",
      "C.1 Scope. The contractor shall perform routine and preventive maintenance on the described systems.",
      "C.2 Facility. The offeror must possess an active FCL at the Secret level, verified in NISS, as of the proposal due date.",
      "C.3 The contractor shall deliver a monthly status report in accordance with the CDRL.",
    ].join("\n"), barRe: /must possess an active fcl/i },
  { id: "R6-under-C-var", sec: "C", benign: "The contractor shall furnish all labor, tools, and consumables to complete the installation.",
    section: [
      "SECTION C - DESCRIPTION / SPECIFICATIONS / STATEMENT OF WORK",
      "C.1 The contractor shall furnish all labor, tools, and consumables to complete the installation.",
      "C.2 Contractor or its subcontractor(s) must be a Value Added Reseller (VAR)/Authorized Dealer (AD) of the manufacturer line of products being installed.",
      "C.3 Warranty. All work shall carry the manufacturer's standard warranty.",
    ].join("\n"), barRe: /value added reseller|authorized dealer/i },
];

const outSpecs: any[] = [];
for (const s of SPECS) {
  const r = completenessOf({ fullSource: s.section } as any, [s.sec], [F(s.sec, s.benign)], new Set([s.sec]));
  const a = r.attestations.find((x) => x.section === s.sec);
  ok(`${s.id}: §${s.sec} floors → obligations_ungrounded (not blanket covered_direct)`, a?.status, "obligations_ungrounded");
  ok(`${s.id}: the escalated obligation IS the real bar sentence`, a?.ungrounded.some((u) => s.barRe.test(u)), true);
  ok(`${s.id}: NOT the benign grounded sentence`, a?.ungrounded.some((u) => /workspace|preventive maintenance|labor, tools/i.test(u)), false);
  outSpecs.push({ id: s.id, origin: "synthetic-grounded", section: s.sec, expected: "flag_obligations_ungrounded",
    benign_grounded: s.benign, ungrounded_bar: a?.ungrounded?.[0] ?? "", sentence: s.section });
}

if (!fail) {
  writeFileSync("scripts/audit-ai/gate2-corpus/row6-covered-direct-underfire.json", JSON.stringify({
    generated: "card #560 corpus gap #4", oracle: "completenessOf covered_direct floor (AUDIT_COVERED_DIRECT_BAR_FLOOR + AUDIT_ELIG_BAR_PASSIVE_FRAME)",
    note: "R6 UNDER-fire side: dense §C/§H cleared-work SOW sections with a benign GROUNDED finding co-resident with an UNGROUNDED passive firm bar (TS/SCI clearance / FCL / VAR). Each MUST floor to obligations_ungrounded, not blanket covered_direct. Proven through the real completenessOf() production path.",
    specimens: outSpecs,
  }, null, 2));
  console.log("\n✅ wrote scripts/audit-ai/gate2-corpus/row6-covered-direct-underfire.json");
}
console.log(`\n${fail ? "❌ FAIL" : "✅ ALL PASS"} — ${fail} failed`);
process.exit(fail ? 1 : 0);
