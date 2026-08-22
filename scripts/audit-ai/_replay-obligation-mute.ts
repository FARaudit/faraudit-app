// REPLAY — where does an ungrounded obligation still mute a verdict, at TODAY's code and TODAY's flags?
//
// $0. Deterministic. No model call. The substrate is the banked run records: `input.fullSource` and
// `result.coverage.attestations` are both frozen and both real, so re-running the classification stage over
// them measures the CODE, not a re-run of the audit.
//
// WHY THIS EXISTS: RESUME recorded the §L defect as "one unmatched obligation sentence mutes the whole
// verdict", diagnosed on records banked 2026-07-27. `AUDIT_COVERAGE_CAP_NOT_MUTE` has been armed since. That
// changes the question from "does an ungrounded obligation mute?" to "which KIND still mutes, and is that
// kind's classification correct?" — which is what this prints.
//
// Reads the ledger through `_instrument`'s `rebuildLedger()`, which is single-sourced to the production call
// shape (`replayCoverageStage`). It does NOT reproduce that call by hand — a second definition of the ledger
// is the divergence this file is meant to detect, not create.
export {};
import { applyStampedConfig, configStamp, rebuildLedger } from "./_instrument";
import { readFileSync } from "node:fs";

applyStampedConfig("live");

(async () => {
  const { gateV2Outcome } = await import("../../src/lib/audit-gate-v2");
  const { deriveVerdict } = await import("../../src/lib/audit-decide");
  console.log(configStamp());

  const led = await rebuildLedger();
  const measurable = led.filter((r) => r.inputs);
  console.log(`\nrecords: ${led.length} · measurable: ${measurable.length} · not measurable: ${led.length - measurable.length}\n`);

  type Row = {
    id: string; frozenVerdict: string; frozenBucket: number; rebuiltBucket: number;
    cap: string | null; kind: string | undefined; findings: number; grade: number;
    pole: string; poleReason: string;
    obligations: Array<{ section: string; obligation: string }>;
  };
  const rows: Row[] = [];

  for (const r of measurable) {
    const rec = JSON.parse(readFileSync(`scripts/audit-ai/run-records/${r.file}`, "utf8"));
    const cov = (r.inputs as any).coverageV2;
    const out = gateV2Outcome(cov, { findings: rec.result.findings });
    // THE CAP IS NOT THE VERDICT. `AUDIT_COVERAGE_CAP_NOT_MUTE` is ARMED in production and its consumer lives
    // in deriveVerdict, not here — an "uncovered_obligation" cap is RELEASED downstream (Rule 70), so reading
    // gateV2Outcome().cap alone would report a mute that production does not emit. Replay the pole.
    let pole = "(threw)", poleReason = "";
    try {
      const d = deriveVerdict({ ...(r.inputs as any), coverageV2: cov });
      pole = d.verdict; poleReason = (d.reason ?? "").slice(0, 150);
    } catch (e) { poleReason = String((e as Error).message).slice(0, 90); }
    rows.push({
      id: r.id.slice(0, 46),
      frozenVerdict: rec.result.verdict,
      frozenBucket: r.frozenDisq ?? 0,
      rebuiltBucket: r.rebuiltDisq ?? 0,
      cap: out.cap,
      kind: out.kind,
      findings: (rec.result.findings ?? []).length,
      grade: cov.coverageGrade,
      obligations: cov.disqualifierUncovered ?? [],
      pole, poleReason,
    });
  }

  // ── 1. THE MUTE, THEN AND NOW ───────────────────────────────────────────────────────────────────────
  const frozenMuted = rows.filter((r) => r.frozenBucket > 0);
  const stillCapped = rows.filter((r) => r.cap !== null);
  console.log("── 1. WHAT THE CLASSIFICATION STAGE DOES NOW ──────────────────────────────────────────");
  console.log(`records whose FROZEN bucket was non-empty : ${frozenMuted.length}`);
  console.log(`records whose REBUILT bucket is non-empty : ${rows.filter((r) => r.rebuiltBucket > 0).length}`);
  console.log(`records the gate still CAPS               : ${stillCapped.length}`);
  const byKind = new Map<string, number>();
  for (const r of stillCapped) byKind.set(r.kind ?? "(none)", (byKind.get(r.kind ?? "(none)") ?? 0) + 1);
  console.log(`caps by kind                              : ${JSON.stringify(Object.fromEntries(byKind))}`);

  const poles = new Map<string, number>();
  for (const r of rows) poles.set(r.pole, (poles.get(r.pole) ?? 0) + 1);
  const frozenPoles = new Map<string, number>();
  console.log(`\nTHE POLE deriveVerdict ACTUALLY EMITS at today's code + today's flags, all ${rows.length} records:`);
  for (const [v, n] of [...poles.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}  ${v}`);
  const released = rows.filter((r) => r.cap !== null && r.pole !== "NEEDS_HUMAN_REVIEW" && r.pole !== "INCOMPLETE");
  console.log(`\nrecords where the gate capped but the POLE is still committal (cap-not-mute released them): ${released.length}`);
  for (const r of released) console.log(`   ${r.id.slice(0, 40).padEnd(42)} cap=${r.cap} kind=${r.kind} → ${r.pole}`);

  // ── 2. BUCKET COLLAPSE PER RECORD ───────────────────────────────────────────────────────────────────
  console.log("\n── 2. PER RECORD — frozen bucket → rebuilt bucket → cap ───────────────────────────────");
  console.log(`${"record".padEnd(48)}${"froz".padStart(5)}${"rebl".padStart(6)}  ${"cap".padEnd(20)}${"kind".padEnd(24)}find  grade`);
  for (const r of rows.filter((x) => x.frozenBucket || x.rebuiltBucket || x.cap)) {
    console.log(`${r.id.padEnd(48)}${String(r.frozenBucket).padStart(5)}${String(r.rebuiltBucket).padStart(6)}  ${String(r.cap ?? "—").padEnd(20)}${String(r.kind ?? "—").padEnd(24)}${String(r.findings).padStart(4)}  ${r.grade.toFixed(3)}  → ${r.pole}`);
  }

  // ── 3. THE RESIDUAL — every obligation still in a bucket, deduped ───────────────────────────────────
  console.log("\n── 3. THE RESIDUAL BUCKET — every obligation still escalating, deduped ────────────────");
  const uniq = new Map<string, { n: number; section: string; recs: Set<string> }>();
  for (const r of rows) for (const o of r.obligations) {
    const key = o.obligation.trim().toLowerCase().slice(0, 110);
    const e = uniq.get(key) ?? { n: 0, section: o.section, recs: new Set<string>() };
    e.n++; e.recs.add(r.id.slice(0, 14)); uniq.set(key, e);
  }
  console.log(`total entries: ${rows.reduce((a, r) => a + r.obligations.length, 0)} · unique sentences: ${uniq.size}\n`);
  for (const [text, e] of [...uniq.entries()].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ×${String(e.n).padStart(2)} §${e.section.padEnd(2)} [${[...e.recs].join(",")}]`);
    console.log(`      ${JSON.stringify(text)}`);
  }
})();
