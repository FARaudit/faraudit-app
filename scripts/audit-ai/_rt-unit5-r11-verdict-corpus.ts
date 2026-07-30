import { readFileSync } from "fs";
import { deriveVerdict, applyQuantityAmbiguityFidelity, detectQuantityAmbiguities } from "../../src/lib/audit-decide";
import type { TypedFinding, VerdictInputs } from "../../src/lib/audit-findings";

const base = (findings: TypedFinding[], source: string): VerdictInputs => ({
  findings, bidderProfile: null, coverageComplete: true, verifierSound: true,
  conflict: false, manifestComplete: true, source,
} as VerdictInputs);
const clean: TypedFinding[] = [
  { id: "f1", requirement: "Offeror shall provide a staffing plan.", citation: "PWS 3.1",
    kind: "submission", controllability: "bidder_controls", grounded: true, severity: "P3",
    curableInWindow: true } as any,
];

console.log("=== R11 VERDICT FLIP — R10 second-subject seam (bare-noun / possessive / proper 2nd subject) ===");
for (const benign of [
  "Is the assumption staff bill 520 hours or 1,040 hours?",          // bare noncount 2nd subj + base verb
  "Is your understanding our staff bill 520 hours or 1,040 hours?",  // possessive-headed 2nd subj
  "Is the assumption Acme bill 520 hours or 1,040 hours?",           // proper-noun 2nd subj
]) {
  const vBefore = deriveVerdict(base(clean, benign));
  const afterFindings = applyQuantityAmbiguityFidelity(clean, benign, { enabled: true });
  const vAfter = deriveVerdict(base(afterFindings, benign));
  const flip = (vBefore as any).verdict !== (vAfter as any).verdict;
  console.log(`input: "${benign}"`);
  console.log(`  BEFORE: ${(vBefore as any).verdict} | AFTER: ${(vAfter as any).verdict} eligible:${(vAfter as any).eligible}  ${flip ? "★ FLIP (OVER-FIRE)" : ""}`);
}

console.log("\n=== 3 REALISTIC MULTI-SENTENCE SAM Q&A PARAGRAPHS (should fire ONLY on genuine terminal which-qty Q) ===");
const paras: Array<{ tag: string; text: string; expectFires: number; note: string }> = [
  {
    tag: "P1 genuine which-qty amid declaratives",
    text: `Q3: The base-period level of effort is unclear. The Schedule lists 520 hours for CLIN 0001. ` +
      `The PWS references 20 hours per week over 52 weeks, which equals 1,040 hours. The proposal is limited to 30 pages or 20 pages for small business. ` +
      `Is the total requirement 520 hours or 1,040 hours? The Government will clarify by amendment.`,
    expectFires: 1, note: "1 genuine terminal question; the 30/20 pages is a directive range (no Q) — must be ignored",
  },
  {
    tag: "P2 all-declarative (no genuine Q) — must be ZERO",
    text: `The Schedule of Services estimates 520 hours for the base period. Option Year 1 adds an additional 1,040 hours. ` +
      `Offerors shall price 520 hours or 1,040 hours as directed in Attachment 3. The page limit is 30 pages or 20 pages.`,
    expectFires: 0, note: "declarative + directive option-menu; NO interrogative — must be zero",
  },
  {
    tag: "P3 the R11 embedded-declarative form buried in prose",
    text: `Q9: A vendor requested clarification on staffing. The CO notes the Schedule shows 520 hours. ` +
      `Is the assumption staff bill 520 hours or 1,040 hours? An amendment will follow.`,
    expectFires: 0, note: "the CONTRIVED r11 over-fire form — an over-fire if it fires (we EXPECT it to fire, flagged)",
  },
];
for (const p of paras) {
  const ambs = detectQuantityAmbiguities(p.text);
  const flag = ambs.length === p.expectFires ? "OK" : (ambs.length > p.expectFires ? "★OVER" : "under");
  console.log(`[${p.tag}] fires=${ambs.length} expect=${p.expectFires} ${flag}  — ${p.note}`);
  ambs.forEach((a) => console.log(`     -> ${JSON.stringify(a.sentence.slice(0, 90))}`));
}

console.log("\n=== REAL CORPUS ===");
const seq1 = readFileSync("src/lib/__fixtures__/seq1-FA303026Q0020-noticebody.56ef9717.txt", "utf8");
const rec = JSON.parse(readFileSync("/tmp/seq2-runrecord.json", "utf8"));
const seq2src: string = rec?.input?.fullSource ?? "";
console.log("seq2 .input.fullSource length:", seq2src.length);
console.log("seq1 (FA303026Q0020) fires:", detectQuantityAmbiguities(seq1).length, "(expect 0)");
const s2 = detectQuantityAmbiguities(seq2src);
console.log("seq2 (dccce793 fullSource) fires:", s2.length, "(expect 1 — genuine 520 vs 1,040)");
s2.forEach((a) => console.log("   ->", a.a, a.unit, "vs", a.b, "::", JSON.stringify(a.sentence.slice(0, 140))));
