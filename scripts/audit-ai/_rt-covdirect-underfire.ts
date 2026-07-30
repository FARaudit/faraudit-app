// RED-TEAM R1c — UNDER-FIRE hunt (CATASTROPHIC false-green): a REAL firm-only bidder-disqualifier co-resident with
// a benign grounded finding that the floor FAILS to flag → §C/§H reads covered_direct → false-COMPLETE on a bar.
// PROD-EXACT flags ON.
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
import { completenessOf } from "@/lib/audit-orchestrator";
import type { TypedFinding } from "@/lib/audit-types";

type Case = { name: string; sec: string; benignSentence: string; barSentence: string; expectFloored: boolean; note: string };
const mkFinding = (sec: string, excerpt: string): TypedFinding =>
  ({ id: "f_grounded", citation: `§${sec}`, excerpt, kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding);

const CASES: Case[] = [
  // ── Verb-less / oddly-phrased REAL bars the regex may miss ────────────────────────────────────
  { name: "H-verbless-clearance-req", sec: "H",
    benignSentence: "The contractor shall attend a monthly progress meeting.",
    barSentence: "Facility Clearance Requirement: Top Secret. Personnel Clearance: TS/SCI required prior to contract start.",
    expectFloored: true, note: "REAL bar stated as a verb-less HEADER/label, not 'shall hold'. Does RE catch \\btop secret\\b / \\bts/sci\\b?" },
  { name: "H-eligibility-restricted-to-cleared", sec: "H",
    benignSentence: "The contractor shall submit invoices monthly.",
    barSentence: "Only firms holding an active facility security clearance are eligible to receive an award under this requirement.",
    expectFloored: true, note: "REAL firm-only clearance bar. But 'eligible to receive an award' is SELF-REFERENTIAL → could be WRONGLY demoted?" },
  { name: "C-third-party-cmmc-assessment", sec: "C",
    benignSentence: "The contractor shall provide help desk support.",
    barSentence: "The offeror's facility must be assessed and certified at CMMC Level 2 by a C3PAO prior to award.",
    expectFloored: true, note: "REAL third-party CMMC bar. 'certified ... by a C3PAO' = third-party. Does it survive demotion?" },
  { name: "C-setaside-firm-restriction", sec: "C",
    benignSentence: "The contractor shall maintain the grounds.",
    barSentence: "Award is restricted to firms holding an active HUBZone certification from the SBA.",
    expectFloored: true, note: "HUBZone CERTIFICATION FROM SBA — third-party-conferred status (not pure self-cert). Should escalate, NOT demote." },
  { name: "H-itar-registration-bar", sec: "H",
    benignSentence: "The contractor shall provide status reports.",
    barSentence: "The offeror shall be registered with the Directorate of Defense Trade Controls under ITAR at time of award.",
    expectFloored: true, note: "REAL ITAR/DDTC registration bar (external registry, not SAM). Does RE 'shall be ... registered' catch it and NOT demote?" },
  { name: "H-split-across-sentences", sec: "H",
    benignSentence: "The contractor shall deliver reports quarterly.",
    barSentence: "The offeror must possess the following at award. A Top Secret facility clearance issued by DCSA.",
    expectFloored: true, note: "Bar SPLIT across a sentence boundary: obligation verb in sentence 1, the clearance noun in sentence 2." },
  { name: "H-cmmc-bare-token", sec: "H",
    benignSentence: "The contractor shall attend kickoff.",
    barSentence: "CMMC Level 2 certification is mandatory for all personnel accessing the network.",
    expectFloored: true, note: "Bare CMMC bar — RE has \\bcmmc\\b. Does it fire and survive demotion?" },
];

let under = 0; const details: string[] = [];
for (const c of CASES) {
  const secText = `SECTION ${c.sec} - X\n${c.benignSentence}\n${c.barSentence}`;
  const ctx = { fullSource: secText, sections: { [c.sec]: secText } } as any;
  const r = completenessOf(ctx, [c.sec], [mkFinding(c.sec, c.benignSentence)], new Set([c.sec]));
  const a = r.attestations.find((x) => x.section === c.sec);
  const floored = a?.status === "obligations_ungrounded";
  const bad = floored !== c.expectFloored;
  if (bad && !floored) under++;  // failed to floor a REAL bar = catastrophic false-green
  details.push(`${bad && !floored ? "🔴 P0 UNDER-FIRE(false-green)" : bad ? "🟡 unexpected" : "✅ ok(floored)"}  [${c.name}] status=${a?.status}\n        ${c.note}`);
}
console.log(details.join("\n"));
console.log(`\n=== UNDER-FIRE breaks (REAL bar NOT floored → false-COMPLETE / false-green): ${under} ===`);
