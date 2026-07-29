// $0 regression lock — PRIMARY-DOCUMENT ELECTION (root-b U1, flag AUDIT_PRIMARY_DOC_ELECTION, default-OFF).
// Driver: panel gate-4 on 150c3ab3 + the 2026-07-29 pre-fire shape check — SAM assembly puts AMENDMENTS before
// the base solicitation, so the section detector's "primary" ([marker0, marker1)) is routinely a 1KB stub and
// the production section map comes back EMPTY on the real package (verified on 150c3ab3, SPRRA2-26-R-0034,
// 36C24126Q0569 — 3 of 3). Election: the primary is a ROLE decided by evidence (form header · section-anchor
// density · size), never a position. Flag-OFF ⇒ positional primary, byte-identical. Run:
//   npx tsx src/lib/primary-doc-election.test.ts
export {};
import { readFileSync, existsSync } from "fs";

let pass = 0, fail = 0;
function ok(label: string, cond: boolean) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } }

const D = (name: string, body: string) => `\n\n==== DOCUMENT: ${name} ====\n\n${body}`;
// A realistic solicitation body: SF-1449 form header + commercial clause headings (the 150c3ab3/VA shape).
const REAL_SOL = [
  "SOLICITATION/CONTRACT/ORDER FOR COMMERCIAL PRODUCTS AND COMMERCIAL SERVICES",
  "SECTION B — CONTINUATION OF SF 1449 BLOCKS",
  "B.1 CONTRACT ADMINISTRATION DATA",
  "The contractor shall provide all labor and materials.",
  "E.1 52.212-1 INSTRUCTIONS TO OFFERORS—COMMERCIAL PRODUCTS AND SERVICES",
  "Offers must be submitted electronically.",
  "E.6 52.212-2 EVALUATION—COMMERCIAL PRODUCTS AND COMMERCIAL SERVICES",
  "The Government will award to the lowest priced technically acceptable quote.",
].join("\n");
const STUB_AMENDMENT = "AMENDMENT 0001. The response deadline is extended to 07/30/2026. All other terms unchanged.";
const WAGE_DET = "REGISTER OF WAGE DETERMINATIONS UNDER THE SERVICE CONTRACT ACT. WD 2015-5109 Rev 30. Window Cleaner $17.05.";

const withFlag = <T>(on: boolean, fn: () => T): T => {
  const prev = process.env.AUDIT_PRIMARY_DOC_ELECTION;
  if (on) process.env.AUDIT_PRIMARY_DOC_ELECTION = "true"; else delete process.env.AUDIT_PRIMARY_DOC_ELECTION;
  try { return fn(); } finally { if (prev === undefined) delete process.env.AUDIT_PRIMARY_DOC_ELECTION; else process.env.AUDIT_PRIMARY_DOC_ELECTION = prev; }
};

(async () => {
  const tools = await import("./audit-tools");
  const secs = (full: string) => (tools as any).materializeSections({ fullSource: full }) as Record<string, string>;

  // The 150c3ab3-shaped package: stub amendment first, WD second, REAL solicitation last.
  const STUB_FIRST = D("Q0001_amendment.docx", STUB_AMENDMENT) + D("wd.pdf", WAGE_DET) + D("Q0001.pdf", REAL_SOL);
  // The healthy package: real solicitation IS doc#1.
  const REAL_FIRST = D("Q0001.pdf", REAL_SOL) + D("wd.pdf", WAGE_DET) + D("Q0001_amendment.docx", STUB_AMENDMENT);

  // ── P1 (falsifiability control — pins TODAY's defect): flag-OFF, stub-first ⇒ section map EMPTY.
  withFlag(false, () => {
    const m = secs(STUB_FIRST);
    ok("P1 OFF/stub-first: section map EMPTY (the live defect, pinned)", Object.keys(m).length === 0);
  });

  // ── P2 (the fix): flag-ON, stub-first ⇒ election finds the real solicitation ⇒ sections appear, incl. §L/§M.
  withFlag(true, () => {
    const m = secs(STUB_FIRST);
    ok("P2 ON/stub-first: section map NON-EMPTY (election found the real solicitation)", Object.keys(m).length > 0);
    ok("P2 ON/stub-first: §L detected (E.1 52.212-1 heading)", "L" in m);
    ok("P2 ON/stub-first: §M detected (E.6 52.212-2 heading)", "M" in m);
    ok("P2 ON/stub-first: §L text comes from the real doc, not the stub", (m.L ?? "").includes("submitted electronically"));
  });

  // ── P3: single-doc package (no delimiters) ⇒ flag-ON is byte-identical to flag-OFF (no election path).
  {
    const off = withFlag(false, () => secs(REAL_SOL));
    const on = withFlag(true, () => secs(REAL_SOL));
    ok("P3 single-doc: ON == OFF (byte-identical, no delimiters)", JSON.stringify(on) === JSON.stringify(off));
  }

  // ── P4: doc#1 IS the real solicitation ⇒ election keeps region 0 ⇒ ON == OFF.
  {
    const off = withFlag(false, () => secs(REAL_FIRST));
    const on = withFlag(true, () => secs(REAL_FIRST));
    ok("P4 real-first: election keeps doc#1 ⇒ ON == OFF", JSON.stringify(on) === JSON.stringify(off));
    ok("P4 real-first control: OFF already finds §L (proves P1's emptiness is the ORDER, not the content)",
       "L" in withFlag(false, () => secs(REAL_FIRST)));
  }

  // ── P5: ambiguity fails toward current behavior — three prose docs, no form/anchor/size signal dominance
  //        beyond size; smallest-first order. Election must NOT move primary on size alone... size +1 CAN elect
  //        when nothing else distinguishes — assert only that the result is deterministic and non-crashing, and
  //        that a package of ALL-zero-score regions keeps region 0.
  withFlag(true, () => {
    const same = D("a.txt", "alpha prose.") + D("b.txt", "beta prose.") + D("c.txt", "gamma prose.");
    const m = secs(same);
    ok("P5 all-stub package: no crash, no phantom sections", Object.keys(m).length === 0);
  });

  // ── P6 (adversarial, red-team Q1 shape): attachment QUOTING one section heading must not steal primary from
  //        a form-headed real solicitation.
  withFlag(true, () => {
    const quoting = D("Q0001.pdf", REAL_SOL) + D("cover-letter.docx", "Per SECTION B of the solicitation, see our attached quote. " + "x".repeat(60000));
    const m = secs(quoting);
    ok("P6 big quoting attachment does NOT steal primary (§L still from real doc)", (m.L ?? "").includes("submitted electronically"));
  });

  // ── P7: REAL-DATA replay — the persisted 150c3ab3 raw text (stub docx · WD · real 41-page pdf).
  const SNAP = "/private/tmp/claude-501/-Users-josearodriguezjr--faraudit-app/88bd4e7f-ed12-4806-986b-405d4f2da173/scratchpad/audit-150c3ab3.json";
  if (existsSync(SNAP)) {
    const src = JSON.parse(readFileSync(SNAP, "utf8")).raw_pdf_text as string;
    const off = withFlag(false, () => secs(src));
    const on = withFlag(true, () => secs(src));
    ok("P7 150c3ab3 OFF: EMPTY map (pins the live defect on the real record)", Object.keys(off).length === 0);
    ok("P7 150c3ab3 ON: NON-EMPTY map (election reaches the real solicitation)", Object.keys(on).length > 0);
    ok("P7 150c3ab3 ON: §L found (E.1/E.2 headings live in doc#3)", "L" in on);
  } else {
    console.log("  (P7 skipped — 150c3ab3 snapshot not present)");
  }


  // ── P8-P10 — ANCHOR EXTENSIONS (panel: "extend resolvePrimary if its anchors are thin"; measured 2026-07-29:
  //    confident=false on BOTH live CERT-5 packages). Probes written RED-first against the un-extended election.
  const { resolvePrimary } = await import("./primary-doc-resolve");

  // P8 — LETTER RFP identity (the SPRRA2-26-R-0034 shape: DLA letter, no form header at all).
  {
    const pick = resolvePrimary([
      { name: "RFP_SPRRA226R0034_AMD 0003.pdf", text: "AMENDMENT 3 updated parts list." },
      { name: "parts-list.xlsx", text: "PN QTY UNIT PRICE" },
      { name: "RFP SPRRA2-26-R-0034.pdf", text: "DEFENSE LOGISTICS AGENCY\nRE: Letter Request for Proposal (RFP) SPRRA2-26-R-0034\nRaytheon,\nThe Defense Logistics Agency wishes to price the part numbers." },
    ]);
    ok("P8 Letter RFP elected CONFIDENTLY (identity anchor)", pick.index === 2 && pick.confident === true);
  }

  // P9 — COMBINED SYNOPSIS identity (the 36C24126Q0569 shape: FAR 12.603 definitional boilerplate, no form).
  {
    const pick = resolvePrimary([
      { name: "Q0569 0001.docx", text: "SOLICITATION NUMBER\n36C24126Q0569\nDESCRIPTION\nThe purpose of this amendment is to extend the close date from 06/16/2026 to 06/23/2026." },
      { name: "Q0569.docx", text: "SOLICITATION NUMBER\n36C24126Q0569\nDESCRIPTION\nThis is a combined synopsis/solicitation for commercial items prepared in accordance with the format in Subpart 12.6, as supplemented." },
    ]);
    ok("P9 combined synopsis elected CONFIDENTLY over the amendment notice", pick.index === 1 && pick.confident === true);
  }

  // P10 — AMENDMENT-PURPOSE body boilerplate DISQUALIFIES (VA names amendments "SOL# 000N" — no am/amd token,
  //       no SF-30 title; the body sentence is the identity).
  {
    const pick = resolvePrimary([
      { name: "36C24126Q0569 0005.docx", text: "DESCRIPTION\nThe purpose of this amendment is to answer vendor questions." },
      { name: "prose.txt", text: "unrelated prose with no identity signals at all" },
    ]);
    ok("P10 amendment-purpose body is disqualified from primary (falls to the non-amendment doc)", pick.index === 1);
  }

  console.log(`\n──────────────  ${pass} pass · ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
})();
