/**
 * RED-TEAM Unit #12 R1 — discriminator over-fire probe.
 * Exercises looksGarbled() directly on the DANGEROUS clean text classes (CLIN/wage/
 * clause tables, acronym-dense prose, short admin sections) plus genuine mojibake.
 * looksGarbled(text)===true ⇒ the garble floor would REJECT the read_no_obligation
 * relief valve on a section with zero obligation sentences ⇒ obligations_ungrounded
 * ⇒ INCOMPLETE. For a CLEAN section that is genuinely "no obligation", true = OVER-FIRE.
 *
 * We test BOTH AUDIT_TXT_INGEST states because looksGarbled's denominator depends on it
 * (the gate inherits whichever is live).
 */
import { looksGarbled } from "../../src/lib/pdf-ocr";

type Case = { name: string; klass: string; text: string; wantGarbled: boolean; note: string };

const nonWs = (s: string) => s.replace(/\s+/g, "").length;

// ── CLASS 1: CLIN / price-schedule grid (clean, no obligation verbs, low common-word density) ──
const CLIN_GRID = `
CLIN    SUPPLIES/SERVICES                         QTY   UNIT   UNIT PRICE   AMOUNT
0001AA  Base Year Labor - Program Manager          1    LOT    $  0.00     $  0.00
0001AB  Base Year Labor - Sr Analyst              12    MO     $  0.00     $  0.00
0001AC  Base Year Labor - Analyst II              12    MO     $  0.00     $  0.00
0002AA  ODC - Travel                               1    LOT    $  0.00     $  0.00
1001AA  Option Year 1 - Program Manager            1    LOT    $  0.00     $  0.00
1001AB  Option Year 1 - Sr Analyst                12    MO     $  0.00     $  0.00
2001AA  Option Year 2 - Program Manager            1    LOT    $  0.00     $  0.00
3001AA  Option Year 3 - Program Manager            1    LOT    $  0.00     $  0.00
4001AA  Option Year 4 - Program Manager            1    LOT    $  0.00     $  0.00
NSN 7540-01-152-8064   PSC R408   NAICS 541611   FPDS G002
`.trim();

// ── CLASS 1b: SCA wage determination table (clean, no verbs) ──
const WAGE_TABLE = `
WD 05-2103 (Rev.-24)   Area: TX San Antonio, Bexar County
OCCUPATION CODE   TITLE                                RATE      H&W    VACATION
01011             Accounting Clerk I                   18.55     5.36   2 wks
01012             Accounting Clerk II                  20.81     5.36   2 wks
01020             Administrative Assistant             27.44     5.36   2 wks
01111             General Clerk I                      15.90     5.36   2 wks
01311             Secretary I                          22.10     5.36   2 wks
23370             General Maintenance Worker           19.63     5.36   2 wks
25010             Fuel Distribution System Operator    24.88     5.36   2 wks
31361             Truck Driver Heavy                    23.55     5.36   2 wks
Fringe: HEALTH & WELFARE $5.36/hr   HOLIDAYS 11   UNIFORM ALLOWANCE PER 52.222-51
`.trim();

// ── CLASS 1c: FAR clause-number list (incorporated by reference, no verbs) ──
const CLAUSE_LIST = `
52.204-7    52.204-13   52.204-16   52.204-18   52.209-6    52.212-4
52.212-5    52.219-6    52.219-8    52.219-9    52.219-28   52.222-3
52.222-21   52.222-26   52.222-36   52.222-41   52.222-50   52.222-55
52.223-18   52.225-13   52.232-33   52.232-39   52.233-3    52.233-4
252.203-7000  252.204-7012  252.204-7015  252.225-7048  252.232-7003
252.239-7001  252.243-7001  252.244-7000  DFARS 252.204-7012 CUI
`.trim();

// ── CLASS 2: acronym-dense DoD prose (clean, real words but LOW common-word density) ──
const ACRONYM_PROSE = `
COR/KO PWS IDIQ POP CDRL DFARS SPRS CMMC NIST 800-171 CUI FOUO OPSEC INFOSEC.
CLIN CDRL A001 DD1423 SOW WBS OLA SLA KPI QASP QCP GFE GFP GFI ODC G&A.
DCAA DCMA ACO PCO TCO DACO CBA WD SCA DBA FLSA EEO OFCCP VEVRAA VETS4212.
POC NLT COB CONUS OCONUS TDY PCS BAH OHA FSA SDP AOR TOC EOC NOC SOC.
FAR DFARS AFFARS DAFFARS GSAM VAAR HHSAR NASA FAR JTR JFTR MILSTRIP.
NAICS 541519 PSC D307 FSC 7030 SIC UEI CAGE DUNS TIN EIN SAM WAWF iRAPT.
`.trim();

// ── CLASS 3: short-and-empty admin section near boundary ──
const ADMIN_BLANK = `
SECTION A - SOLICITATION/CONTRACT FORM
This page intentionally left blank.
Standard Form 1449 continuation. Block 19 through Block 25 reserved.
Award will be made under separate cover per Block 28. See Section B.
`.trim();

// A ~310-char clean thin admin section just OVER the 300-char judge threshold.
const THIN_310 = ("SECTION G - CONTRACT ADMINISTRATION DATA. " +
  "Invoices submitted via WAWF iRAPT. Payment office DoDAAC HQ0131. " +
  "Administered by DCMA. COR designated post-award by letter. " +
  "Accounting classification per the schedule. See clause 52.232-33 EFT. " +
  "Point of contact listed in Block 9 of the SF1449 cover page here.").trim();

// ── CLASS 4 (under-fire control): genuine OCR mojibake with corrupted obligation verbs ──
const MOJIBAKE = `
Th3 c0ntr@ct0r sh@ll pr0v!de @ll l@b0r m@ter!@ls @nd equ!pment ne­ces­s@ry.
Æ¢Ø¡™£¢∞§¶•ªº–≠ œ∑´®†¥¨ˆøπ åß∂ƒ©˙∆˚¬ Ω≈ç√∫˜µ≤≥÷ ¡™£¢∞§¶•ªºΩ≈ç√∫.
€‚ƒ„…†‡ˆ‰Š‹ŒŽ''""•–—˜™š›œžŸ ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿.
þýüûúùø÷öõôóòñðïîíìëêéèçæåäãâáàßÞÝÜÛÚÙØ×ÖÕÔÓÒÑÐÏÎÍÌËÊÉÈÇÆÅÄÃÂÁÀ.
`.trim();

const CASES: Case[] = [
  { name: "CLIN 0001AA price grid", klass: "1-CLIN", text: CLIN_GRID, wantGarbled: false, note: "clean CLIN grid, no verbs → valve" },
  { name: "SCA wage determination table", klass: "1b-WD", text: WAGE_TABLE, wantGarbled: false, note: "clean wage table, no verbs → valve" },
  { name: "FAR clause-number list", klass: "1c-clause", text: CLAUSE_LIST, wantGarbled: false, note: "clean clause list, no verbs → valve" },
  { name: "Acronym-dense DoD prose", klass: "2-acronym", text: ACRONYM_PROSE, wantGarbled: false, note: "clean acronyms → valve" },
  { name: "Short admin blank §A", klass: "3-admin", text: ADMIN_BLANK, wantGarbled: false, note: "short/empty admin → valve" },
  { name: "Thin §G ~310 chars over-boundary", klass: "3-boundary", text: THIN_310, wantGarbled: false, note: "just over 300 non-ws → valve" },
  { name: "Genuine OCR mojibake", klass: "4-mojibake", text: MOJIBAKE, wantGarbled: true, note: "must floor (under-fire control)" },
];

function run(txtIngest: boolean) {
  process.env.AUDIT_TXT_INGEST = txtIngest ? "true" : "false";
  console.log(`\n===== AUDIT_TXT_INGEST=${txtIngest ? "true (non-ws denom)" : "false (legacy incl-ws denom)"} =====`);
  console.log("class        len(nonWs)  garbled  want   VERDICT   note");
  let overfire = 0, underfire = 0;
  for (const c of CASES) {
    const g = looksGarbled(c.text);
    const nw = nonWs(c.text);
    let v = "ok";
    if (g && !c.wantGarbled) { v = "*** OVER-FIRE ***"; overfire++; }
    if (!g && c.wantGarbled) { v = "!!! UNDER-FIRE !!!"; underfire++; }
    console.log(
      `${c.klass.padEnd(12)} ${String(nw).padStart(6)}     ${String(g).padEnd(6)}  ${String(c.wantGarbled).padEnd(5)}  ${v.padEnd(18)} ${c.note}`
    );
  }
  console.log(`--- over-fire=${overfire}  under-fire=${underfire} ---`);
  return { overfire, underfire };
}

const off = run(false);
const on = run(true);
console.log(`\nSUMMARY  TXT_INGEST=off overfire=${off.overfire}/underfire=${off.underfire} | on overfire=${on.overfire}/underfire=${on.underfire}`);
