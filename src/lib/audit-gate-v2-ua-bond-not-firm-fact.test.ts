// U-A.2 gate — a bond token is not a long-lead credential (flag AUDIT_UA_BOND_NOT_FIRM_FACT, default-OFF).
// Run: npx tsx src/lib/audit-gate-v2-ua-bond-not-firm-fact.test.ts
//
// The three properties that make the change safe, each with a NEGATIVE control so the suite can go red:
//   1. FLAG-OFF BYTE-IDENTITY — every case classifies exactly as it does today.
//   2. RELEASE — the shapes that are not firm facts (paper stock, a furnish-with-bid guarantee) stop muting.
//   3. HOLD — the shapes that ARE firm facts keep their mute: bonding CAPACITY, and a bond riding alongside a
//      genuine scarce credential (the fail-closed construction — strip, then re-ask).
import { gateV2Outcome, type CoverageV2 } from "./audit-gate-v2";

let failures = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok ? "" : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
};

/** Build a coverage object whose ONLY firing content is `obligations`, so `kind` is attributable to them alone. */
const cov = (obligations: string[]): CoverageV2 => ({
  unreadable: [],
  ungroundedRead: [],
  disqualifierUncovered: obligations.map((obligation) => ({ obligation, section: "L" })) as CoverageV2["disqualifierUncovered"],
  ungroundedNonBarSignal: [],
  coverageGrade: 0.5,
} as CoverageV2);

const kindOf = (obligations: string[], flag: boolean): string | undefined => {
  const prev = process.env.AUDIT_UA_BOND_NOT_FIRM_FACT;
  process.env.AUDIT_UA_BOND_NOT_FIRM_FACT = flag ? "true" : "false";
  try { return gateV2Outcome(cov(obligations)).kind; }
  finally { if (prev === undefined) delete process.env.AUDIT_UA_BOND_NOT_FIRM_FACT; else process.env.AUDIT_UA_BOND_NOT_FIRM_FACT = prev; }
};

// The measured live strings, verbatim from the banked run-records named in each comment.
const BID_BOND   = "bid bond guarantee shall render your bid non-responsive.";                          // _ua-3b5bba30
const BID_GUAR   = "Bid Guarantee (Bond): A bid guarantee (minimum of 20% of proposal) is required IAW FAR 28."; // FA813726R0033
const BOND_PAPER = "Information required by the Regulations must be submitted on SF-1444 or bond paper."; // _fire-45f9bacd
const CAPACITY   = "The offeror shall demonstrate bonding capacity of $5,000,000.";
const CLEARANCE  = "The contractor must possess a Top Secret facility clearance at time of award.";
const MECHANIC   = "Offerors shall hold prices firm for 90 days after the date of bid opening.";

console.log("1. FLAG-OFF byte-identity — today's classification, unchanged");
check("bid bond mutes (off)",        kindOf([BID_BOND], false),   "firm_fact_bar");
check("bid guarantee mutes (off)",   kindOf([BID_GUAR], false),   "firm_fact_bar");
check("bond PAPER mutes (off)",      kindOf([BOND_PAPER], false), "firm_fact_bar");   // the defect, asserted as-is
check("capacity mutes (off)",        kindOf([CAPACITY], false),   "firm_fact_bar");
check("clearance mutes (off)",       kindOf([CLEARANCE], false),  "firm_fact_bar");
check("plain mechanic releases (off)", kindOf([MECHANIC], false), "uncovered_obligation");

console.log("\n2. FLAG-ON release — shapes that are not firm facts stop muting");
check("bond PAPER releases",         kindOf([BOND_PAPER], true),  "uncovered_obligation");
check("bid bond releases",           kindOf([BID_BOND], true),    "uncovered_obligation");
check("bid guarantee releases",      kindOf([BID_GUAR], true),    "uncovered_obligation");
// The measured bucket-wide defect: nine releasable items behind one bond item.
check("bucket of 9 + bond releases", kindOf([MECHANIC, MECHANIC, BID_BOND], true), "uncovered_obligation");

console.log("\n3. FLAG-ON hold — genuine firm facts keep the mute (fail-closed)");
check("bonding CAPACITY holds",      kindOf([CAPACITY], true),    "firm_fact_bar");
check("clearance holds",             kindOf([CLEARANCE], true),   "firm_fact_bar");
// Fail-closed construction: strip the bond token, then re-ask — the clearance still answers.
check("bond ALONGSIDE clearance holds", kindOf([BID_BOND, CLEARANCE], true), "firm_fact_bar");
check("capacity behind a bond holds",   kindOf([BID_BOND, CAPACITY], true),  "firm_fact_bar");

console.log("\n4. The plural split the token had (both directions now agree)");
check("plural bonds, off",           kindOf(["Performance bonds shall be furnished within 10 days."], false), "uncovered_obligation");
check("plural bonds, on",            kindOf(["Performance bonds shall be furnished within 10 days."], true),  "uncovered_obligation");
check("singular bond, on",           kindOf(["A performance bond shall be furnished within 10 days."], true),  "uncovered_obligation");

console.log(failures === 0 ? "\nPASS" : `\nFAIL — ${failures} assertion(s)`);
process.exit(failures === 0 ? 0 : 1);
