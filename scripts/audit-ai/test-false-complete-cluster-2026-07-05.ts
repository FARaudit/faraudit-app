// $0 regression for the FALSE-COMPLETE cluster (Brain card 274, ingest defects — fix before any billable run).
//  S1 — a binding doc head-truncated at the source (oversized .xlsx wage/price sheet) carries truncated:true, so the
//        honest-fail gate (bindingContentLossDocs → agenticManifestComplete) treats it as a content loss (not COMPLETE).
//  S3 — coreMissingFor: a SOLICITATION-type buy (requiresLM) with a STRAY 52.212-1/-2 ref no longer free-passes to
//        COMPLETE via the unknown-format commercialRef short-circuit; only a non-solicitation (requiresLM=false) does.
//  S7 — completenessOf: a section is covered_direct ONLY by a finding CITED TO THAT SAME SECTION — a §B-cited finding
//        whose excerpt coincidentally appears in §M text no longer falsely certifies §M covered.
// Run: npx tsx scripts/audit-ai/test-false-complete-cluster-2026-07-05.ts
import { coreMissingFor, completenessOf } from "@/lib/audit-orchestrator";
import { bindingContentLossDocs, agenticManifestComplete } from "@/lib/audit-executor-v3";
import type { IngestionMeta } from "@/lib/sam-attachments";
import type { AuditToolContext } from "@/lib/audit-tools";
import type { TypedFinding } from "@/lib/audit-findings";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => { console.log(`${cond ? "  ✓" : "✗ FAIL"}  ${name}${cond || !detail ? "" : `  — ${detail}`}`); cond ? pass++ : fail++; };
const f = (o: Partial<TypedFinding> & { citation: string; excerpt: string }): TypedFinding => ({ requirement: o.requirement ?? "r", grounded: true, lens: "x", kind: o.kind ?? "technical_spec", controllability: o.controllability ?? "bidder_controls", id: o.id ?? "f1", ...o });

// ── S1 — truncated binding doc is a content loss (documents_complete=false) ───────────────────────────────
console.log("S1 — an at-source-truncated binding doc caps documents_complete");
const mkIngest = (files: IngestionMeta["files"]): IngestionMeta => ({ files, files_total: files.length, files_ingested: files.filter((x) => x.ingested).length, overflow: false } as unknown as IngestionMeta);
const wageTruncated = mkIngest([{ name: "wage-determination-2026.xlsx", role: "attachment", bytes: 900000, ingested: true, has_text: true, truncated: true }]);
check("truncated binding .xlsx → flagged as a binding content loss", bindingContentLossDocs(wageTruncated).some((d) => /wage-determination/.test(d.name)));
check("truncated binding .xlsx → agenticManifestComplete = FALSE (not a clean COMPLETE)", agenticManifestComplete(wageTruncated, false, true) === false);
const wageWhole = mkIngest([{ name: "wage-determination-2026.xlsx", role: "attachment", bytes: 90000, ingested: true, has_text: true, truncated: false }]);
check("NON-truncated binding .xlsx with text → NOT a content loss (control)", bindingContentLossDocs(wageWhole).length === 0);
check("NON-truncated binding .xlsx → agenticManifestComplete = TRUE (control)", agenticManifestComplete(wageWhole, false, true) === true);

// ── S3 — coreMissingFor: stray 52.212 ref no longer free-passes a solicitation ───────────────────────────
console.log("\nS3 — commercialRef free-pass gated behind !requiresLM (no notice-body-blind COMPLETE)");
const sowOnly: AuditToolContext = { fullSource: "STATEMENT OF WORK\nThe contractor shall deliver widgets per the schedule. Clause 52.212-1 applies by reference. No proposal instructions are included here." };
const missSol = coreMissingFor(sowOnly, { requiresLM: true });
check("SOW-only + stray 52.212 ref + requiresLM(solicitation) → CAPPED (non-empty core-missing), not a free pass", missSol.length > 0, `got ${JSON.stringify(missSol)}`);
const missRfi = coreMissingFor(sowOnly, { requiresLM: false });
check("SOW-only + stray 52.212 ref + requiresLM=false (RFI/Sources Sought) → free pass [] (no §L/§M required)", missRfi.length === 0, `got ${JSON.stringify(missRfi)}`);

// ── S7 — completenessOf: covered_direct requires the finding be CITED to the SAME section ─────────────────
console.log("\nS7 — a cross-section finding no longer falsely certifies §M covered_direct");
const ctxM: AuditToolContext = { fullSource: "irrelevant", sections: {
  B: "Pricing shall be firm fixed price for all CLINs.",
  M: "Award is made on a best value tradeoff basis, where pricing shall be firm fixed price is one factor the Government evaluates.",
} };
// RE-BASELINED 2026-08-04 — both legs asserted a STATUS LITERAL this section can no longer carry. §L/§M are
// PER_OBLIGATION sections (audit-orchestrator.ts:2171 excludes them from blanket covered_direct), so §M is graded
// obligation-by-obligation and reaches `covered_attested`, never `covered_direct`. Leg 1's assertion was also
// broader than its own stated intent ("no false covered_DIRECT"): under card #474 ruling 3
// (AUDIT_LEDGER_BROAD_AMBIGUOUS, live-armed) §M's lone government-evaluation-methodology sentence is a demoted
// NON-BAR, so the section is credited `covered_boilerplate_signal` — by the demotion ledger, NOT by the §B
// finding. The invariant this case exists to defend is intact, and is now asserted DIRECTLY rather than through
// a status literal: no cross-section finding may ever be CREDITED to §M.
const bCitedOnly = [f({ requirement: "FFP pricing", citation: "§B", excerpt: "Pricing shall be firm fixed price for all CLINs.", id: "b1" })];
const covB = completenessOf(ctxM, ["M"], bCitedOnly, new Set(["M"]));
const attB = covB.attestations[0];
check("§B-cited finding whose excerpt is in §M text → never covered_direct", attB?.status !== "covered_direct", `status=${attB?.status}`);
check("§B-cited finding is NOT credited to §M (the cross-section invariant)", !(attB?.citedFindingIds ?? []).includes("b1"), JSON.stringify(attB?.citedFindingIds));
const mCited = [f({ requirement: "eval basis", citation: "§M", excerpt: "Award is made on a best value tradeoff basis", id: "m1" })];
const covM = completenessOf(ctxM, ["M"], mCited, new Set(["M"]));
check("§M-cited finding whose excerpt is in §M text → §M covered (no over-tightening)", covM.covered.includes("M"), `status=${covM.attestations[0]?.status}`);
check("§M reaches it through the per-obligation path, not a blanket credit", covM.attestations[0]?.status === "covered_attested", `status=${covM.attestations[0]?.status}`);

console.log(`\n${fail === 0 ? "✅ ALL GREEN" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
