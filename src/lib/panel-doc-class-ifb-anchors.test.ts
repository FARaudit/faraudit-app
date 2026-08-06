// GATE — sealed-bid (IFB) §L anchors, flag AUDIT_IFB_SECTION_ANCHORS.
//
// WHAT THIS PROTECTS. Run e5f177aa (W911SG27BA002) handed three of five lenses the entire 2.8M-char
// package and logged "cost-slope INFLATED". The root was not the predicate and not §M: the §L anchor
// reaches its content only through "instructions to OFFERORS / QUOTERS", which is negotiated-procurement
// vocabulary. That package is a sealed bid under FAR Part 14, so its instructions are headed
// "INSTRUCTIONS, CONDITIONS, AND NOTICES TO BIDDERS" and the word offeror never appears in them. §L never
// placed, the legacy §L-AND-§M predicate went false, and routing was abandoned for EVERY section.
//
// Every fixture below is TRANSCRIBED VERBATIM from that package's assembled fullSource — including the §M
// region, which on this IFB is a concrete alkali-silica-reaction test paragraph rather than evaluation
// factors. That is not a contrived fixture; it is what the anchors actually see, and a gate written against
// invented text would certify this author's imagination instead of the document.
//
// WHY THE NEGATIVE LEGS CARRY THE WEIGHT. A new anchor can only ADD placements, so a positive-only gate goes
// green the moment the regex compiles. The legs that can actually fail are: flag-OFF must be a byte-identical
// no-op, the mid-content mentions of the same words must NOT place §L (they recur on this very package and
// would fragment §C), and the negotiated twin "...NOTICES TO OFFERORS" must keep routing through the anchor
// it already had.
//
// PLANTED-POSITIVE PROOF — six plants run 2026-08-05, each restored, every one exit 1 with the named leg red:
//   A  shape (b) loosened to bare /instructions to bidders/  → leg 3 (2 of 4 mid-content mentions place §L)
//   B  IFB_ANCHORS_ON() forced false                          → legs 1, 2 (both), 4b, 5 — the flag is inert
//   C  /offerors shall submit/ added to IFB_L_ANCHOR          → leg 4 (negotiated packages route differently)
//   D1 UFGS number loosened 13 → 1\d                          → leg 5 (the adjacent 00 21 14 title places §L)
//   D2 line-start guard dropped from shape (c)                → leg 5 (a mid-sentence 00 21 13 places §L)
//   F  shape (a) narrowed back to bidders alone               → leg 4b (the SF-1442 negotiated twin re-breaks)
// D1 is why leg 5 carries TWO negatives. An earlier draft put its neighbour fixture mid-sentence, so the
// line-start guard rejected it and the leg stayed GREEN under D1 — it was asserting a number specificity it
// never tested. Every leg here has been shown to fail for its own stated reason, not merely to exist.
//
// END-TO-END, on the real 2,805,331-char assembled source (not a fixture): flag OFF reproduces today exactly
// (placed [C,M,I,B], routed=false, head 13,539 dropped); flag ON places §L at offset 71 with routed=true, and
// the pre-first-anchor head collapses from 13,539 chars to 71 — the region carrying the bid opening, the
// award basis and the 8(a) set-aside moves INSIDE §L instead of being dropped.
//
//   npx tsx src/lib/panel-doc-class-ifb-anchors.test.ts

import { routeCommercialSections, commercialAnchorsFor } from "./panel-doc-class";

const FLAG = "AUDIT_IFB_SECTION_ANCHORS";
let failures = 0;
const fail = (leg: string, msg: string) => { failures++; console.error(`  ✗ ${leg} — ${msg}`); };
const pass = (leg: string, msg: string) => console.log(`  ✓ ${leg} — ${msg}`);

/** Run `fn` with the flag forced to a state, then restore whatever was there. */
function withFlag<T>(on: boolean, fn: () => T): T {
  const prev = process.env[FLAG];
  if (on) process.env[FLAG] = "true"; else delete process.env[FLAG];
  try { return fn(); } finally { if (prev === undefined) delete process.env[FLAG]; else process.env[FLAG] = prev; }
}

// ── FIXTURES — verbatim from W911SG27BA002's assembled fullSource ─────────────────────────────────────────
// The instructions block (source offset ~73). Its heading is the SF-1442 sealed-bid title.
const IFB_HEAD = `INSTRUCTIONS, CONDITIONS, AND NOTICES TO BIDDERS
1. \tDescription of the Project:
The Department of Public Works at Fort Bliss, TX has a new requirement that
consists of providing contract services for paving and related construction services at
various locations on Fort Bliss and White Sands Missile Range
2. \tInstructions to Bidders:
2.1. \tYou are invited to submit a bid in response to our Invitation for Bids (IFB) W911SG-
27-B-A002 New Paving IDIQ Contract, at 9AM MDT on 10 September 2026 at Ft.
Bliss, TX, Bldg. 111 Rm 220.
2.2. \tAs a result of this solicitation, the Government intends to award a Firm Fixed Price
(FFP) contract resulting from this solicitation to the responsible bidder whose bid, conforming
to the invitation for bids, will be most advantageous to the Government, considering only price.
2.3. \tThis solicitation is set-aside 100% for 8(a) businesses.`;

// The §C anchor region (source offset ~13,540) and the §M anchor region (~1,018,122).
const C_REGION = `all labor, materials, equipment, supplies, and transportation necessary to complete the scope of work. Except as provided elsewhere in the contract, all work shall comply with applicable State, Local, and Federal laws and regulations.`;
const M_REGION = `509.2.3.4.1 ASR Mitigation Evaluation Criteria
If the results of the initial proof-of-potential-reactivity test show the aggregate to be
"potentially reactive" or "reactive," the Contractor shall repeat the test procedure.`;

const IFB_PACKAGE = `${IFB_HEAD}\n\n${C_REGION}\n\n${M_REGION}`;

// The mid-content mentions that occur on this same package and must NEVER anchor §L.
const MID_CONTENT_MENTIONS = [
  ["wrapped line, no colon", `written questions in accordance with number 4 (below) of this\ninstructions to bidders section.`],
  ["mid-sentence reference", `See the Instructions to bidders for full details on the bid opening, RFIs and Site Visit information`],
  ["invitation-for-bids in prose", `to the responsible bidder whose bid, conforming\nto the invitation for bids, will be most advantageous to the Government.`],
  ["glossary definition", `performed or Materials to be provided. Also called Invitation for Bids.\nApparent Low Bidder.`],
] as const;

// A negotiated package that routes TODAY, through the existing contiguous "Instructions to Offerors" phrase.
// This is the non-regression control: whatever the flag does, this must route byte-identically.
const RFP_PACKAGE = `Instructions to Offerors
Offerors shall submit one electronic copy of the proposal.

all labor, materials, equipment, supplies, and transportation necessary to complete the scope of work.

Evaluation criteria: award will be made on a best-value basis.`;

// The SF-1442 NEGOTIATED heading. Leg 4 originally used this as the non-regression control and it failed the
// control's own precondition — which is how the second defect was found. The existing anchor looks for the
// contiguous phrase "instructions to offerors"; this heading puts three words between them, so a construction
// RFP on SF-1442 loses §L for exactly the reason an IFB does.
const SF1442_RFP_HEADING = `INSTRUCTIONS, CONDITIONS, AND NOTICES TO OFFERORS
Offerors shall submit one electronic copy of the proposal by 2:00 PM on 1 October 2026.

all labor, materials, equipment, supplies, and transportation necessary to complete the scope of work.

Evaluation criteria: award will be made on a best-value basis.`;

async function main() {
  console.log("GATE — sealed-bid (IFB) §L anchors\n");

  // ── LEG 1 · POSITIVE — flag ON places §L on the SF-1442 heading and un-abandons routing ──
  {
    const off = withFlag(false, () => routeCommercialSections(IFB_PACKAGE));
    const on = withFlag(true, () => routeCommercialSections(IFB_PACKAGE));
    if (off.placedKeys.includes("L")) fail("1 positive", "precondition broken: §L already placed with the flag OFF — this fixture no longer reproduces the defect");
    else if (!on.placedKeys.includes("L")) fail("1 positive", `flag ON did not place §L (placedKeys=[${on.placedKeys.join(",")}])`);
    else if (!on.routed) fail("1 positive", "§L placed but `routed` still false — the legacy §L-AND-§M predicate did not clear");
    else if (!on.sectionText.L.includes("9AM MDT on 10 September 2026")) fail("1 positive", "§L slice does not carry the bid-opening time — anchored in the wrong place");
    else if (!on.sectionText.L.includes("considering only price")) fail("1 positive", "§L slice does not carry the award basis");
    else pass("1 positive", `§L placed, routed=true, slice carries bid opening + award basis (${on.sectionText.L.length} chars)`);
  }

  // ── LEG 2 · FLAG-OFF NO-OP — default must be byte-identical to today, on both anchor sets ──
  for (const v2 of [false, true]) {
    const base = withFlag(false, () => routeCommercialSections(IFB_PACKAGE, { v2 }));
    const anchorsOff = withFlag(false, () => commercialAnchorsFor(v2).map((a) => `${a.key}:${a.re.source}`).join("|"));
    const anchorsOnL = withFlag(true, () => commercialAnchorsFor(v2).find((a) => a.key === "L")!.re.source);
    if (base.placedKeys.includes("L") && !v2) fail(`2 flag-off(v2=${v2})`, "§L placed with the flag OFF — the default is not a no-op");
    else if (anchorsOff === withFlag(true, () => commercialAnchorsFor(v2).map((a) => `${a.key}:${a.re.source}`).join("|"))) fail(`2 flag-off(v2=${v2})`, "flag ON did not change the anchor set at all — the flag is inert");
    else if (!anchorsOnL.includes("conditions,?\\s+and\\s+notices")) fail(`2 flag-off(v2=${v2})`, "flag ON did not fold the SF-1442 heading shape into §L");
    else pass(`2 flag-off(v2=${v2})`, "OFF leaves the anchor set untouched; ON extends §L only");
  }

  // ── LEG 3 · NEGATIVE CONTROL — mid-content mentions must not anchor §L even with the flag ON ──
  // These are the exact strings that recur on the real package. Anchoring on one would slice §C mid-sentence,
  // which is the failure this file's anchor doctrine (header-like markers only) exists to prevent.
  {
    let bad = 0;
    for (const [label, text] of MID_CONTENT_MENTIONS) {
      const r = withFlag(true, () => routeCommercialSections(`${C_REGION}\n\n${text}\n\n${M_REGION}`));
      if (r.placedKeys.includes("L")) { fail("3 negative", `MID-CONTENT MENTION PLACED §L (${label})`); bad++; }
    }
    if (bad === 0) pass("3 negative", `${MID_CONTENT_MENTIONS.length}/${MID_CONTENT_MENTIONS.length} mid-content mentions correctly placed no §L`);
  }

  // ── LEG 4 · NON-REGRESSION — the negotiated twin routes identically with the flag on and off ──
  {
    const off = withFlag(false, () => routeCommercialSections(RFP_PACKAGE));
    const on = withFlag(true, () => routeCommercialSections(RFP_PACKAGE));
    if (!off.placedKeys.includes("L")) fail("4 non-regression", "precondition broken: the RFP fixture does not place §L even today");
    else if (JSON.stringify(off.sectionText) !== JSON.stringify(on.sectionText)) fail("4 non-regression", "an offerors-headed package routes DIFFERENTLY with the flag on — the IFB shapes are leaking onto negotiated packages");
    else pass("4 non-regression", "offerors-headed package routes byte-identically with the flag on");
  }

  // ── LEG 4b · THE SECOND DEFECT — SF-1442's negotiated heading is unplaced today, and the flag fixes it ──
  // Found by leg 4's precondition, not by the run. Kept as its own leg so a future narrowing of shape (a)
  // back to "bidders" alone goes red here instead of silently re-breaking construction RFPs.
  {
    const off = withFlag(false, () => routeCommercialSections(SF1442_RFP_HEADING));
    const on = withFlag(true, () => routeCommercialSections(SF1442_RFP_HEADING));
    if (off.placedKeys.includes("L")) fail("4b sf1442-rfp", "precondition broken: the SF-1442 offerors heading already places §L — the second defect is gone and this leg is stale");
    else if (!on.placedKeys.includes("L")) fail("4b sf1442-rfp", "flag ON did not place §L on the SF-1442 negotiated heading — shape (a) covers only the sealed-bid pole");
    else if (!on.sectionText.L.includes("2:00 PM on 1 October 2026")) fail("4b sf1442-rfp", "§L slice does not carry the submission deadline");
    else pass("4b sf1442-rfp", "SF-1442 negotiated heading also placed — the twin defect is covered");
  }

  // ── LEG 5 · the UFGS section-number shape, and TWO negatives that fail for DIFFERENT reasons ──
  // The neighbour fixture is deliberately at LINE START. An earlier draft buried it mid-sentence, so the
  // line-start guard rejected it and the leg passed without ever exercising the number itself — it would have
  // stayed green while the shape was loosened to 00 21 1x. Two negatives now, one per guard: a real adjacent
  // UFGS section title (tests the NUMBER), and a mid-sentence mention (tests LINE START).
  {
    const on = withFlag(true, () => routeCommercialSections(`${C_REGION}\n\nSection 00 21 13 - Instructions to Bidders\nBids are due at 9AM MDT.\n\n${M_REGION}`));
    const neighbourTitle = withFlag(true, () => routeCommercialSections(`${C_REGION}\n\nSection 00 21 14 - Bid Bond Form\nAttach the executed bond.\n\n${M_REGION}`));
    const midSentence = withFlag(true, () => routeCommercialSections(`${C_REGION} refer to drawing sheet section 00 21 13 for details.\n\n${M_REGION}`));
    if (!on.placedKeys.includes("L")) fail("5 ufgs", "the UFGS 00 21 13 section title did not place §L");
    else if (neighbourTitle.placedKeys.includes("L")) fail("5 ufgs", "the ADJACENT section title 00 21 14 placed §L — the number is too loose");
    else if (midSentence.placedKeys.includes("L")) fail("5 ufgs", "a mid-sentence '00 21 13' placed §L — the line-start guard is gone");
    else pass("5 ufgs", "00 21 13 at line start places §L; the 00 21 14 title does not; a mid-sentence mention does not");
  }

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
