// INSTRUMENT ACCEPTANCE (Brain #692 §5 · CEO full-run order step 1)
//
// Discharges the ACCEPTANCE RULE for the rebuilt instrument:
//   (a) self-validation passes (ruler 10/10 · one known-answer specimen per substrate class · guard harness)
//   (b) the two KNOWN not-measurable records are correctly stamped, and no others are silently included
//   (c) the frozen-vs-rebuilt staleness census is produced — the measurement that voided the old gate
//
// Run:  npx tsx scripts/audit-ai/_instrument-accept.ts
export {};

import { applyStampedConfig, configStamp, selfValidate, rebuildLedger, inBothGuardStates } from "./_instrument";

applyStampedConfig("live");   // MUST precede every src/lib import (module-load consts)

(async () => {
  console.log("═".repeat(112));
  console.log("INSTRUMENT ACCEPTANCE — Verdict Arc blocking unit (L40-D4 substrate parity)");
  console.log("═".repeat(112));
  console.log(configStamp());
  console.log();

  // (a) ─────────────────────────────────────────────────────────────────────────────────────────────────────
  selfValidate();

  // (b)+(c) ─────────────────────────────────────────────────────────────────────────────────────────────────
  // The rebuild itself is a ledger measurement, so it runs in BOTH guard states (D-4). `rebuildLedger` is
  // async; `inBothGuardStates` is sync — so each state is awaited separately with the flag pinned around it.
  const K = "AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD";
  const prev = process.env[K];
  process.env[K] = "false"; const off = await rebuildLedger();
  process.env[K] = "true";  const on  = await rebuildLedger();
  if (prev === undefined) delete process.env[K]; else process.env[K] = prev;

  const notMeasurable = on.filter((r) => r.measurable === "NOT MEASURABLE");
  const measurable = on.filter((r) => r.measurable === "MEASURABLE");

  console.log("── MEASURABILITY CENSUS (D-2: no silent inclusion) ──────────────────────────────────────────");
  const byClass = new Map<string, number>();
  for (const r of on) byClass.set(r.cls, (byClass.get(r.cls) ?? 0) + 1);
  for (const [c, n] of [...byClass].sort()) console.log(`  ${c.padEnd(22)} ${String(n).padStart(3)}`);
  console.log(`  ${"TOTAL".padEnd(22)} ${String(on.length).padStart(3)}   →  MEASURABLE ${measurable.length} · NOT MEASURABLE ${notMeasurable.length}`);
  console.log();
  for (const r of notMeasurable) console.log(`  ⛔ NOT MEASURABLE  ${r.id}\n       ${r.why}`);
  console.log();

  const KNOWN_NOT_MEASURABLE = 2;   // #692: "2/44 known"
  let bad = 0;
  if (notMeasurable.length !== KNOWN_NOT_MEASURABLE) {
    console.log(`❌ ACCEPTANCE (b): expected ${KNOWN_NOT_MEASURABLE} NOT MEASURABLE records, got ${notMeasurable.length}.`);
    console.log(`   A CHANGE HERE IS NOT AUTOMATICALLY A BUG — but it means the corpus substrate moved, and every`);
    console.log(`   number measured against the old count must be re-earned before it may be cited.`);
    bad++;
  } else {
    console.log(`✅ ACCEPTANCE (b): exactly ${KNOWN_NOT_MEASURABLE}/${on.length} records stamped NOT MEASURABLE, as known. None silently included.`);
  }

  // ── STALENESS CENSUS — frozen literal vs rebuilt ledger ──────────────────────────────────────────────────
  console.log();
  console.log("── STALENESS CENSUS (D-1: frozen `result.inputs.coverageV2` vs REBUILT ledger) ──────────────");
  console.log(`${"RECORD".padEnd(52)} ${"CLASS".padEnd(14)} ${"FROZEN".padStart(7)} ${"REBUILT(off)".padStart(13)} ${"REBUILT(on)".padStart(12)}  DRIFT`);
  console.log("─".repeat(112));
  const offById = new Map(off.map((r) => [r.id, r]));
  let stale = 0, guardDelta = 0;
  for (const r of measurable) {
    const o = offById.get(r.id);
    const drifted = r.frozenDisq !== r.rebuiltDisq;
    const gd = (o?.rebuiltDisq ?? -1) !== r.rebuiltDisq;
    if (drifted) stale++;
    if (gd) guardDelta++;
    const tag = drifted ? (r.frozenDisq! > r.rebuiltDisq! ? `⚠ STALE −${r.frozenDisq! - r.rebuiltDisq!}` : `⚠ STALE +${r.rebuiltDisq! - r.frozenDisq!}`) : "ok";
    console.log(`${r.id.slice(0, 52).padEnd(52)} ${r.cls.padEnd(14)} ${String(r.frozenDisq).padStart(7)} ${String(o?.rebuiltDisq ?? "?").padStart(13)} ${String(r.rebuiltDisq).padStart(12)}  ${tag}${gd ? "  ‼ GUARD-SENSITIVE" : ""}`);
  }
  console.log("─".repeat(112));
  console.log(`STALE (frozen ≠ rebuilt): ${stale}/${measurable.length} measurable records`);
  console.log(`GUARD-SENSITIVE (rebuilt differs across AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD): ${guardDelta}/${measurable.length}`);
  console.log();
  console.log("INTERPRETATION: every STALE row is a record whose frozen literal would have driven a verdict the");
  console.log("current engine does NOT produce. Any gate citation resting on those rows is void (L40-D4), which is");
  console.log("why the flag-OFF 28/28 baseline and the card-#682 false-BID headline were BOTH withdrawn.");
  console.log();
  console.log(bad ? "❌ INSTRUMENT NOT ACCEPTED" : "✅ INSTRUMENT ACCEPTED — measurements taken through it may be cited.");
  process.exit(bad ? 1 : 0);
})();
