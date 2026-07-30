// RED-TEAM R1h — GROUNDING-OVERLAP MASKING (the named P0 vector). A benign finding whose excerpt span OVERLAPS a
// real bar's ELIGIBILITY_BAR_RE match → covering-overlap treats the bar as analyzed → dropped → false-green.
// Full prod flags.
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
import { completenessOf } from "@/lib/audit-orchestrator";
import { gradeCoverageV2 } from "@/lib/audit-gate-v2";
import type { TypedFinding } from "@/lib/audit-types";

const mkF = (excerpt: string, ctrl = "bidder_controls"): TypedFinding =>
  ({ id: "f", citation: "§H", excerpt, kind: "requirement", controllability: ctrl, severity: "info" } as unknown as TypedFinding);

// §H with a real clearance bar. Try to MASK it with a benign finding whose excerpt overlaps the bar's regex match.
const bar = "The offeror shall possess a Top Secret facility clearance to be eligible for award.";
const secText = `SECTION H - X\nReports are due monthly.\n${bar}`;
const ctx = { fullSource: secText, sections: { H: secText } } as any;

// Attempt 1: a benign finding whose excerpt is the SELF-CERT tail "to be eligible for award" — overlaps the \beligib
// match but NOT the clearance match. The clearance match should still floor.
// Attempt 2: a benign finding excerpt that spans the WHOLE bar sentence but is typed benign. If it overlaps ALL bar
// matches, everything is masked → covered_direct → false-green (but a finding quoting the whole bar means the panel
// SAW the bar, so covered_direct is defensible — verdict driven by that finding's own controllability).
// Attempt 3 (the real danger): a benign finding whose excerpt starts before AND runs across the clearance token but
// was mis-typed benign, masking the CLEARANCE match specifically.
const attempts: Array<[string, TypedFinding]> = [
  ["benign tail 'to be eligible for award'", mkF("to be eligible for award")],
  ["benign whole-sentence quote (panel saw bar)", mkF(bar)],
  ["benign over-scoped 'possess a Top Secret facility clearance'", mkF("possess a Top Secret facility clearance")],
];
for (const [n, f] of attempts) {
  const r = completenessOf(ctx, ["H"], [f], new Set(["H"]));
  const a = r.attestations.find((x) => x.section === "H");
  const cov = gradeCoverageV2(r.attestations);
  const masked = a?.status === "covered_direct";
  const esc = cov.disqualifierUncovered.some((d) => d.section === "H");
  console.log(`[${n}]\n   status=${a?.status} → ${masked ? "MASKED (bar dropped)" : "floored"} | v2 escalate=${esc}`);
  console.log(`   ${masked && n.startsWith("benign whole") ? "defensible (finding quotes the bar → panel analyzed it; verdict rides that finding)" : masked ? "🔴 P0 false-green: a benign-typed excerpt masked a REAL clearance bar" : "✅ safe"}`);
}
