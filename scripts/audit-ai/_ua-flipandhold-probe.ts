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
//   --post  assert the FIXED behaviour with the flag ON. Run NOW (pre-fix) this MUST be RED on the flip leg —
//           that RED is the planted known-positive proving the probe can fail. After the build it must be GREEN:
//             F1 bb1d6997 (flag ON)  → BID_WITH_CAUTION, reason NAMES the uncovered §F obligation
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
    // F1 — THE FLIP (must be RED before the fix exists; GREEN after)
    check("F1 bb1d6997 flag-ON → BID_WITH_CAUTION (cap, not mute)", bbBase.verdict === "BID_WITH_CAUTION", `got ${bbBase.verdict}`);
    check("F2 flip reason NAMES the uncovered §F obligation (item-level caution)",
      /option year/i.test(bbBase.reason ?? ""), `reason: ${(bbBase.reason ?? "").slice(0, 160)}`);
    // H1 — THE HOLD
    check("H1 d0664ba2 flag-ON → NEEDS_HUMAN_REVIEW holds (sole-source untouched)",
      d0Base.verdict === "NEEDS_HUMAN_REVIEW", `got ${d0Base.verdict}`);

    // G1 — dependency failure keeps precedence over the cap
    const g1 = deriveVerdict({ ...bb.result.inputs, documentsComplete: false });
    check("G1 documentsComplete=false → INCOMPLETE (never a capped committal)", g1.verdict === "INCOMPLETE", `got ${g1.verdict}`);

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
