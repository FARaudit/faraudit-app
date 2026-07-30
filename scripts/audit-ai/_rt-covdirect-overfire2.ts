// RED-TEAM R1b — OVER-FIRE hunt v2: incidental bar-token in a DIFFERENT sentence from the grounded finding
// (so the covering-span cannot mask it). This is the realistic false-INCOMPLETE shape: a clean SOW where the
// grounded finding is on sentence 1 but sentence 2 carries an incidental token ELIGIBILITY_BAR_RE matches.
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
import { completenessOf } from "@/lib/audit-orchestrator";
import type { TypedFinding } from "@/lib/audit-types";

type Case = { name: string; sec: string; groundedSentence: string; incidentalSentence: string; expectFloored: boolean; note: string };
const mkFinding = (sec: string, excerpt: string): TypedFinding =>
  ({ id: "f_grounded", citation: `§${sec}`, excerpt, kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding);

const CASES: Case[] = [
  { name: "C-iso9001-other-sentence", sec: "C",
    groundedSentence: "The contractor shall provide monthly status reports to the COR.",
    incidentalSentence: "All welds shall conform to ISO 9001 process controls.",
    expectFloored: false, note: "ISO 9001 as a process spec in a separate sentence — not a firm bar." },
  { name: "C-topsecret-data-other-sentence", sec: "C",
    groundedSentence: "The contractor shall staff the help desk during business hours.",
    incidentalSentence: "Documents classified up to Top Secret shall be stored in the approved container.",
    expectFloored: false, note: "Top Secret = data classification handled, separate sentence." },
  { name: "C-8a-block-other-sentence", sec: "C",
    groundedSentence: "The contractor shall paint the exterior surfaces annually.",
    incidentalSentence: "Enter the value in block 8(a) of the inspection form.",
    expectFloored: false, note: "block 8(a) form reference, separate sentence." },
  { name: "E-eligible-goods-other-sentence", sec: "E",
    groundedSentence: "Inspection shall occur at destination.",
    incidentalSentence: "Nonconforming units are ineligible for acceptance and shall be rejected.",
    expectFloored: false, note: "ineligible about goods, separate sentence." },
  { name: "F-registered-mail-other-sentence", sec: "F",
    groundedSentence: "Deliveries shall be made FOB destination.",
    incidentalSentence: "Shipping notices shall be sent by registered mail to the receiving office.",
    expectFloored: false, note: "'registered' in 'registered mail' — RE has 'registered' branch. escalate?" },
  { name: "C-size-standard-mention-other-sentence", sec: "C",
    groundedSentence: "The contractor shall mow the grounds weekly.",
    incidentalSentence: "The applicable NAICS code and its size standard are listed in the notice.",
    expectFloored: false, note: "bare size-standard mention — SHOULD demote as self-cert (flags ON)." },
];

let over = 0; const details: string[] = [];
for (const c of CASES) {
  const secText = `SECTION ${c.sec} - X\n${c.groundedSentence}\n${c.incidentalSentence}`;
  const ctx = { fullSource: secText, sections: { [c.sec]: secText } } as any;
  const r = completenessOf(ctx, [c.sec], [mkFinding(c.sec, c.groundedSentence)], new Set([c.sec]));
  const a = r.attestations.find((x) => x.section === c.sec);
  const floored = a?.status === "obligations_ungrounded";
  const bad = floored !== c.expectFloored;
  if (bad && floored) over++;
  details.push(`${bad ? "🔴 BREAK(over-fire)" : "✅ ok"}  [${c.name}] status=${a?.status}${floored ? ` bar="${(a?.ungrounded?.[0]||"").slice(0,80)}"` : ""}\n        ${c.note}`);
}
console.log(details.join("\n"));
console.log(`\n=== OVER-FIRE breaks: ${over} ===`);
