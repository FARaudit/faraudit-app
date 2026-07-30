/**
 * RED-TEAM Unit #12 R1 — boundary + realistic-admin probe.
 * The judge threshold is len(nonWs) < 300 ⇒ return false. So a clean admin section
 * must be >=300 non-ws chars to actually REACH the discriminator. Test clean admin
 * sections that clear 300 non-ws chars — these SHOULD get the relief valve (garbled=false).
 * Also probes the per1k math directly to root-cause exactly where the density lands.
 */
import { looksGarbled } from "../../src/lib/pdf-ocr";

const COMMON_WORDS_RE =
  /\b(?:the|and|of|to|for|in|on|by|with|shall|contract|agreement|services|or|is|are|be|this|that|all|as|will|not|any|per|from|under|section)\b/gi;

function analyze(name: string, text: string, want: boolean) {
  const sample = text.slice(0, 20000);
  const nonWs = sample.replace(/\s+/g, "").length;
  const withWs = sample.length;
  const hits = (sample.match(COMMON_WORDS_RE) || []).length;
  const per1kNonWs = hits / (nonWs / 1000);
  const per1kWithWs = hits / (withWs / 1000);
  for (const ingest of [false, true]) {
    process.env.AUDIT_TXT_INGEST = ingest ? "true" : "false";
    const g = looksGarbled(text);
    const bad = g !== want;
    console.log(
      `${name.padEnd(34)} ingest=${ingest ? "on " : "off"} nonWs=${String(nonWs).padStart(4)} hits=${String(hits).padStart(3)} ` +
      `per1k(nonWs)=${per1kNonWs.toFixed(1).padStart(5)} per1k(ws)=${per1kWithWs.toFixed(1).padStart(5)} garbled=${String(g).padEnd(5)} ${bad ? "*** OVER-FIRE ***" : ""}`
    );
  }
}

// Realistic large SCA WD (well over 300 non-ws) — clean, would attest read_no_obligation.
const WAGE_BIG = `
REGISTER OF WAGE DETERMINATIONS UNDER THE SERVICE CONTRACT ACT
Wage Determination No.: 2015-4281  Revision No.: 23  Date: 12/26/2024
State: Texas  Area: Bexar County
OCCUPATION CODE  OCCUPATION TITLE                       RATE
01011  Accounting Clerk I                                18.55
01012  Accounting Clerk II                               20.81
01013  Accounting Clerk III                              23.24
01020  Administrative Assistant                          27.44
01040  Court Reporter                                    23.09
01051  Data Entry Operator I                             16.90
01052  Data Entry Operator II                            18.44
01111  General Clerk I                                    15.90
01112  General Clerk II                                   17.35
01113  General Clerk III                                  19.49
01120  Housing Referral Assistant                        26.55
01141  Messenger Courier                                 15.13
01191  Order Clerk I                                      17.90
01192  Order Clerk II                                     19.53
01261  Personnel Assistant I                             19.28
01311  Secretary I                                       22.10
01312  Secretary II                                      24.71
01313  Secretary III                                     27.58
01611  Word Processor I                                  18.44
05005  Automotive Body Repairer                          25.30
05010  Automotive Electrician                            24.55
`.trim();

// Realistic CLIN schedule, larger.
const CLIN_BIG = `
SECTION B - SUPPLIES OR SERVICES AND PRICES/COSTS
ITEM   DESCRIPTION                            QTY  UNIT   UNIT PRICE   EXT
0001   Base Program Management Services         12  MO     _________   _________
0002   Base Cybersecurity Analysts (4 FTE)      12  MO     _________   _________
0003   Base ODC / Travel (NTE)                   1  LOT    _________   _________
1001   OY1 Program Management Services          12  MO     _________   _________
1002   OY1 Cybersecurity Analysts (4 FTE)       12  MO     _________   _________
1003   OY1 ODC / Travel (NTE)                    1  LOT    _________   _________
2001   OY2 Program Management Services          12  MO     _________   _________
2002   OY2 Cybersecurity Analysts (4 FTE)       12  MO     _________   _________
3001   OY3 Program Management Services          12  MO     _________   _________
3002   OY3 Cybersecurity Analysts (4 FTE)       12  MO     _________   _________
4001   OY4 Program Management Services          12  MO     _________   _________
4002   OY4 Cybersecurity Analysts (4 FTE)       12  MO     _________   _________
NAICS 541519  PSC D310  Inspection: Destination  Acceptance: Destination
`.trim();

// Clean admin section that CLEARS 300 non-ws — should NOT floor.
const ADMIN_BIG = `
SECTION A - SOLICITATION/CONTRACT/ORDER FOR COMMERCIAL PRODUCTS AND COMMERCIAL SERVICES
This solicitation is issued as a Request for Quotation. Standard Form 1449 applies.
Offers are due no later than the date and time stated in Block 8. Questions must be
submitted in writing. This page and the continuation blocks below are administrative
cover data; the substantive terms appear in Sections B through M of the schedule.
Block 10a set-aside status, Block 11 delivery, Block 12 discount terms, Block 13
codes, Block 14 method of solicitation, Block 15 deliver-to, Block 16 administered-by,
Block 17a contractor, Block 18a payment, Block 19 through Block 28 as marked herein.
`.trim();

analyze("WAGE big table", WAGE_BIG, false);
analyze("CLIN big schedule", CLIN_BIG, false);
analyze("ADMIN big clean cover", ADMIN_BIG, false);
