// RED-TEAM R1f — V2 PRODUCTION LOOP. Closes the over-fire through the REAL completenessOf → gradeCoverageV2 chain
// (both prod flags ON). Shows whether each over-fire (a) escalates to disqualifierUncovered (harmful false show-stopper),
// (b) lands in ungroundedNonBarSignal (absorbed), or (c) coverageGrade drops (false-INCOMPLETE). No stubs.
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
import { completenessOf } from "@/lib/audit-orchestrator";
import { gradeCoverageV2 } from "@/lib/audit-gate-v2";
import type { TypedFinding } from "@/lib/audit-types";

const mkF = (sec: string, excerpt: string): TypedFinding =>
  ({ id: "f", citation: `§${sec}`, excerpt, kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding);

type Case = { name: string; sec: string; grounded: string; incidental: string; realBar: boolean };
const CASES: Case[] = [
  { name: "OVER: ISO 9001 process spec", sec: "C", grounded: "The contractor shall provide monthly status reports.", incidental: "All welds shall conform to ISO 9001 process controls.", realBar: false },
  { name: "OVER: Top Secret data-class", sec: "C", grounded: "The contractor shall staff the help desk.", incidental: "Documents classified up to Top Secret shall be stored in the approved container.", realBar: false },
  { name: "OVER: block 8(a) form ref", sec: "D", grounded: "The contractor shall paint the surfaces.", incidental: "Enter the value in block 8(a) of the inspection form.", realBar: false },
  { name: "OVER: ineligible GOODS", sec: "E", grounded: "Inspection shall occur at destination.", incidental: "Nonconforming units are ineligible for acceptance and shall be rejected.", realBar: false },
  { name: "UNDER-check: REAL clearance bar", sec: "H", grounded: "The contractor shall attend kickoff.", incidental: "The contractor shall possess a Top Secret facility clearance at time of award.", realBar: true },
];

for (const c of CASES) {
  const secText = `SECTION ${c.sec} - X\n${c.grounded}\n${c.incidental}`;
  const ctx = { fullSource: secText, sections: { [c.sec]: secText } } as any;
  const r = completenessOf(ctx, [c.sec], [mkF(c.sec, c.grounded)], new Set([c.sec]));
  const cov = gradeCoverageV2(r.attestations);
  const disq = cov.disqualifierUncovered.filter((d) => d.section === c.sec);
  const nonBar = (cov.ungroundedNonBarSignal ?? []).filter((d) => d.section === c.sec);
  const verdict = disq.length ? "🔴 ESCALATES (disqualifierUncovered → NHR)" : nonBar.length ? "absorbed (ungroundedNonBarSignal)" : cov.coverageGrade < 1 ? "coverageGrade<1 (false-INCOMPLETE)" : "covered";
  const judge = c.realBar
    ? (disq.length ? "✅ correct (real bar escalates)" : "🔴 P0 false-green")
    : (disq.length ? "🔴 P1 crying-wolf false show-stopper" : "ok");
  console.log(`[${c.name}]\n   status=${r.attestations.find(a=>a.section===c.sec)?.status} grade=${cov.coverageGrade.toFixed(2)} → ${verdict}\n   ${judge}`);
}
