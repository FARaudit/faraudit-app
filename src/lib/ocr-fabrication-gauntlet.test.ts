// OCR-FABRICATION GAUNTLET (Brain card #415 Gate-4 bar). Run: npx tsx src/lib/ocr-fabrication-gauntlet.test.ts
//
// Adversarial red-team of the OCR-accuracy gate at the LAYER-3/4 boundary — the FORMAT-VALID misread class that
// layer-2 structural validation cannot catch (52.212-1→52.212-7, $1,300→$1,800, a valid-but-wrong date). Not the easy
// impossible-value class. Proven GENERAL (five decision classes, multiple agencies/NAICS), not FA8137-only, and with
// the MANDATORY real FA8137 fixtures (Wage-Det degraded tokens + impossible dates, per card #414 / confound-hunt).
//
// THE BAR (must both be zero):
//   • WRONG_VERDICT  — a case that should fail-toward-NHR but the gate TRUSTED (a fabricated committal). Catastrophic.
//   • UNDER_ABSTAIN  — a case vision independently CONFIRMED but the gate abstained anyway (needless INCOMPLETE).
//
// KNOWN, DISCLOSED BOUNDARY (not a gate failure — a limit of any two-reader scheme): if OCR AND an independent vision
// read make the IDENTICAL misread, no gate can catch it (we confirm by agreement, we never average — Brain constraint
// 1). The corpus includes that case explicitly, labelled, so the boundary is on the record, not hidden.

import { gateOcrText, type VisionConfirmer, type VisionTokenRead } from "./ocr-accuracy-gate";

// Vision reads back a fixed "document truth" per OCR token. truth==OCR → confirm; truth!=OCR → misread exposed → NHR;
// null → not located → NHR. Omit the confirmer entirely to test the deterministic (no-vision) fail-toward-NHR default.
function truth(map: Record<string, string | null>): VisionConfirmer {
  return async (residual) => residual.map((v): VisionTokenRead => ({ token: v.token, visionValue: map[v.token] ?? null }));
}

interface Case { name: string; text: string; vision?: VisionConfirmer; expect: "trust" | "nhr"; boundary?: boolean; }

// Real FA8137 OCR samples (confound-hunt-2026-07-11.txt) — the mandatory fixtures.
const WAGE_DET_REAL = `"General Decision Number: OK2@260049 01/23/2026 Superseded General Decision Number: OK20250049 State: Oklahoma Construction Type: Building. Effective 96/01/2023 through 05/26/2085. Laborer rate $18.42 per hour."`;
const SIGNIN_REAL = `ORGANIZATION TIME EVENT DATE AFSC/PZIOC 10:00 AM 28 May 2026 Site Visit Sign-In PROJECT/LOCATION WWYK260007- Renovate Pratt and Whitney B3001.`;

const CORPUS: Case[] = [
  // ── MANDATORY real FA8137 fixtures ──
  { name: "FA8137 Wage-Det (real OCR: impossible dates 96/01/2023 + 05/26/2085)", text: WAGE_DET_REAL, expect: "nhr" },
  { name: "FA8137 Wage-Det (real) — even WITH a vision confirmer, impossible dates are caught pre-vision", text: WAGE_DET_REAL, vision: truth({ "$18.42": "$18.42" }), expect: "nhr" },
  { name: "FA8137 Sign-in roster (real OCR, no committal tokens) — clean prose trusts", text: SIGNIN_REAL, expect: "trust" },

  // ── GENERAL format-valid MISREAD red-team (vision disagrees → NHR). Multiple classes, multiple contexts. ──
  { name: "clause 52.212-7 (doc=52.212-1) — VA construction", text: "The clause 52.212-7 is incorporated by reference.", vision: truth({ "52.212-7": "52.212-1" }), expect: "nhr" },
  { name: "clause 252.204-7012 (doc=252.204-7019) — DoD cyber", text: "DFARS 252.204-7012 applies to this CUI buy.", vision: truth({ "252.204-7012": "252.204-7019" }), expect: "nhr" },
  { name: "money $1,800 (doc=$1,300) — bid guarantee", text: "A bid guarantee of $1,800 is required.", vision: truth({ "$1,800": "$1,300" }), expect: "nhr" },
  { name: "money $250,000.00 (doc=$25,000.00) — magnitude misread", text: "The magnitude is $250,000.00 for this order.", vision: truth({ "$250,000.00": "$25,000.00" }), expect: "nhr" },
  { name: "date 03/15/2027 (doc=08/15/2027) — offer due", text: "Offers are due 03/15/2027.", vision: truth({ "03/15/2027": "08/15/2027" }), expect: "nhr" },
  { name: "NAICS 541511 (doc=541512) — size-standard-shifting misread", text: "The applicable NAICS is 541511.", vision: truth({ "541511": "541512" }), expect: "nhr" },
  { name: "residual not located by vision → NHR", text: "Clause 52.219-14 applies.", vision: truth({ "52.219-14": null }), expect: "nhr" },
  { name: "multi-token, ONE misread sinks the whole doc", text: "Clauses 52.212-1 and 52.212-4 apply; magnitude $500,000.", vision: truth({ "52.212-1": "52.212-1", "52.212-4": "52.212-5", "$500,000": "$500,000" }), expect: "nhr" },
  { name: "no vision available + committal residual → deterministic fail-toward-NHR", text: "NAICS 236220 applies.", expect: "nhr" },

  // ── UNDER_ABSTAIN guards — vision INDEPENDENTLY confirms the true value → must clear (no needless abstain). ──
  { name: "clause 52.212-1 confirmed", text: "The clause 52.212-1 is incorporated.", vision: truth({ "52.212-1": "52.212-1" }), expect: "trust" },
  { name: "money $1,300 confirmed", text: "A bid guarantee of $1,300 is required.", vision: truth({ "$1,300": "$1,300" }), expect: "trust" },
  { name: "date 08/15/2027 confirmed", text: "Offers are due 08/15/2027.", vision: truth({ "08/15/2027": "08/15/2027" }), expect: "trust" },
  { name: "NAICS 541512 confirmed", text: "The applicable NAICS is 541512.", vision: truth({ "541512": "541512" }), expect: "trust" },
  { name: "multi-token all confirmed → trust", text: "Clauses 52.212-1 and 52.212-4 apply; magnitude $500,000.", vision: truth({ "52.212-1": "52.212-1", "52.212-4": "52.212-4", "$500,000": "$500,000" }), expect: "trust" },
  { name: "clean prose, zero decision tokens → trust", text: "The contractor shall perform all work in a professional manner per the statement of work.", expect: "trust" },

  // ── DISCLOSED BOUNDARY — OCR and vision make the SAME misread. No two-reader scheme catches this; recorded openly. ──
  { name: "[BOUNDARY] OCR + vision both read 52.212-7 (truth is 52.212-1) — undetectable by agreement", text: "The clause 52.212-7 is incorporated.", vision: truth({ "52.212-7": "52.212-7" }), expect: "trust", boundary: true },
];

(async () => {
  let wrongVerdict = 0, underAbstain = 0, boundaryHits = 0, pass = 0;
  for (const c of CORPUS) {
    const g = await gateOcrText(c.text, { docName: c.name, visionConfirm: c.vision });
    const got = g.trustOcrText ? "trust" : "nhr";
    const okCase = got === c.expect;
    if (okCase) pass++;
    if (c.boundary) { boundaryHits++; continue; } // boundary case is expected-trust by construction; excluded from bar
    // WRONG_VERDICT: should NHR, gate TRUSTED (fabricated committal).
    if (c.expect === "nhr" && got === "trust") { wrongVerdict++; console.log(`  ✗ WRONG_VERDICT: ${c.name} — gate TRUSTED a misread (${g.reason})`); }
    // UNDER_ABSTAIN: should trust, gate abstained.
    if (c.expect === "trust" && got === "nhr") { underAbstain++; console.log(`  ✗ UNDER_ABSTAIN: ${c.name} — gate abstained on a confirmed read (${g.reason})`); }
  }
  console.log(`\nGauntlet corpus: ${CORPUS.length} cases · ${pass} matched expectation · ${boundaryHits} disclosed-boundary`);
  console.log(`BAR → WRONG_VERDICT=${wrongVerdict} (must be 0) · UNDER_ABSTAIN=${underAbstain} (must be 0)`);
  const barClear = wrongVerdict === 0 && underAbstain === 0;
  console.log(barClear ? "\n✅ GAUNTLET CLEAR — bar met." : "\n❌ GAUNTLET FAIL — bar breached.");
  process.exit(barClear ? 0 : 1);
})();
