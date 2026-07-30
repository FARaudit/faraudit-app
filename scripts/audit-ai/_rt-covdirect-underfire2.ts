// RED-TEAM R1d — UNDER-FIRE hunt v2: the two SUBTLE vectors.
//  (I) WRONGLY-DEMOTED firm-only bar: a real third-party/firm bar whose sentence isSelfCertDemotableSentence demotes.
//  (II) GROUNDING-OVERLAP MASKING: a benign finding whose excerpt coincidentally OVERLAPS a real bar's match span,
//       so the covering-overlap treats the bar as "analyzed" and drops it (false-green).
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
import { completenessOf, isBidderSelfDeterminableSentence } from "@/lib/audit-orchestrator";
import type { TypedFinding } from "@/lib/audit-types";

const mkF = (sec: string, excerpt: string): TypedFinding =>
  ({ id: "f", citation: `§${sec}`, excerpt, kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding);

// ── (I) direct demotion-predicate probe (isolate the shape that WRONGLY demotes a real bar) ──────────
console.log("=== (I) isSelfCertDemotableSentence WRONGLY demotes a real firm-only bar? (true = WRONG demote = under-fire risk) ===");
const demoteProbes: Array<[string, string]> = [
  ["setaside-with-required-registration", "This requirement is a HUBZone set-aside and the offeror must be a certified HUBZone small business concern."],
  ["setaside-plus-sba-cert-verb", "Award is set aside for 8(a) program participants certified by the SBA."],
  ["socio-selfcert-plus-clearance-noun", "The offeror shall be an eligible small business under the applicable size standard."],
  ["setaside-only-sentence", "This acquisition is a total small business set-aside."],
  ["wosb-selfcert", "This procurement is set aside for women-owned small business concerns."],
  ["setaside-coupled-hidden-bar", "This is a small business set-aside; the awardee's facility must be inspected by DCAA."],
];
for (const [n, s] of demoteProbes) {
  const demoted = isBidderSelfDeterminableSentence(s, "HUBZone");
  console.log(`  ${demoted ? "DEMOTED" : "escalate"}  [${n}] "${s.slice(0,70)}..."`);
}

// ── (II) grounding-overlap masking: benign finding whose excerpt OVERLAPS a real bar match ───────────
console.log("\n=== (II) GROUNDING-OVERLAP MASKING (benign finding excerpt overlaps a real bar → bar dropped → false-green) ===");
// The bar 'shall possess a top secret facility clearance' — pick a benign finding excerpt that STARTS before the
// match and extends INTO it, so covering-span overlaps the bar match but the finding is benign/mis-scoped.
{
  const bar = "The contractor shall possess a Top Secret facility clearance at time of award.";
  const sec = "H";
  const secText = `SECTION H - X\nGovernment property is provided.\n${bar}`;
  // Benign finding excerpt = a MIS-SCOPED excerpt that a real panel finding could carry: it quotes a run that
  // starts at benign text and RUNS INTO the bar sentence (an over-long excerpt). If such an excerpt grounds and
  // overlaps the bar match, the bar is masked.
  const overreach = "The contractor shall possess a Top Secret facility clearance";  // partial excerpt of the bar itself
  const ctx = { fullSource: secText, sections: { H: secText } } as any;
  // finding cited to §H, excerpt = a benign-labeled finding but its excerpt IS the bar prefix (e.g. panel found it
  // but typed it as a benign 'requirement' with bidder_controls — NOT dropped → counts as covering).
  const r = completenessOf(ctx, ["H"], [mkF("H", overreach)], new Set(["H"]));
  const a = r.attestations.find((x) => x.section === "H");
  console.log(`  benign-typed finding excerpt == bar prefix → status=${a?.status} (covered_direct = the bar is treated ANALYZED; is that correct?)`);
  console.log(`     NOTE: a finding whose excerpt IS the bar means the panel SAW it → analyzed → covered_direct is arguably CORRECT (verdict driven by that finding's controllability elsewhere).`);
}
// The dangerous variant: a benign finding cited to §H whose excerpt is SHORT and generic but happens to appear
// as a SUBSTRING that overlaps the bar-match offset due to a repeated phrase.
{
  const sec = "H";
  const bar = "Offerors must hold an active Secret clearance to be eligible.";
  // benign finding excerpt 'to be eligible' — appears INSIDE the bar sentence. Does indexOf find it overlapping the
  // ELIGIBILITY_BAR_RE match, masking the clearance bar?
  const secText = `SECTION H - X\nReports are due monthly.\n${bar}`;
  const ctx = { fullSource: secText, sections: { H: secText } } as any;
  const r = completenessOf(ctx, ["H"], [mkF("H", "to be eligible")], new Set(["H"]));
  const a = r.attestations.find((x) => x.section === "H");
  console.log(`\n  benign finding excerpt='to be eligible' (a generic substring INSIDE the clearance-bar sentence) → status=${a?.status}`);
  console.log(`     If covered_direct: a generic 3-word benign excerpt MASKED a real Secret-clearance bar via span overlap = P0 false-green.`);
}
