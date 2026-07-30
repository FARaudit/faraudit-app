// FINAL INDEPENDENT DRY-CERT — Phase 4 covered_direct HARD-BAR floor (R3 seam attack).
// PROD QUARTET armed; drives REAL completenessOf + gradeCoverageV2 (no stubs). Independent of the builder's probes.
// Convention: an assertion FAILS the cert if it detects an in-scope UNDER-FIRE (real bar SKIPPED) or OVER-FIRE
// (clean/benign sentence FLOORED). Every case is first checked to be IN SCOPE (ELIGIBILITY_BAR_RE matches) — an
// out-of-scope sentence (RE never matches) is the ratified-detector limit and does NOT count.
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
import { completenessOf } from "@/lib/audit-orchestrator";
import type { TypedFinding } from "@/lib/audit-types";

const ELIGIBILITY_BAR_RE = /\b(?:shall|must|required to) (?:hold|possess|maintain|have) [\w /:.\-]{0,40}?(?:clearance|certif|accredit|licens|registration|registered|eligib)\b|\b(?:shall|must|required to) be (?:(?!\bby\b)[\w /:.\-]){0,40}?(?:certified|registered|accredited|licensed)\b|\bcleared (?:to|at|for)\s(?:the\s)?(?:secret|top[\s-]?secret|ts[\s/]?sci|sci|confidential|interim)\b|\bregistered in sam\b|\bactive sam(?:\.gov)? registration\b|\b(?:facility|security|personnel) clearance\b|\btop secret\b|\bsecret\b.{0,20}\bclearance\b|\bcmmc\b|\bas9100\b|\biso\s?9001\b|\bsize standard\b|\bdebarr?ed\b|\bexcluded part(?:y|ies)\b|\bsam exclusion\b|\beligib(?:le|ility)\b|\bineligible\b|\b(?:small[\s-]?business|total|competitive|partial|hubzone|sdvosb|wosb|edwosb|service[\s-]?disabled|women[\s-]?owned|veteran[\s-]?owned|8\s?\(?a\)?)[\s\w%,\-]{0,20}?set[\s-]?aside\b|\bset[\s-]?aside[\s\w%,\-]{0,20}?(?:small[\s-]?business|concern|program)\b|\brestricted to\s[\w,\- ]{0,30}?(?:small[\s-]?business|concern|offeror|firm|8\s?\(?a\)?|hubzone|sdvosb|wosb|edwosb|women[\s-]?owned|veteran[\s-]?owned|service[\s-]?disabled|certified|eligib)\b|\blimited to\s[\w,\- ]{0,30}?(?:small[\s-]?business|concern|offeror|firm|8\s?\(?a\)?|hubzone|sdvosb|wosb|edwosb|women[\s-]?owned|veteran[\s-]?owned|service[\s-]?disabled)\b|\b8\s?\(?a\)?\b|\bsdvosb\b|\bhubzone\b|\bwosb\b|\bedwosb\b|\bservice[\s-]?disabled\b/i;
const inScope = (s: string) => new RegExp(ELIGIBILITY_BAR_RE.source, "i").test(s.replace(/\s+/g, " ").trim().toLowerCase());

let pass = 0; const fails: string[] = []; const notes: string[] = [];
const ok = (l: string, g: unknown, e: unknown) => { if (JSON.stringify(g) === JSON.stringify(e)) pass++; else fails.push(`FAIL ${l}: got ${JSON.stringify(g)} != ${JSON.stringify(e)}`); };

const f = (sec: string, ex: string): TypedFinding => ({ id: "f_" + sec, citation: "§" + sec, excerpt: ex, kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding);
// Run the real engine: build a section with a benign grounded finding + the candidate sentence, return the §sec status.
function status(sec: string, benign: string, candidate: string): string | undefined {
  const src = [`SECTION ${sec} - TEST`, benign, candidate].join("\n");
  const r = completenessOf({ fullSource: src } as any, [sec], [f(sec, benign)], new Set([sec]));
  return r.attestations.find((a) => a.section === sec)?.status;
}
// A benign grounded finding to co-reside (never overlaps candidate).
const BEN = "Deliveries shall be made to the destination named in the schedule.";

// Helper harness: assert a candidate is IN SCOPE, then check the pole. floored = obligations_ungrounded.
function underFire(label: string, sec: string, bar: string) {
  if (!inScope(bar)) { notes.push(`SKIP(out-of-scope) UF ${label}`); return; }
  ok(`UF ${label} — real bar MUST floor`, status(sec, BEN, bar), "obligations_ungrounded");
}
function overFire(label: string, sec: string, benignSent: string) {
  if (!inScope(benignSent)) { notes.push(`SKIP(out-of-scope) OF ${label}`); return; }
  ok(`OF ${label} — clean sentence MUST stay covered_direct`, status(sec, BEN, benignSent), "covered_direct");
}

function main() {
  // ===== R3 BREAK 1 (P0 under-fire) verified CLOSED =====
  underFire("R3#1 bare 8(a) program restriction thing-lead", "C",
    "Provisions of this notice restrict award to 8(a) program participants only.");
  underFire("R3#1b award restricted to 8(a) firms (holding designation)", "C",
    "Award under this notice is restricted to firms holding an 8(a) designation issued by SBA.");

  // ===== R3 BREAK 2 (P1 over-fire) verified CLOSED =====
  overFire("R3#2 §E goods-accept + contractor remedy tail", "E",
    "Nonconforming units are ineligible for acceptance and will be returned at the contractor's expense.");
  overFire("R3#2b §E supplies not eligible for acceptance", "E",
    "Supplies not conforming to the specification are not eligible for acceptance and may be rejected.");

  // ===== ATTACK A — 30-char adjacency window UNDER-FIRE (real offeror bar, elig token >30 chars away) =====
  underFire("A1 offeror ...41ch... eligible (certified small biz)", "H",
    "The offeror, following submission of all required volumes, shall be eligible for award only if it is a certified small business.");
  underFire("A2 bidder ...must...eligible remote", "H",
    "Bidders that fail to maintain an active facility clearance throughout performance are ineligible.");

  // ===== ATTACK B — 30-char adjacency window OVER-FIRE (benign thing w/ offeror noun coincidentally <30ch to elig word) =====
  overFire("B1 firm's samples registered in tracking log", "F",
    "The firm's samples shall be registered in the tracking log upon delivery.");
  overFire("B2 contractor's invoices, ineligible-for-payment goods", "F",
    "The contractor shall ensure nonconforming lots are ineligible for payment under this order.");

  // ===== ATTACK C — 8(a)-program branch OVER-FIRE (benign 8(a) collocation w/ program word nearby) =====
  overFire("C1 govt program in block 8(a)", "D",
    "The program described in block 8(a) shall be delivered per schedule.");
  overFire("C2 program identifier in field 8(a)", "D",
    "Enter the applicable program identifier in field 8(a) of the DD-250.");

  // ===== ATTACK D — 8(a) restriction phrased to DODGE the program-word window (UNDER-FIRE) =====
  underFire("D1 8(a) dodge — program word far from token", "C",
    "Award is restricted to concerns admitted to the Small Business Administration business development participation known as 8(a).");

  // ===== ATTACK E — THING_LEAD false-skip on a REAL bar leading with a thing that ELIGIBILITY_BAR_RE matches =====
  underFire("E1 thing-lead real firm bar (documents...personnel clearance)", "H",
    "Documents shall be handled only by personnel holding a Top Secret clearance.");
  underFire("E2 thing-lead 'services' but real set-aside restriction", "C",
    "Services under this requirement are set aside for HUBZone small business concerns.");

  // ===== ATTACK F — multi-bar section (one benign thing + one real bar; real bar must survive) =====
  {
    const sec = "H";
    const src = [`SECTION ${sec} - SPECIAL`,
      "Deliveries shall be made to the destination named in the schedule.",  // grounded benign
      "The program described in block 8(a) shall be delivered per schedule.", // benign thing (should skip)
      "The contractor shall possess a Top Secret facility clearance at time of award."].join("\n"); // REAL bar
    const r = completenessOf({ fullSource: src } as any, [sec], [f(sec, "Deliveries shall be made to the destination named in the schedule.")], new Set([sec]));
    const h = r.attestations.find((a) => a.section === sec);
    ok("F multi-bar — real clearance bar floors the section", h?.status, "obligations_ungrounded");
    ok("F multi-bar — the REAL bar sentence surfaces", h?.ungrounded?.some((u) => /top secret facility clearance/i.test(u)), true);
  }

  // ===== ATTACK G — §B/§D/§F realism: benign clauses must NOT floor =====
  overFire("G1 §B CLIN pricing benign", "B",
    "The size standard for this acquisition is set forth in the schedule and priced by CLIN.");
  overFire("G2 §D marking benign", "D",
    "All packages shall be marked in accordance with MIL-STD-129R.");
  overFire("G3 §F delivery benign", "F",
    "Deliverables shall be registered in the government property system upon receipt.");

  console.log(`\n${fails.length === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fails.length} failed`);
  fails.forEach((x) => console.log(x));
  if (notes.length) { console.log("\n-- out-of-scope (not counted) --"); notes.forEach((n) => console.log(n)); }
}
main();
