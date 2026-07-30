// DRY-CERT — remaining vectors: multi-bar global scan, §B/§D/§F realistic content, read_no_obligation escape,
// self-cert wrongly demoting a firm-only bar, flag-OFF byte-identity.
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
import { completenessOf } from "@/lib/audit-orchestrator";
import type { TypedFinding } from "@/lib/audit-types";

let pass = 0; const fails: string[] = [];
const ok = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`❌ ${l}: got ${JSON.stringify(g)} != ${JSON.stringify(e)}`); };
const mkF = (sec: string, ex: string): TypedFinding =>
  ({ id: "f", citation: `§${sec}`, excerpt: ex, kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding);
const st = (sec: string, src: string, findings: TypedFinding[]) =>
  completenessOf({ fullSource: src } as any, [sec], findings, new Set([sec])).attestations.find((x) => x.section === sec);

const BENIGN = "Government-furnished property will be provided during performance.";

// (1) MULTI-BAR: benign finding grounds ONE sentence; TWO different real bars live in two OTHER sentences. Global scan
// must catch BOTH → floor, and BOTH bar sentences must appear in ungrounded[].
{
  const BAR1 = "The contractor shall possess a Top Secret facility clearance at time of award.";
  // NOTE: SAM-registration is a RATIFIED bidder-self-determinable class (card #516) → intentionally demoted, NOT a
  // firm-only bar. Use a genuine firm-only second bar (CMMC) to exercise the multi-bar global scan.
  const BAR2 = "The offeror shall maintain CMMC Level 2 certification throughout performance.";
  const src = ["SECTION H - SPECIAL CONTRACT REQUIREMENTS", BENIGN, BAR1, BAR2].join("\n");
  const a = st("H", src, [mkF("H", BENIGN)]);
  ok("(1) multi-bar §H floors", a?.status, "obligations_ungrounded");
  ok("(1) BAR1 surfaced", a?.ungrounded.some((u) => /top secret facility clearance/i.test(u)), true);
  ok("(1) BAR2 surfaced", a?.ungrounded.some((u) => /cmmc/i.test(u)), true);
}
// (2) MULTI-BAR where ONE bar is grounded and a SECOND ungrounded bar hides in the same section.
{
  const BAR1 = "The contractor shall possess a Top Secret facility clearance at time of award.";
  const BAR2 = "The offeror must hold an active CMMC Level 2 certification.";
  const src = ["SECTION H - SPECIAL CONTRACT REQUIREMENTS", BAR1, BAR2].join("\n");
  // ground BAR1 only
  const a = st("H", src, [mkF("H", BAR1)]);
  ok("(2) second ungrounded bar still floors §H", a?.status, "obligations_ungrounded");
  ok("(2) the CMMC bar surfaced (not masked by the grounded clearance bar)", a?.ungrounded.some((u) => /cmmc/i.test(u)), true);
}
// (3) §B realistic — a supplies/price section with a real set-aside restriction co-resident with a benign CLIN finding.
{
  const CLIN = "CLIN 0001 covers base year quantities as specified in the schedule.";
  const BAR = "Award of these line items is restricted to HUBZone small business concerns.";
  const src = ["SECTION B - SUPPLIES OR SERVICES AND PRICES", CLIN, BAR].join("\n");
  const a = st("B", src, [mkF("B", CLIN)]);
  ok("(3) §B set-aside restriction floors", a?.status, "obligations_ungrounded");
}
// (4) §F realistic — deliveries section, benign delivery finding + a real facility-clearance bar.
{
  const DEL = "Deliveries shall be made to the destination within 30 days after order.";
  const BAR = "Performance requires personnel holding a facility security clearance at the Secret level.";
  const src = ["SECTION F - DELIVERIES OR PERFORMANCE", DEL, BAR].join("\n");
  const a = st("F", src, [mkF("F", DEL)]);
  ok("(4) §F clearance bar floors", a?.status, "obligations_ungrounded");
}
// (5) read_no_obligation ESCAPE — a section whose ONLY content is a VERB-LESS bar (no benign finding, no obligation verb).
// Does the floor still fire, or does read_no_obligation escape before it? (The floor runs BEFORE read_no_obligation.)
{
  const src = ["SECTION H - SPECIAL CONTRACT REQUIREMENTS", "Facility Clearance Requirement: Top Secret."].join("\n");
  const a = st("H", src, []); // NO grounded finding at all
  ok("(5) verb-less bar with NO finding still floors (floor precedes read_no_obligation)", a?.status, "obligations_ungrounded");
}
// (6) SELF-CERT MIS-DEMOTION hunt — a FIRM-ONLY bar coupled with a size-standard/self-cert token. isSelfCertDemotable
// must NOT demote a sentence that also carries a firm-only clearance/registration bar.
{
  const BAR = "The offeror must meet the size standard for NAICS 541512 and shall hold a Top Secret facility clearance.";
  const src = ["SECTION C - DESCRIPTION", BENIGN, BAR].join("\n");
  const a = st("C", src, [mkF("C", BENIGN)]);
  ok("(6) size-standard + clearance coupling does NOT self-cert-demote away the clearance bar", a?.status, "obligations_ungrounded");
}
// (7) FLAG-OFF byte-identity — the SAME multi-bar §H must be covered_direct when the flag is off.
{
  process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "false";
  const BAR1 = "The contractor shall possess a Top Secret facility clearance at time of award.";
  const src = ["SECTION H - SPECIAL CONTRACT REQUIREMENTS", BENIGN, BAR1].join("\n");
  const a = st("H", src, [mkF("H", BENIGN)]);
  ok("(7) flag OFF ⇒ covered_direct (byte-identical status quo)", a?.status, "covered_direct");
  process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
}

console.log(`\n${fails.length === 0 ? "✅ ALL PASS" : "❌ FAIL"} — ${pass} passed, ${fails.length} failed`);
fails.forEach((f) => console.log(f));
if (fails.length) process.exit(1);
