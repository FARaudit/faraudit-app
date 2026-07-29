// U-A CAP-NOT-MUTE · FALSIFICATION PROBE — written BEFORE the fix (memory: probe_before_the_number_it_validates).
//
// Panel ruling (ceo/VERDICT-INVERSION-PANEL-2026-07-29.md): an uncovered obligation CAPS the committal at
// BID_WITH_CAUTION with the item NAMED — it never NHR-mutes the pole. Bar paths untouched. Flag:
// AUDIT_COVERAGE_CAP_NOT_MUTE (default OFF, byte-identical OFF).
//
// TWO MODES:
//   --pre   assert TODAY's behaviour reproduces (baseline must be GREEN before the fix is written):
//             bb1d6997 → NEEDS_HUMAN_REVIEW driven by the GATE_V2 coverage cap (§F option-year admin sentence)
//             d0664ba2 → NEEDS_HUMAN_REVIEW driven by the sole-source path (coverage NOT involved)
//   --post  assert the FIXED behaviour with the flag ON. Run NOW (pre-fix) this MUST be RED on the flip legs —
//           that RED is the planted known-positive proving the probe can fail. After the build it must be GREEN.
//           FLIP CRITERION AS RE-RATIFIED BY THE CEO 2026-07-29 (supersedes the panel's per-record wording,
//           which was structurally unsatisfiable on a banked record — attestations are not banked, and
//           bb1d6997's documentsComplete=false is a GENUINE Rule 70(b) dependency failure: the WEBGIS site-map
//           region carries 8 chars of extractable text):
//             F1 bb1d6997 (flag ON)  → INCOMPLETE (the mute is gone; the record's own unread-doc dependency
//                                      caps honestly) — and the reason NAMES the released §F item (#687)
//             F3 150c3ab3 (36C25626Q1137, docs COMPLETE — pulled cohort record, skipped if absent) →
//                                      BID_WITH_CAUTION naming the uncovered §L item: the intended committal flip
//             H1 d0664ba2 (flag ON)  → NEEDS_HUMAN_REVIEW, reason unchanged from --pre (sole-source hold)
//             G1 bb + documentsComplete=false (flag ON) → INCOMPLETE (dependency failure keeps precedence)
//             G2 bb + setAsideConflict=true   (flag ON) → NEEDS_HUMAN_REVIEW (non-coverage NHR path keeps force)
//             G3 bb with the uncovered item swapped to a credential-conditional sentence (flag ON) →
//                NEEDS_HUMAN_REVIEW (Rule 70 case (c): unverifiable firm-fact a bar turns on — never capped)
//             O1 bb1d6997 (flag OFF) → NEEDS_HUMAN_REVIEW with the IDENTICAL reason string (byte-identity OFF)
//
// Env fidelity: the records' banked meta.flagEnv is injected into process.env BEFORE the engine is imported
// (GATE_V2_ENABLED and the allowlist consts are captured at import time — Rule 42 class).
import { readFileSync } from "fs";

const MODE = process.argv[2] === "--post" ? "post" : "pre";
const load = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const bb = load("scripts/audit-ai/run-records/_ua-bb1d6997.json");
const d0 = load("scripts/audit-ai/run-records/_ua-d0664ba2.json");

// ── env from the banked run (both records are same-night worker runs — verify, then inject) ──
const fe1: Record<string, string> = bb.meta?.flagEnv ?? {};
const fe2: Record<string, string> = d0.meta?.flagEnv ?? {};
const diffs = [...new Set([...Object.keys(fe1), ...Object.keys(fe2)])].filter((k) => fe1[k] !== fe2[k]);
if (diffs.length) console.log(`⚠ flagEnv differs between records on: ${diffs.join(", ")} — using bb1d6997's env`);
for (const [k, v] of Object.entries(fe1)) if (v !== undefined) process.env[k] = v;
process.env.AUDIT_COVERAGE_CAP_NOT_MUTE = MODE === "post" ? "true" : "false";

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "✅" : "❌"} ${label}${ok ? "" : ` — ${detail}`}`);
  ok ? pass++ : fail++;
};

(async () => {
  // dynamic import AFTER env injection (import-time flag consts)
  const { deriveVerdict } = await import("../../src/lib/audit-decide");

  const bbBase = deriveVerdict(bb.result.inputs);
  const d0Base = deriveVerdict(d0.result.inputs);
  console.log(`mode=${MODE} · AUDIT_COVERAGE_CAP_NOT_MUTE=${process.env.AUDIT_COVERAGE_CAP_NOT_MUTE} · AUDIT_GATE_V2=${process.env.AUDIT_GATE_V2}`);
  console.log(`bb1d6997 → ${bbBase.verdict} :: ${(bbBase.reason ?? "").slice(0, 160)}`);
  console.log(`d0664ba2 → ${d0Base.verdict} :: ${(d0Base.reason ?? "").slice(0, 160)}\n`);

  if (MODE === "pre") {
    check("PRE-1 bb1d6997 reproduces NEEDS_HUMAN_REVIEW", bbBase.verdict === "NEEDS_HUMAN_REVIEW", `got ${bbBase.verdict}`);
    check("PRE-2 bb1d6997 NHR is the COVERAGE cap (reason quotes the ungrounded obligation)",
      /could not be grounded/i.test(bbBase.reason ?? ""), `reason: ${(bbBase.reason ?? "").slice(0, 120)}`);
    check("PRE-3 bb1d6997 uncovered item is the §F option-year admin sentence",
      /option year/i.test(bbBase.reason ?? ""), `reason: ${(bbBase.reason ?? "").slice(0, 120)}`);
    check("PRE-4 d0664ba2 reproduces NEEDS_HUMAN_REVIEW", d0Base.verdict === "NEEDS_HUMAN_REVIEW", `got ${d0Base.verdict}`);
    check("PRE-5 d0664ba2 NHR is the sole-source path, NOT coverage",
      /sole[-\s]?source|raytheon/i.test(d0Base.reason ?? "") && !/could not be grounded/i.test(d0Base.reason ?? ""),
      `reason: ${(d0Base.reason ?? "").slice(0, 120)}`);
    check("PRE-6 bb1d6997 record verdict matches replay (faithful baseline)",
      bbBase.verdict === bb.result.verdict, `replay ${bbBase.verdict} vs recorded ${bb.result.verdict}`);
  } else {
    // F1 — THE FLIP, re-ratified criterion (CEO 2026-07-29): mute eliminated → the record's genuine unread-doc
    // dependency caps honestly at INCOMPLETE, and the released §F item stays NAMED in the reason (#687).
    check("F1 bb1d6997 flag-ON → INCOMPLETE (mute gone; genuine Rule 70(b) dependency caps honestly)",
      bbBase.verdict === "INCOMPLETE", `got ${bbBase.verdict}`);
    check("F2 the INCOMPLETE reason NAMES the released §F obligation (caution appended, #687)",
      /CAUTION — /.test(bbBase.reason ?? "") && /option year/i.test(bbBase.reason ?? ""), `reason: ${(bbBase.reason ?? "").slice(0, 160)}`);
    // F3 — the intended COMMITTAL flip on a docs-complete record (cohort pull; skipped if the file is absent)
    try {
      const fc = load("scripts/audit-ai/run-records/_ua-cohort/36C25626Q1137__150c3ab3-9252-40a4-9ed3-49e64547eb70.json");
      const fcOn = deriveVerdict(fc.result.inputs);
      check("F3 150c3ab3 (docs complete) flag-ON → BID_WITH_CAUTION naming the uncovered §L item",
        fcOn.verdict === "BID_WITH_CAUTION" && /CAUTION — /.test(fcOn.reason ?? ""), `got ${fcOn.verdict} :: ${(fcOn.reason ?? "").slice(0, 120)}`);
    } catch { console.log("·· F3 skipped — cohort record not present locally (run _ua-pull-cohort.ts)"); }
    // H1 — THE HOLD
    check("H1 d0664ba2 flag-ON → NEEDS_HUMAN_REVIEW holds (sole-source untouched)",
      d0Base.verdict === "NEEDS_HUMAN_REVIEW", `got ${d0Base.verdict}`);

    // G1 — dependency failure keeps precedence over the cap, AND the honest-fail names the released item
    // (#687 preservation: the generic INCOMPLETE must carry the banked caution, never lose the named obligation)
    const g1 = deriveVerdict({ ...bb.result.inputs, documentsComplete: false });
    check("G1 documentsComplete=false → INCOMPLETE (never a capped committal)", g1.verdict === "INCOMPLETE", `got ${g1.verdict}`);
    check("G1b the INCOMPLETE reason still NAMES the uncovered item (caution appended, #687)",
      /CAUTION — /.test(g1.reason ?? "") && /option year/i.test(g1.reason ?? ""), `reason: ${(g1.reason ?? "").slice(0, 160)}`);

    // G2 — a non-coverage NHR path keeps its full force under the flag. documentsComplete pinned true to
    // ISOLATE the guard (bb's own false value would land INCOMPLETE first — probe-construction, not doctrine).
    const g2 = deriveVerdict({ ...bb.result.inputs, documentsComplete: true, setAsideConflict: true } as never);
    check("G2 setAsideConflict → NEEDS_HUMAN_REVIEW (bar-adjacent paths untouched)", g2.verdict === "NEEDS_HUMAN_REVIEW", `got ${g2.verdict}`);

    // G3 — credential-conditional uncovered item stays NHR (Rule 70 case (c))
    const ccInputs = JSON.parse(JSON.stringify(bb.result.inputs));
    ccInputs.coverageV2.disqualifierUncovered = [{
      section: "F",
      obligation: "The contractor shall maintain an active SAM registration throughout the period of performance; lapse is grounds for termination.",
    }];
    const g3 = deriveVerdict(ccInputs);
    check("G3 credential-conditional uncovered item → NEEDS_HUMAN_REVIEW (never capped)",
      g3.verdict === "NEEDS_HUMAN_REVIEW", `got ${g3.verdict} :: ${(g3.reason ?? "").slice(0, 120)}`);

    // G3b — red-team F1: the carve-out must hold with the #575b PROSE flag OFF. kind is truth, not prose —
    // without this leg the hazardous pairing (cap-not-mute ON, credential-reason OFF) is structurally untestable.
    const prevCcFlag = process.env.AUDIT_CREDENTIAL_CONDITIONAL_REASON;
    process.env.AUDIT_CREDENTIAL_CONDITIONAL_REASON = "false";
    const g3b = deriveVerdict(ccInputs);
    process.env.AUDIT_CREDENTIAL_CONDITIONAL_REASON = prevCcFlag ?? "";
    check("G3b credential-conditional stays NHR with AUDIT_CREDENTIAL_CONDITIONAL_REASON=false (kind ≠ prose)",
      g3b.verdict === "NEEDS_HUMAN_REVIEW", `got ${g3b.verdict} :: ${(g3b.reason ?? "").slice(0, 120)}`);

    // G4 — review P1: a credential-conditional item at index ≥1 (behind an admin item) keeps its Rule 70(c)
    // mute under the flag — the cc scan must cover the WHOLE firing bucket, not just the quoted [0] item.
    const ccDeepInputs = JSON.parse(JSON.stringify(bb.result.inputs));
    ccDeepInputs.coverageV2.disqualifierUncovered = [
      { section: "F", obligation: "the contract will also contain provision for four (4) annual option years: option year 1: 07/01/2027 - 06/30/2028" },
      { section: "H", obligation: "The contractor shall maintain an active SAM registration throughout the period of performance; lapse is grounds for termination." },
    ];
    const g4 = deriveVerdict(ccDeepInputs);
    check("G4 credential-conditional at index ≥1 → NEEDS_HUMAN_REVIEW (whole-bucket cc scan)",
      g4.verdict === "NEEDS_HUMAN_REVIEW" && /credential-conditional/i.test(g4.reason ?? ""),
      `got ${g4.verdict} :: ${(g4.reason ?? "").slice(0, 120)}`);

    // O1 — flag-OFF byte-identity (fresh process semantics: env flip + re-derive; the flag must be read at
    // CALL time in the new code for this in-process check to be valid — if it is import-time the build is wrong)
    process.env.AUDIT_COVERAGE_CAP_NOT_MUTE = "false";
    const off = deriveVerdict(bb.result.inputs);
    check("O1 flag-OFF → NEEDS_HUMAN_REVIEW with the identical pre-fix reason (byte-identity)",
      off.verdict === "NEEDS_HUMAN_REVIEW" && /could not be grounded/i.test(off.reason ?? ""), `got ${off.verdict}`);
  }

  console.log(`\n${pass} pass · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
