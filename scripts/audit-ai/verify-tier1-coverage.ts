// $0 deterministic gate for T1-12 (§L/§M covered_direct over-flip).
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/verify-tier1-coverage.ts
//
// completenessOf blanket-covered a section (covered_direct) on the FIRST grounded
// finding cited to it, skipping the per-obligation ungrounded→INCOMPLETE proof.
// For §L/§M that is a false-COMPLETE: a long §L with one grounded sentence and
// many ungrounded ones read covered. Fix: §L/§M are certified per-obligation —
// one grounded obligation no longer masks an ungrounded tail. §C etc. keep the
// blanket covered_direct (still per-obligation-safe elsewhere). Drives real completenessOf.

import { completenessOf } from "@/lib/audit-orchestrator";
import type { AuditToolContext } from "@/lib/audit-tools";
import type { TypedFinding } from "@/lib/audit-findings";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { cond ? pass++ : fails.push(label); };

// Two obligations with NO shared 4-word n-gram (else groundedBy would alias them).
const L_HEAD = "Each technical proposal shall not exceed twenty pages in Times New Roman font.";
const L_TAIL = "Offerors must include a completed price schedule covering every contract line item.";
const sectionL = `SECTION L — INSTRUCTIONS\nL.1 ${L_HEAD}\nL.2 ${L_TAIL}`;

const ctx = { fullSource: sectionL, sections: { L: sectionL } } as AuditToolContext;
const finding = (id: string, excerpt: string, citation = "§L"): TypedFinding => ({
  id, requirement: "Procedural obligation (§L)", citation, excerpt,
  kind: "procedural_obligation", controllability: "bidder_controls", grounded: true, lens: "procedural_coverage",
});
const run = (findings: TypedFinding[]) => completenessOf(ctx, ["L"], findings, new Set(["L"]));

// (1) Only the HEAD obligation grounded → §L must read INCOMPLETE (tail ungrounded).
const partial = run([finding("f1", L_HEAD)]);
const attL = partial.attestations.find((a) => a.section === "L");
ok("T1-12 R1: one grounded obligation does NOT flip §L to covered_direct", attL?.status !== "covered_direct");
ok("T1-12 R2: §L with an ungrounded tail is obligations_ungrounded (honest INCOMPLETE)", attL?.status === "obligations_ungrounded");
ok("T1-12 R3: §L is NOT in covered / IS in missing", !partial.covered.includes("L") && partial.missing.includes("L"));
ok("T1-12 R4: the ungrounded tail obligation is surfaced", (attL?.ungrounded ?? []).some((u) => /price schedule|contract line item/i.test(u)));

// (2) BOTH obligations grounded (excerpt = whole §L) → §L certifies covered_attested.
const full = run([finding("f2", `${L_HEAD} ${L_TAIL}`)]);
const attFull = full.attestations.find((a) => a.section === "L");
ok("T1-12 R5: a FULLY-grounded §L still certifies covered (covered_attested)",
  attFull?.status === "covered_attested" && full.covered.includes("L"));

// (3) Regression: a NON-per-obligation section (§C) still blanket-covers via covered_direct.
const cText = "SECTION C — The contractor shall perform base operations support in accordance with the PWS.";
const ctxC = { fullSource: cText, sections: { C: cText } } as AuditToolContext;
const cRun = completenessOf(ctxC, ["C"], [finding("f3", "The contractor shall perform base operations support", "§C")], new Set(["C"]));
const attC = cRun.attestations.find((a) => a.section === "C");
ok("T1-12 R6: §C (non-per-obligation) still uses the blanket covered_direct short-circuit", attC?.status === "covered_direct" && cRun.covered.includes("C"));

// (4) An UNREAD §L is still unread (guard fires before the per-obligation path).
const unread = completenessOf(ctx, ["L"], [finding("f4", L_HEAD)], new Set());
ok("T1-12 R7: an unread §L stays 'unread' (not spuriously covered)",
  unread.attestations.find((a) => a.section === "L")?.status === "unread" && unread.missing.includes("L"));

console.log(`\nTier1 coverage (T1-12): ${pass}/${pass + fails.length} PASS`);
if (fails.length) { console.error("FAILS:\n" + fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
