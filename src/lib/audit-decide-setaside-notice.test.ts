// $0 PROOF for Brain #334 (Direction C) — set-aside NOTICE detector (A) + broadened conflict gate (B).
// Run: npx tsx src/lib/audit-decide-setaside-notice.test.ts
//
// Root (live FA442726Q1068, audit 8b03b538): the governing set-aside NOTICES (52.219-3 HUBZone + 52.219-6 Total-SB,
// BOTH marked applicable in the clause matrix) were NEVER surfaced as findings — every lens emitted only NMR (52.219-33)
// / LOS (52.219-14). So detectSetAsideConflict was STARVED (docCanons empty → conflict:false) and the verdict committed
// BID_WITH_CAUTION on the wrong basis (NMR/NAICS/cyber), never considering HUBZone at all. Brain ruling:
//   (A) deterministic clause-matrix scan emits a typed eligibility finding per set-aside notice marked applicable;
//   (B) detectSetAsideConflict reads the RAW clause matrix — SAM-vs-doc AND doc-internal multi-program — and ≥2
//       mutually-exclusive programs applicable is itself an NHR trigger, INDEPENDENT of SAM (fixes the old
//       "doc carries the SAM program → agreement" short-circuit). Pole = NHR-with-both-surfaced; any committal = RED FLAG.
import { detectSetAsideNotices, emitSetAsideNoticeFindings, mergeSetAsideNoticeFindings, detectSetAsideConflict, isPositiveSetAside, deriveVerdict } from "./audit-decide";
import type { TypedFinding } from "./audit-findings";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };
const base = { bidderProfile: null, coverageComplete: true, verifierSound: true, conflict: false } as const;

// The REAL FA442726Q1068 clause matrix (verbatim rows, from the banked run-record) — both HUBZone (52.219-3) AND
// Total-SB (52.219-6) marked "Yes", alongside the HUBZone price-pref (-4, NOT a pool definer) and NMR/LOS/util.
const FA1068_MATRIX = [
  "RFO Clause 52.217-7 Option for Increased Quantity-Separately Priced Line Item Mar 1989 Yes",
  "RFO Clause 52.219-3 Notice of HUBZone Set-Aside or Sole-Source Award Class Deviation Date (Feb 2026) Yes",
  "RFO Clause 52.219-4 Notice of Price Evaluation Preference for HUBZone Small Business Concerns Feb 2026 Yes",
  "RFO Clause 52.219-6 Notice of Total Small Business Set-Aside Feb 2026 Yes",
  "RFO Clause 52.219-8 Utilization of Small Business Concerns Feb 2026 Yes",
  "RFO Clause 52.219-14 Limitations on Subcontracting Feb 2026 Yes",
  "RFO Clause 52.219-33 Nonmanufacturer Rule Yes",
].join("\n");

console.log("\n── 1 · detectSetAsideNotices: FA1068 matrix → HUBZone + Total-SB (NOT -4 price-pref, NOT -8/-14/-33) ──");
{
  const hits = detectSetAsideNotices(FA1068_MATRIX);
  const canons = hits.map((h) => h.canon).sort();
  assert(JSON.stringify(canons) === JSON.stringify(["sb:total", "se:hubzone"]), `exactly {se:hubzone, sb:total} (got ${JSON.stringify(canons)})`);
  assert(hits.every((h) => FA1068_MATRIX.includes(h.excerpt)), "every excerpt is a VERBATIM source substring (Rule-64 grounded)");
}

console.log("\n── 2 · applicability: a notice marked 'No' is NOT counted; a bare prose mention is NOT counted ──");
{
  const noRow = "RFO Clause 52.219-27 Notice of SDVOSB Set-Aside Feb 2026 No\nRFO Clause 52.219-8 Utilization Feb 2026 Yes";
  assert(detectSetAsideNotices(noRow).length === 0, "'No'-marked SDVOSB notice → not counted");
  const prose = "The offeror shall comply with FAR 52.219-6 as applicable to this requirement.";
  assert(detectSetAsideNotices(prose).length === 0, "bare prose mention (no Yes/No column) → not counted (conservative)");
}

console.log("\n── 3 · (B) DOC-INTERNAL MULTI-PROGRAM: FA1068 matrix + SAM=HZC → CONFLICT naming BOTH → deriveVerdict NHR ──");
{
  const c = detectSetAsideConflict("HZC", [], FA1068_MATRIX);
  assert(!!c, "conflict detected from the RAW matrix even with ZERO findings (gate no longer starved)");
  assert(!!c && /HUBZone/.test(c.doc) && /Total Small Business/.test(c.doc), `doc names BOTH HUBZone + Total-SB (got ${JSON.stringify(c?.doc)})`);
  const d = deriveVerdict({ findings: [], ...base, setAsideConflict: c });
  assert(d.verdict === "NEEDS_HUMAN_REVIEW", `verdict = NHR, NOT a committal (got ${d.verdict})`);
  assert(/HUBZone/.test(d.reason) && /Total Small Business/.test(d.reason), "reason surfaces BOTH programs for CO clarification");
}

console.log("\n── 4 · (A) emitSetAsideNoticeFindings: grounds the basis as positive set-aside eligibility findings ──");
{
  const emitted = emitSetAsideNoticeFindings(FA1068_MATRIX);
  assert(emitted.length === 2, `2 findings emitted (got ${emitted.length})`);
  assert(emitted.every((f) => f.kind === "eligibility_bar" && f.grounded && FA1068_MATRIX.includes(f.excerpt)), "each is a grounded eligibility_bar with a verbatim excerpt");
  assert(emitted.every((f) => isPositiveSetAside(f)), "each is recognized as a POSITIVE set-aside (routes through the existing eligibility machinery)");
  assert(emitted.some((f) => /HUBZone/.test(f.requirement)) && emitted.some((f) => /Total Small Business/.test(f.requirement)), "HUBZone + Total-SB both named in requirement text");
}

console.log("\n── 5 · -4 EXCLUSION: HUBZone PRICE-PREFERENCE (52.219-4) alongside a Total-SB set-aside is NOT a conflict ──");
{
  // A Total-SB set-aside where HUBZone firms merely get a price preference is CONSISTENT (one pool: small business).
  const totalWithHubPref = "RFO Clause 52.219-4 Notice of Price Evaluation Preference for HUBZone Feb 2026 Yes\nRFO Clause 52.219-6 Notice of Total Small Business Set-Aside Feb 2026 Yes";
  assert(detectSetAsideNotices(totalWithHubPref).map((h) => h.canon).join() === "sb:total", "only Total-SB is a pool definer (-4 excluded)");
  assert(detectSetAsideConflict("SBA", [], totalWithHubPref) === undefined, "SAM=Total-SB + doc Total-SB(+HUBZone pref) → agreement, NO false conflict");
}

console.log("\n── 6 · SINGLE clean set-aside (no ambiguity): SAM=HZC + doc HUBZone-only → NO conflict (agreement) ──");
{
  const hubOnly = "RFO Clause 52.219-3 Notice of HUBZone Set-Aside or Sole-Source Award Feb 2026 Yes\nRFO Clause 52.219-8 Utilization Feb 2026 Yes";
  assert(detectSetAsideNotices(hubOnly).map((h) => h.canon).join() === "se:hubzone", "one program: HUBZone");
  assert(detectSetAsideConflict("HZC", [], hubOnly) === undefined, "SAM=HUBZone + doc HUBZone → agreement, no conflict");
}

console.log("\n── 7 · (B) SINGLE doc program ≠ SAM (original #332 root, now also via raw source) → CONFLICT → NHR ──");
{
  const totalOnly = "RFO Clause 52.219-6 Notice of Total Small Business Set-Aside Feb 2026 Yes";
  const c = detectSetAsideConflict("HZC", [], totalOnly); // SAM=HUBZone, doc=Total-SB only
  assert(!!c && c.sam === "HUBZone" && /Total Small Business/.test(c.doc), `SAM=HUBZone vs doc=Total-SB → conflict (got ${JSON.stringify(c)})`);
  assert(deriveVerdict({ findings: [], ...base, setAsideConflict: c }).verdict === "NEEDS_HUMAN_REVIEW", "→ NHR");
}

console.log("\n── 8 · mergeSetAsideNoticeFindings: dedups vs a lens finding that already covers the program ──");
{
  const lensHub: TypedFinding = { requirement: "HUBZone set-aside applies", citation: "FAR 52.219-3", excerpt: "HUBZone set-aside", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "contracts_attorney", requiredAttribute: "HUBZone certification", curableInWindow: false };
  const merged = mergeSetAsideNoticeFindings([lensHub], emitSetAsideNoticeFindings(FA1068_MATRIX));
  const hubCount = merged.filter((f) => /52\.219-3\b/.test(f.citation) || /HUBZone/.test(f.requirement)).length;
  assert(hubCount === 1, `HUBZone not duplicated (lens finding kept, notice deduped) — got ${hubCount}`);
  assert(merged.some((f) => /Total Small Business/.test(f.requirement)), "Total-SB notice STILL added (not covered by the lens)");
}

console.log("\n── 9 · CONSERVATIVE / no-op: empty source, no notices → no findings, no conflict (byte-identical path) ──");
{
  assert(emitSetAsideNoticeFindings("").length === 0 && emitSetAsideNoticeFindings(null).length === 0, "no source → no emitted findings");
  assert(detectSetAsideNotices("no set-aside clauses here at all").length === 0, "no notices → []");
  assert(detectSetAsideConflict("HZC", [], "no clauses") === undefined, "no doc set-aside → no conflict");
  // backward-compat: omitting source behaves like the pre-#334 findings-only signature (existing #332 test relies on this)
  const totalSb: TypedFinding = { requirement: "Total Small Business set-aside; FAR 52.219-6", citation: "FAR 52.219-6", excerpt: "Total Small Business Set-Aside", kind: "eligibility_bar", controllability: "already_satisfied", grounded: true, lens: "x" };
  assert(!!detectSetAsideConflict("HZC", [totalSb]), "no-source call still detects SAM-vs-finding conflict (backward-compatible)");
}

console.log("\n── 10 · ORCHESTRATOR MIRROR: real FA1068 findings (NMR/LOS only) + emit + gate → NHR w/ BOTH surfaced ──");
{
  // The live run's actual findings were all bidder_controls NMR/LOS — the set-aside was invisible. Reproduce the
  // exact orchestrator sequence: merge notice findings, detect conflict from raw source, derive the verdict.
  const liveFindings: TypedFinding[] = [
    { requirement: "Nonmanufacturer Rule (FAR 52.219-33) applies.", citation: "FAR 52.219-33", excerpt: "52.219-33 Nonmanufacturer Rule Yes", kind: "eligibility_bar", controllability: "bidder_controls", grounded: true, lens: "contracts_attorney", requiredAttribute: "nonmanufacturer-rule-compliance" },
    { requirement: "FAR 52.219-14 Limitations on Subcontracting is incorporated.", citation: "FAR 52.219-14", excerpt: "52.219-14 Limitations on Subcontracting Feb 2026 Yes", kind: "clause_flowdown", controllability: "bidder_controls", grounded: true, lens: "contracts_attorney" },
  ];
  const findings = mergeSetAsideNoticeFindings(liveFindings, emitSetAsideNoticeFindings(FA1068_MATRIX));
  assert(findings.length === 4, `set-aside basis now surfaced: 2 NMR/LOS + 2 set-aside notices = 4 (got ${findings.length})`);
  const conflict = detectSetAsideConflict("HZC", findings, FA1068_MATRIX);
  const d = deriveVerdict({ findings, ...base, setAsideConflict: conflict, source: FA1068_MATRIX });
  assert(d.verdict === "NEEDS_HUMAN_REVIEW", `verdict = NHR (was a FALSE BID_WITH_CAUTION live) — got ${d.verdict}`);
  assert(/HUBZone/.test(d.reason) && /Total Small Business/.test(d.reason), "BOTH programs surfaced in the verdict reason");
}

// ── Brain #334 PRE-LIVE REVIEW regressions (adversarial workflow, 11 confirmed defects) ──
console.log("\n── 11 · FLATTENED TABLE (no 'Clause' anchor word) — row bounded by clause NUMBER/newline, reads its OWN cell ──");
{
  // P1 row-window-multirow-bleed: the window used to bleed into a later clause's Yes/No.
  const miss = "52.219-6   Notice of Total Small Business Set-Aside   Yes\n52.203-3   Gratuities   No\n52.204-7   SAM   No";
  assert(detectSetAsideNotices(miss).map((h) => h.canon).join() === "sb:total", "applicable Total-SB DETECTED (not dropped by a later 'No' row)");
  const fp = "52.219-6   Notice of Total Small Business Set-Aside   No\n52.222-3   Convict Labor   Yes";
  assert(detectSetAsideNotices(fp).length === 0, "'No'-marked set-aside NOT counted (not flipped by a later 'Yes' row)");
  assert(detectSetAsideConflict("HZC", [], fp) === undefined, "→ no fabricated SAM-vs-doc conflict off a No-marked row");
  // P1 mid-row anchor: "(see FAR 19.502)" / a designation column no longer truncates before the Yes cell.
  assert(detectSetAsideNotices("52.219-6 Notice of Total Small Business Set-Aside (see FAR 19.502)  Yes").map((h) => h.canon).join() === "sb:total", "mid-row FAR-part reference does not truncate the row");
  // multiple clauses packed on ONE line (no newline) — each reads its own cell.
  assert(detectSetAsideNotices("52.219-3 Notice of HUBZone Set-Aside Yes  52.219-6 Notice of Total Small Business Set-Aside No").map((h) => h.canon).sort().join() === "se:hubzone", "packed line: HUBZone(Yes) counted, Total-SB(No) excluded");
}

console.log("\n── 12 · APPLICABILITY MARKERS: X / checkmark count; prose 'as applicable' does NOT ──");
{
  assert(detectSetAsideNotices("52.219-6 Notice of Total Small Business Set-Aside   X").map((h) => h.canon).join() === "sb:total", "standalone X = applicable");
  assert(detectSetAsideNotices("52.219-6 Notice of Total Small Business Set-Aside   ✓").map((h) => h.canon).join() === "sb:total", "checkmark = applicable");
  assert(detectSetAsideNotices("The offeror shall comply with FAR 52.219-6 as applicable to this requirement.").length === 0, "prose 'as applicable' is NOT a marker (no false conflict)");
  assert(detectSetAsideNotices("52.219-6 Notice of Total Small Business Set-Aside   Not Applicable").length === 0, "'Not Applicable' = not counted");
}

console.log("\n── 13 · FINDINGS-UNION pool-definer discipline: -4 price-pref does NOT inject a phantom pool; prose Total-SB does ──");
{
  // P1 findings-union -4 leak: a lens 52.219-4 HUBZone price-preference finding must NOT add a HUBZone pool.
  const pricePref: TypedFinding = { requirement: "HUBZone Price Evaluation Preference (FAR 52.219-4) applies in the evaluation.", citation: "FAR 52.219-4", excerpt: "Notice of Price Evaluation Preference for HUBZone Small Business Concerns", kind: "eligibility_bar", controllability: "bidder_controls", grounded: true, lens: "pricing_analyst", requiredAttribute: "HUBZone" };
  const totalOnly = "52.219-6 Notice of Total Small Business Set-Aside  Yes";
  assert(detectSetAsideConflict("SBA", [pricePref], totalOnly) === undefined, "-4 price-pref finding + Total-SB set-aside, SAM=Total-SB → NO false multi-program NHR");
  // prose-only Total-SB (no clause number, no matrix) surfaced by a lens → still conflicts vs SAM=HUBZone.
  const proseTotal: TypedFinding = { requirement: "This is a total small business set-aside; only small businesses may compete.", citation: "§ Set-Aside", excerpt: "total small business set-aside", kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "contracts_attorney", requiredAttribute: "small business", curableInWindow: false };
  assert(!!detectSetAsideConflict("HZC", [proseTotal], ""), "prose-only Total-SB (no matrix) vs SAM=HUBZone → conflict (union fallback works)");
  // Unmapped SAM code (Indian/Local-Area — no doc-side producer) → conservative NO conflict (pre-live review #334).
  assert(detectSetAsideConflict("ISBEE", [], "52.219-6 Notice of Total Small Business Set-Aside  Yes") === undefined, "SAM=ISBEE (unmapped) → no false conflict (conservative)");
}

// ── Brain #334 BLIND (2nd) + /code-review PASS regressions ──
console.log("\n── 14 · row-parser fixes: leading-X at column 0, and a clause past char 400 of a flattened line ──");
{
  assert(detectSetAsideNotices("X 52.219-6 Notice of Total Small Business Set-Aside").map((h) => h.canon).join() === "sb:total", "leading 'X' at column 0 (no preceding space) = applicable");
  assert(detectSetAsideNotices("  X 52.219-6 Notice of Total Small Business Set-Aside").map((h) => h.canon).join() === "sb:total", "leading indented 'X' = applicable");
  assert(detectSetAsideNotices("x".repeat(430) + " 52.219-6 Notice of Total Small Business Set-Aside Yes").map((h) => h.canon).join() === "sb:total", "clause past char 400 of a newline-free blob still read (bounded window around the clause, not a capped line)");
}

console.log("\n── 15 · DOCUMENTED conservative MISSES (never a false conflict) — pinned; broaden via the #338 scope decision ──");
{
  // These formats currently yield [] (a conservative miss = the set-aside is simply not surfaced, same as pre-#334 —
  // NEVER a fabricated conflict). Pinned so the behavior is explicit; flip to detection only under a Brain scope ruling.
  assert(detectSetAsideNotices("Yes 52.219-3 Notice of HUBZone Set-Aside  No 52.219-6 Notice of Total Small Business Set-Aside").length === 0, "LEADING-column PACKED multi-clause line → miss (trailing-column is dominant; 'nearest' would false-positive it)");
  assert(detectSetAsideNotices("52.219-6 Notice of Total Small Business Set-Aside; see 52.219-14 Limitations on Subcontracting  Yes").length === 0, "embedded FULL clause cross-ref (52.219-14) before the cell splits the row → miss");
  assert(detectSetAsideNotices("52.252-2 Clauses Incorporated by Reference\n52.219-6 Notice of Total Small Business Set-Aside (Feb 2026)").length === 0, "52.252-2 incorporated-by-reference bare list (no Yes/No column) → miss");
}

console.log(`\n${failures === 0 ? "✅ ALL PASS" : `❌ ${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
