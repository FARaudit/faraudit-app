// RED-TEAM R1g — the STRONGEST over-fire: standard §E Inspection & Acceptance "eligible/ineligible for acceptance"
// language about GOODS. FULL prod flag set. Proves it escalates §E to NHR end-to-end (completenessOf → gradeCoverageV2).
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
import { completenessOf } from "@/lib/audit-orchestrator";
import { gradeCoverageV2 } from "@/lib/audit-gate-v2";
import type { TypedFinding } from "@/lib/audit-types";

const mkF = (excerpt: string): TypedFinding =>
  ({ id: "f", citation: "§E", excerpt, kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding);

// A realistic §E section: one benign grounded obligation + a STANDARD acceptance-eligibility sentence about goods.
const secText = [
  "SECTION E - INSPECTION AND ACCEPTANCE",
  "Inspection and acceptance shall be performed at destination by the COR.",
  "Supplies not conforming to the specification are not eligible for acceptance and may be rejected.",
].join("\n");
const ctx = { fullSource: secText, sections: { E: secText } } as any;
const r = completenessOf(ctx, ["E"], [mkF("Inspection and acceptance shall be performed at destination by the COR.")], new Set(["E"]));
const a = r.attestations.find((x) => x.section === "E");
const cov = gradeCoverageV2(r.attestations);
const escalated = cov.disqualifierUncovered.some((d) => d.section === "E");
console.log(`§E status=${a?.status}`);
console.log(`§E covered_direct BEFORE fix (one grounded finding) → NOW: ${a?.status}`);
console.log(`gradeCoverageV2 → disqualifierUncovered on §E: ${escalated} (grade=${cov.coverageGrade.toFixed(2)})`);
console.log(escalated
  ? "🔴 P1 OVER-FIRE CONFIRMED e2e: routine §E acceptance-eligibility language about GOODS floors §E → NHR (crying wolf)."
  : "absorbed — not a verdict-level over-fire");
