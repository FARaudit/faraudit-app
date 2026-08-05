// $0 gate — construction OUT_OF_SCOPE detector.
//   npx tsx scripts/audit-ai/test-construction-detector.ts
//
// ── WHY THIS GATE ASSERTS BRANCHES, NOT BOOLEANS (2026-08-04) ─────────────────────────────────────
// As authored (Brain card-64 Part D) this gate asserted only fired / did-not-fire. That boolean cannot
// tell apart two completely different reasons for "did not fire":
//   (a) OFFER_STRUCTURE veto — the package is biddable, so out-of-scope is vetoed (card 288 RULING 1);
//   (b) undetermined — the package simply carries no construction signal.
// Measured over the five gold sources, FOUR of the five exit via (a). Three of the four LOAD-BEARING
// NEGATIVES were therefore VACUOUS: they short-circuit at the veto before any construction test runs,
// so they would have passed just as happily on a 459-page CSI spec book. A negative control that cannot
// distinguish "not construction" from "exited early" is not a control.
// So each case now declares its TERMINATING BRANCH, and every negative additionally asserts the
// COUNTERFACTUAL — absent the veto it STILL does not fire. That is the property this gate always claimed.
//
// ── #5 IS AN UNRESOLVED DOCTRINE COLLISION — DO NOT TUNE EITHER SIDE ──────────────────────────────
// FA667024R0001 is unambiguously construction: 43 distinct CSI MasterFormat section codes, SF-1442
// header, Davis-Bacon, primary NAICS 236220. Two standing rulings disagree about what the engine owes it:
//   · Brain construction ruling 2026-06-26 — encoded in the frozen gold anchor
//     FA667024R0001.judgment.frozen.v2.json (key_type oos_detection, expected_outcome OUT_OF_SCOPE).
//     That record lists "any substantive verdict emitted on a construction package" as a LAW VIOLATION.
//   · Brain card 288 RULING 1 — narrowed the detector so a resolvable offer structure VETOES
//     out-of-scope (section-boundary-detector.ts:470). FA667024R0001 HAS a bid schedule / offers-due,
//     so it is routed to the decided path — which emits exactly the verdict the anchor forbids.
// The engine follows the LATER ruling; the gold anchor still encodes the earlier one. Resolving this
// means either re-authoring the anchor to a full_verdict key under the construction carrier, OR
// narrowing the veto so a drawing-dominant spec book cannot escape on submission mechanics alone.
// That is a Brain/CEO ruling, not a mechanical follow-on. Until it is ruled this case stays RED ON
// PURPOSE and prints the collision. Do NOT "fix" it by flipping the expectation.
import { readFileSync, existsSync } from "node:fs";
import { detectConstructionOutOfScope } from "@/lib/section-boundary-detector";
import { SF1442_HEADER_RE, DAVIS_BACON_RE, OFFER_STRUCTURE_RE } from "@/lib/construction-recognizers";

const G = "scripts/audit-ai/gold-sets";
// Mirrors the detector's own CSI recognizer. Kept local and asserted against the detector's behaviour
// below rather than imported, so a silent change to one is visible as a disagreement, not absorbed.
const CSI_SECTION_RE = /\bSECTION\s+\d{2}\s+\d{2}\s+\d{2}\b/gi;

function sourceFor(sol: string): string {
  const complete = `${G}/${sol}-FULL-SOURCE.complete.txt`;
  const plain = `${G}/${sol}-FULL-SOURCE.txt`;
  return readFileSync(existsSync(complete) ? complete : plain, "utf8");
}

/** Every distinct NAICS-shaped mention, in document order. */
function naicsAll(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/NAICS[^0-9]{0,40}(\d{6})/gi)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}
/** The PRIMARY NAICS. The original helper took the first match anywhere in the document, which on
 *  FA667024R0001 returns 541519 (an incidental mention) instead of the real 236220 — the acquisition
 *  NAICS appears LATER, in "NAICS) code for this acquisition is 236220". That mis-read is currently
 *  harmless only because the veto returns before the NAICS test is ever reached; it would become a
 *  silent false negative the moment that order changes. So: prefer the labelled acquisition NAICS,
 *  fall back to first-mention, and always surface the full list so a wrong pick is visible. */
function naicsPrimary(text: string): string | null {
  const labelled = text.match(/NAICS[^.]{0,60}?for\s+this\s+acquisition\s+is\s*:?\s*(\d{6})/i);
  if (labelled) return labelled[1];
  return naicsAll(text)[0] ?? null;
}

/** A negative control is VACUOUS when it only stays in-scope because the veto short-circuited first —
 *  i.e. it would have fired on its own signals. csi >= 3 is the sole remaining fire condition under
 *  card 288 (NAICS-23 alone no longer fires). Extracted so it can carry its own planted positive:
 *  an enforcement leg that never evaluates a true case reports all-clear forever. */
function isVacuousNegative(csi: number): boolean {
  return csi >= 3;
}

type Branch = "veto" | "undetermined" | "fire";
interface Case {
  sol: string;
  expectBranch: Branch;
  loadBearing: boolean;
  role: string;
  /** Ruled-but-unencoded: the gold anchor still demands "fire" while the engine takes the veto. */
  collision?: string;
}

const CASES: Case[] = [
  {
    sol: "FA667024R0001",
    expectBranch: "fire",
    loadBearing: false,
    role: "#5 construction (gold anchor: MUST fire OUT_OF_SCOPE)",
    collision:
      "engine takes the card-288 OFFER_STRUCTURE veto; frozen gold anchor (ruling 2026-06-26) demands OUT_OF_SCOPE",
  },
  { sol: "N4008526R0065", expectBranch: "undetermined", loadBearing: true, role: "#1 Norfolk ship-repair (in-scope CAUTION — MUST NOT trip)" },
  { sol: "1240LP26Q0067", expectBranch: "veto", loadBearing: true, role: "#2 supply (in-scope BID — MUST NOT trip)" },
  { sol: "SPRDL125Q0030", expectBranch: "veto", loadBearing: true, role: "#3 supply (in-scope INELIGIBLE — MUST NOT trip)" },
  { sol: "AOCSSB26R0023", expectBranch: "veto", loadBearing: false, role: "#4 AOC plaster conservation (NAICS 541990 services — NOT construction)" },
];

let fail = false;
const collisions: string[] = [];
console.log("── construction OUT_OF_SCOPE detector — branch replay ──\n");

for (const c of CASES) {
  const text = sourceFor(c.sol);
  const naicsList = naicsAll(text);
  const naicsCode = naicsPrimary(text);
  const offer = OFFER_STRUCTURE_RE.test(text);
  const csi = new Set((text.match(CSI_SECTION_RE) ?? []).map((s) => s.toUpperCase())).size;

  const det = detectConstructionOutOfScope({ naicsCode, fullText: text });
  const actual: Branch = det ? "fire" : offer ? "veto" : "undetermined";
  const ok = actual === c.expectBranch;
  if (!ok) fail = true;
  if (!ok && c.collision) collisions.push(`${c.sol}: ${c.collision}`);

  // THE COUNTERFACTUAL — the property a load-bearing negative actually claims. A negative that only
  // passes because the veto fired first proves nothing about construction detection, so re-run it with
  // the veto removed from the picture: with no offer structure, does it STILL stay in-scope?
  // (csi >= 3 is the sole remaining fire condition; NAICS-23 alone no longer fires under card 288.)
  let cf = "";
  if (c.expectBranch !== "fire") {
    const wouldFireWithoutVeto = isVacuousNegative(csi);
    cf = wouldFireWithoutVeto
      ? `  ⚠ COUNTERFACTUAL FAILED — absent the veto this WOULD fire (${csi} CSI sections): the negative is vacuous`
      : `  ✓ counterfactual: still in-scope without the veto (${csi} CSI section(s) < 3)`;
    if (wouldFireWithoutVeto && c.loadBearing) fail = true;
  }

  const tag = ok ? "PASS" : c.loadBearing ? "FAIL (LOAD-BEARING NEGATIVE TRIPPED)" : "FAIL";
  const detail = det
    ? `OUT_OF_SCOPE [${det.tier}] ${det.matchedSignals.join(" · ")}`
    : offer
      ? "in-scope — OFFER_STRUCTURE veto (biddable; card 288 RULING 1)"
      : "in-scope — undetermined (no construction signal)";

  console.log(`  [${tag}] ${c.sol} — ${c.role}`);
  console.log(`         branch: expected ${c.expectBranch}, actual ${actual}`);
  console.log(`         → ${detail}`);
  console.log(
    `         signals: CSI=${csi} · SF-1442=${SF1442_HEADER_RE.test(text)} · Davis-Bacon=${DAVIS_BACON_RE.test(text)} · NAICS primary=${naicsCode ?? "n/a"} (all: ${naicsList.join(", ") || "none"})`,
  );
  if (cf) console.log(cf);
  console.log();
}

// ── PLANTED POSITIVES — this gate must be able to go red ────────────────────────────────────────
// Without these, "all pass" is indistinguishable from "asserted nothing".
{
  const csiBook = Array.from({ length: 5 }, (_, i) => `SECTION 0${i + 1} 33 00`).join("\n");
  const planted = detectConstructionOutOfScope({ naicsCode: "236220", fullText: csiBook });
  if (!planted) {
    console.error("✗ PLANTED POSITIVE FAILED — a CSI multi-division book with no offer structure did NOT fire.");
    fail = true;
  } else {
    console.log("  ✓ PLANTED: CSI multi-division book with no offer structure DOES fire OUT_OF_SCOPE");
  }
  const vetoed = detectConstructionOutOfScope({ naicsCode: "236220", fullText: `${csiBook}\nBid Schedule` });
  if (vetoed) {
    console.error("✗ PLANTED NEGATIVE FAILED — the OFFER_STRUCTURE veto did not suppress the fire.");
    fail = true;
  } else {
    console.log("  ✓ PLANTED: the same book WITH a bid schedule is vetoed — the veto is live and load-bearing");
  }
  // The vacuity leg itself: it must call a real negative vacuous, and must not over-fire on a clean one.
  if (!isVacuousNegative(43)) {
    console.error("✗ PLANTED POSITIVE FAILED — a 43-CSI-section negative was NOT called vacuous.");
    fail = true;
  } else if (isVacuousNegative(1)) {
    console.error("✗ PLANTED NEGATIVE FAILED — a 1-CSI-section negative was wrongly called vacuous.");
    fail = true;
  } else {
    console.log("  ✓ PLANTED: the vacuity check calls a 43-section negative vacuous and a 1-section one clean");
  }
  const naicsProbe = naicsPrimary("NAICS code 541519 ... the NAICS) code for this acquisition is 236220");
  if (naicsProbe !== "236220") {
    console.error(`✗ PLANTED POSITIVE FAILED — naicsPrimary returned ${naicsProbe}, expected 236220 (first-match regression).`);
    fail = true;
  } else {
    console.log("  ✓ PLANTED: naicsPrimary prefers the labelled acquisition NAICS over an earlier incidental mention");
  }
}

if (fail) {
  console.error("\n✗ DETECTOR REPLAY FAILED — do NOT tune-to-pass.");
  if (collisions.length) {
    console.error("  UNRESOLVED DOCTRINE COLLISION (a Brain/CEO ruling, not a gate edit):");
    for (const c of collisions) console.error(`    · ${c}`);
    console.error("  Card back: re-author the gold anchor to the construction carrier, OR narrow the veto.");
  }
  process.exit(1);
}
console.log("\n✓ all branch expectations met; every load-bearing negative survives its counterfactual.");
