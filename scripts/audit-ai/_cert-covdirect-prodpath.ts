// GATE-1 $0 PROOF (production composition) — Phase 4 covered_direct HARD-BAR floor.
// Drives the REAL completenessOf() + gradeCoverageV2() production functions (no stubs). Proves:
//  (A) BREAK: flag ON → a §H clearance bar co-resident with a benign grounded finding → obligations_ungrounded (missing).
//  (B) STATUS QUO: flag OFF → §H covered_direct (byte-identical).
//  (C) CLEAN: flag ON, §H with only a benign grounded finding, NO bar → covered_direct (ZERO over-fire by construction).
//  (D) GROUNDED BAR: flag ON, the clearance bar IS grounded by a finding → covered_direct (an analyzed bar is not floored).
//  (E) V2 PATH: gradeCoverageV2 over the flag-ON attestations → disqualifierUncovered (escalation reaches importanceOf).
//  (F) SCOPE: §L (per-obligation) and §C both behave; the floor never touches §L/§M's own path.
// RE-CERT runs the TRUE PROD QUARTET (red-team method correction, project_covdirect-r1-findings): the self-cert
// demotion + ambiguous-signal-demotion flags are ARMED in prod, so a cert with them OFF proves nothing about prod.
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
import { completenessOf } from "@/lib/audit-orchestrator";
import { gradeCoverageV2 } from "@/lib/audit-gate-v2";
import type { TypedFinding } from "@/lib/audit-types";

let pass = 0; const fails: string[] = [];
const ok = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`❌ ${l}: got ${JSON.stringify(g)} != ${JSON.stringify(e)}`); };

const BENIGN = "Government-furnished property will be provided at the contractor's facility during performance.";
const BAR = "The contractor shall possess a Top Secret facility clearance at time of award.";
const SRC_H_BREAK = ["SECTION H - SPECIAL CONTRACT REQUIREMENTS", BENIGN, BAR].join("\n");
const SRC_H_CLEAN = ["SECTION H - SPECIAL CONTRACT REQUIREMENTS", BENIGN].join("\n");

const benignFinding: TypedFinding = { id: "f_benign", citation: "§H", excerpt: BENIGN, kind: "requirement", controllability: "bidder_controls", severity: "info", note: "GFP note" } as unknown as TypedFinding;
const barFinding: TypedFinding = { id: "f_bar", citation: "§H", excerpt: BAR, kind: "requirement", controllability: "bidder_cannot_move", severity: "critical", note: "clearance bar analyzed" } as unknown as TypedFinding;

const withFlag = (on: boolean, fn: () => void) => { const prev = process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR; process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = on ? "true" : "false"; try { fn(); } finally { if (prev === undefined) delete process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR; else process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = prev; } };

function main() {
  // (A) BREAK — flag ON, ungrounded clearance bar next to a benign grounded finding.
  withFlag(true, () => {
    const r = completenessOf({ fullSource: SRC_H_BREAK } as any, ["H"], [benignFinding], new Set(["H"]));
    const h = r.attestations.find((a) => a.section === "H");
    ok("(A) flag ON ⇒ §H obligations_ungrounded (blanket covered_direct REFUSED)", h?.status, "obligations_ungrounded");
    ok("(A) §H is missing", r.missing, ["H"]);
    ok("(A) the ungrounded reason is the REAL clearance bar sentence", h?.ungrounded.some((u) => /top secret facility clearance/i.test(u)), true);
    ok("(A) NOT the benign sentence", h?.ungrounded.some((u) => /government-furnished/i.test(u)), false);
  });
  // (B) STATUS QUO — flag OFF, identical input → covered_direct.
  withFlag(false, () => {
    const r = completenessOf({ fullSource: SRC_H_BREAK } as any, ["H"], [benignFinding], new Set(["H"]));
    const h = r.attestations.find((a) => a.section === "H");
    ok("(B) flag OFF ⇒ §H covered_direct (byte-identical status quo)", h?.status, "covered_direct");
    ok("(B) flag OFF ⇒ §H covered (not missing)", r.missing, []);
  });
  // (C) CLEAN — flag ON, no bar in §H → covered_direct (ZERO over-fire).
  withFlag(true, () => {
    const r = completenessOf({ fullSource: SRC_H_CLEAN } as any, ["H"], [benignFinding], new Set(["H"]));
    const h = r.attestations.find((a) => a.section === "H");
    ok("(C) clean §H (no bar) ⇒ covered_direct even flag ON (zero over-fire)", h?.status, "covered_direct");
    ok("(C) clean §H not missing", r.missing, []);
  });
  // (D) GROUNDED BAR — flag ON, the bar itself is grounded by a finding → analyzed → covered_direct.
  withFlag(true, () => {
    const r = completenessOf({ fullSource: SRC_H_BREAK } as any, ["H"], [benignFinding, barFinding], new Set(["H"]));
    const h = r.attestations.find((a) => a.section === "H");
    ok("(D) grounded clearance bar ⇒ covered_direct (a bar the panel ANALYZED is never floored)", h?.status, "covered_direct");
    ok("(D) not missing", r.missing, []);
  });
  // (E) V2 PATH — gradeCoverageV2 over the flag-ON break attestations escalates via importanceOf.
  withFlag(true, () => {
    const r = completenessOf({ fullSource: SRC_H_BREAK } as any, ["H"], [benignFinding], new Set(["H"]));
    const cov = gradeCoverageV2(r.attestations);
    ok("(E) V2: clearance bar reaches disqualifierUncovered (escalation, not silent-BID)", cov.disqualifierUncovered.some((d) => /top secret facility clearance/i.test(d.obligation)), true);
    ok("(E) V2: §H NOT counted covered", cov.coverageGrade < 1, true);
  });
  // (F) SCOPE — §L path is untouched by the floor (per-obligation owns §L/§M).
  withFlag(true, () => {
    const rL = completenessOf({ fullSource: ["SECTION L - INSTRUCTIONS", "Offerors shall submit a technical volume.", BAR].join("\n") } as any, ["L"], [{ id: "fl", citation: "§L", excerpt: "Offerors shall submit a technical volume.", kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding], new Set(["L"]));
    const l = rL.attestations.find((a) => a.section === "L");
    ok("(F) §L never routes through the covered_direct floor (per-obligation owns it)", l?.status !== "covered_direct", true);
  });

  // (G) R1 OVER-FIRE FIX — §E goods-acceptance eligibility ("supplies not eligible for acceptance") is NOT a bidder bar.
  const GOODS = "Supplies not conforming to the specification are not eligible for acceptance and may be rejected.";
  withFlag(true, () => {
    const src = ["SECTION E - INSPECTION AND ACCEPTANCE", "Inspection will be performed at destination.", GOODS].join("\n");
    const r = completenessOf({ fullSource: src } as any, ["E"], [{ id: "fe", citation: "§E", excerpt: "Inspection will be performed at destination.", kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding], new Set(["E"]));
    const e = r.attestations.find((a) => a.section === "E");
    ok("(G) §E goods-acceptance 'not eligible for acceptance' ⇒ covered_direct (NOT floored — over-fire fixed)", e?.status, "covered_direct");
    ok("(G) §E not missing", r.missing, []);
  });
  // (H) R1 OVER-FIRE FIX — §D form-field "block 8(a)" reference is NOT a set-aside bar.
  withFlag(true, () => {
    const src = ["SECTION D - PACKAGING AND MARKING", "Mark each container per MIL-STD-129.", "Enter the value in block 8(a) of the inspection form."].join("\n");
    const r = completenessOf({ fullSource: src } as any, ["D"], [{ id: "fd", citation: "§D", excerpt: "Mark each container per MIL-STD-129.", kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding], new Set(["D"]));
    const d = r.attestations.find((a) => a.section === "D");
    ok("(H) §D form-field 'block 8(a)' ⇒ covered_direct (NOT floored — over-fire fixed)", d?.status, "covered_direct");
  });
  // (I) BELT — a REAL offeror-subject eligibility bar with goods-ish words STILL floors (offeror mention fails safe toward floor).
  const OFF_BAR = "The offeror is not eligible for award unless it holds a Top Secret facility clearance.";
  withFlag(true, () => {
    const src = ["SECTION H - SPECIAL CONTRACT REQUIREMENTS", BENIGN, OFF_BAR].join("\n");
    const r = completenessOf({ fullSource: src } as any, ["H"], [benignFinding], new Set(["H"]));
    const h = r.attestations.find((a) => a.section === "H");
    ok("(I) offeror-subject bar STILL floors (under-fire preserved, belt)", h?.status, "obligations_ungrounded");
  });
  // (J) UNDER-FIRE PRESERVED — verb-less clearance header (no offeror noun, no goods) STILL floors.
  withFlag(true, () => {
    const src = ["SECTION H - SPECIAL CONTRACT REQUIREMENTS", BENIGN, "Top Secret facility clearance required at time of award."].join("\n");
    const r = completenessOf({ fullSource: src } as any, ["H"], [benignFinding], new Set(["H"]));
    const h = r.attestations.find((a) => a.section === "H");
    ok("(J) verb-less clearance header STILL floors (0/7 under-fire preserved)", h?.status, "obligations_ungrounded");
  });

  // (K) DRY-CERT BREAK 1 (P0 under-fire) — a bare 8(a) PROGRAM restriction leading with a thing-noun, no "set-aside"
  // token, no offeror noun → MUST floor (belt-2 8(a)-program).
  withFlag(true, () => {
    const src = ["SECTION C - DESCRIPTION", "The work consists of routine maintenance.", "Provisions of this notice restrict award to 8(a) program participants only."].join("\n");
    const r = completenessOf({ fullSource: src } as any, ["C"], [{ id: "fc", citation: "§C", excerpt: "The work consists of routine maintenance.", kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding], new Set(["C"]));
    ok("(K) 8(a) program restriction (thing-lead, no 'set-aside') ⇒ floors (P0 under-fire closed)", r.attestations.find((a) => a.section === "C")?.status, "obligations_ungrounded");
  });
  // (L) DRY-CERT BREAK 2 (P1 over-fire) — §E goods-acceptance with a "contractor" REMEDY tail → MUST stay covered.
  withFlag(true, () => {
    const src = ["SECTION E - INSPECTION AND ACCEPTANCE", "Inspection is at destination.", "Nonconforming units are ineligible for acceptance and will be returned at the contractor's expense."].join("\n");
    const r = completenessOf({ fullSource: src } as any, ["E"], [{ id: "fe2", citation: "§E", excerpt: "Inspection is at destination.", kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding], new Set(["E"]));
    ok("(L) §E goods-acceptance + contractor-remedy tail ⇒ covered_direct (P1 over-fire closed)", r.attestations.find((a) => a.section === "E")?.status, "covered_direct");
  });
  // (M) BELT-2 form-field preserved — "block 8(a)" still skips (not a program restriction).
  withFlag(true, () => {
    const src = ["SECTION D - PACKAGING", "Mark per MIL-STD-129.", "Enter the value in block 8(a) of the inspection form."].join("\n");
    const r = completenessOf({ fullSource: src } as any, ["D"], [{ id: "fd2", citation: "§D", excerpt: "Mark per MIL-STD-129.", kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding], new Set(["D"]));
    ok("(M) 'block 8(a)' form ref ⇒ covered_direct (8(a)-program belt does not over-catch form refs)", r.attestations.find((a) => a.section === "D")?.status, "covered_direct");
  });

  console.log(`\n${fails.length === 0 ? "✅ ALL PASS" : "❌ FAIL"} — ${pass} assertions passed, ${fails.length} failed`);
  fails.forEach((f) => console.log(f));
  if (fails.length) process.exit(1);
}
main();
