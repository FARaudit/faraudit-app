// RED-TEAM R1 — OVER-FIRE hunt (crying-wolf false-INCOMPLETE) against AUDIT_COVERED_DIRECT_BAR_FLOOR.
// PROD-EXACT flag state: the two self-cert demotion flags are ARMED in production (worker in-container verified,
// cards #511/#516/#519). The cert probe ran them OFF, so it NEVER exercised isSelfCertDemotableSentence's real
// demotion. Here we set the REAL prod flag trio.
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
import { completenessOf } from "@/lib/audit-orchestrator";
import type { TypedFinding } from "@/lib/audit-types";

type Case = { name: string; sec: string; sectionText: string; findingExcerpt: string; expectFloored: boolean; note: string };

// A finding grounded in the section (benign, cited to the same section). Its excerpt is a substring of sectionText.
const mkFinding = (sec: string, excerpt: string): TypedFinding =>
  ({ id: "f_grounded", citation: `§${sec}`, excerpt, kind: "requirement", controllability: "bidder_controls", severity: "info", note: "benign grounded" } as unknown as TypedFinding);

const CASES: Case[] = [
  // ── Incidental technical strings in an SOW that are NOT bidder eligibility bars ──────────────────
  {
    name: "C-ISO9001-deliverable",
    sec: "C",
    sectionText: "SECTION C - DESCRIPTION/SPECIFICATIONS\nThe contractor shall deliver widgets manufactured to ISO 9001 quality specifications and provide test reports monthly.",
    findingExcerpt: "The contractor shall deliver widgets manufactured to ISO 9001 quality specifications and provide test reports monthly.",
    expectFloored: false,
    note: "ISO 9001 as a DELIVERABLE spec (product quality), not a firm-held cert bar. ELIGIBILITY_BAR_RE has \\biso\\s?9001\\b — will it fire?",
  },
  {
    name: "C-topsecret-material",
    sec: "C",
    sectionText: "SECTION C - DESCRIPTION/SPECIFICATIONS\nThe system shall protect information up to the Top Secret level in accordance with data-handling requirements.",
    findingExcerpt: "The system shall protect information up to the Top Secret level in accordance with data-handling requirements.",
    expectFloored: false,
    note: "'Top Secret' as a DATA CLASSIFICATION the system handles, not a firm clearance the bidder must hold. RE has \\btop secret\\b.",
  },
  {
    name: "D-8a-reference-packaging",
    sec: "D",
    sectionText: "SECTION D - PACKAGING AND MARKING\nEach pallet shall be marked with block 8(a) of the shipping label per MIL-STD packaging.",
    findingExcerpt: "Each pallet shall be marked with block 8(a) of the shipping label per MIL-STD packaging.",
    expectFloored: false,
    note: "'block 8(a)' = a FORM BLOCK reference in packaging, NOT the 8(a) socioeconomic program. RE has \\b8\\s?\\(?a\\)?\\b (bare).",
  },
  {
    name: "E-eligible-inspection",
    sec: "E",
    sectionText: "SECTION E - INSPECTION AND ACCEPTANCE\nGoods found nonconforming are not eligible for acceptance and shall be returned at contractor expense.",
    findingExcerpt: "Goods found nonconforming are not eligible for acceptance and shall be returned at contractor expense.",
    expectFloored: false,
    note: "'eligible for acceptance' about GOODS, not the bidder. RE has \\beligib(le|ility)\\b + \\bineligible\\b. hasUngovernedEligibility?",
  },
  {
    name: "F-secret-clearance-delivery-window",
    sec: "F",
    sectionText: "SECTION F - DELIVERIES OR PERFORMANCE\nDeliveries to the secret storage clearance area shall occur within the delivery window stated below.",
    findingExcerpt: "Deliveries to the secret storage clearance area shall occur within the delivery window stated below.",
    expectFloored: false,
    note: "'secret ... clearance area' as a PHYSICAL location, not a personnel clearance. RE has \\bsecret\\b.{0,20}\\bclearance\\b.",
  },
  {
    name: "C-setaside-benign-reference",
    sec: "C",
    sectionText: "SECTION C - DESCRIPTION/SPECIFICATIONS\nThe contractor shall set aside a small business portion of warehouse space for government-furnished property.",
    findingExcerpt: "The contractor shall set aside a small business portion of warehouse space for government-furnished property.",
    expectFloored: false,
    note: "'set aside a small business portion of warehouse space' — incidental 'set aside'+'small business' collocation, NOT a set-aside restriction.",
  },
  // ── A genuinely-covered clean section (control — must NOT floor) ─────────────────────────────────
  {
    name: "C-clean-covered",
    sec: "C",
    sectionText: "SECTION C - DESCRIPTION/SPECIFICATIONS\nThe contractor shall provide janitorial services five days per week at the stated facility.",
    findingExcerpt: "The contractor shall provide janitorial services five days per week at the stated facility.",
    expectFloored: false,
    note: "Pure clean SOW, zero bar tokens — MUST covered_direct.",
  },
];

let over = 0; const details: string[] = [];
for (const c of CASES) {
  const ctx = { fullSource: c.sectionText, sections: { [c.sec]: c.sectionText } } as any;
  const r = completenessOf(ctx, [c.sec], [mkFinding(c.sec, c.findingExcerpt)], new Set([c.sec]));
  const a = r.attestations.find((x) => x.section === c.sec);
  const floored = a?.status === "obligations_ungrounded";
  const bad = floored !== c.expectFloored;
  if (bad && floored) over++;
  details.push(`${bad ? "🔴 BREAK" : "✅ ok"}  [${c.name}] status=${a?.status} floored=${floored} expectFloored=${c.expectFloored}${floored ? ` | bar="${(a?.ungrounded?.[0]||"").slice(0,80)}"` : ""}\n        ${c.note}`);
}
console.log(details.join("\n"));
console.log(`\n=== OVER-FIRE breaks (clean section wrongly floored → false-INCOMPLETE): ${over} ===`);
