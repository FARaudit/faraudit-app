// STEP 5 — P1-2 REGISTRATION-FAMILY RECONCILIATION on the REBUILT instrument (ARM-CARD ITEM 2).
//
// REGISTERED PROCEDURE: (1) replay the banked corpus with the retirement APPLIED, (2) enumerate every verdict
// flip attributable to the registration family — itemized, no aggregate counts, (3) spot-check each flip is
// defensibly correct under v2's classification, (4) NO SILENT ABSORPTION — an unexplained flip is a blocker.
//
// ⚠ KNOWN HAZARD, EXPLICITLY HONOURED: "the reconciliation must be run against the ACTUAL landing order, not a
// hypothetical one." The registered ruling was written when RETIREMENT was the expected landing ("v1's
// registration classification retires WITH the veto"). Under the Option (C) ruling the veto does **NOT** retire —
// it NARROWS. So the actual landing order is measured FIRST, and the retirement scenario is reported separately
// as the hypothetical it now is.
export {};
import { applyStampedConfig, rebuildLedger, configStamp } from "./_instrument";
applyStampedConfig("live");

// Registration family: SAM / System for Award Management registration duties and their classification.
const REGISTRATION_RE = /\bregistr(?:ation|ations|ered|er)\b|\bsystem\s+for\s+award\s+management\b|\bsam\.gov\b|\bSAM\b/;

(async () => {
  const { deriveVerdict, applyClauseKeyedTypingFloor } = await import("../../src/lib/audit-decide");
  const set = (o: Record<string, string>) => { for (const [k, v] of Object.entries(o)) process.env[k] = v; };
  const run = (inp: any, cfg: Record<string, string>) => {
    const prev: Array<[string, string | undefined]> = Object.keys(cfg).map((k) => [k, process.env[k]]);
    set(cfg);
    try { return deriveVerdict(inp); } finally { for (const [k, v] of prev) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
  };

  const BASELINE = { AUDIT_VETO_NARROW_UNIVERSAL: "false", AUDIT_RETIRE_VERBATIM_VETO: "false" };  // today's production
  const LANDING  = { AUDIT_VETO_NARROW_UNIVERSAL: "true",  AUDIT_RETIRE_VERBATIM_VETO: "false" };  // Option (C) — ACTUAL
  const HYPO     = { AUDIT_VETO_NARROW_UNIVERSAL: "false", AUDIT_RETIRE_VERBATIM_VETO: "true"  };  // the registered ruling's premise

  const led = await rebuildLedger();
  console.log("═".repeat(120));
  console.log("STEP 5 — P1-2 REGISTRATION-FAMILY RECONCILIATION (rebuilt instrument)");
  console.log("═".repeat(120));
  console.log(configStamp().split("\n")[0]);

  const rows: any[] = [];
  for (const r of led) {
    if (r.measurable === "NOT MEASURABLE" || !r.inputs) continue;
    const inp = { ...r.inputs, findings: applyClauseKeyedTypingFloor(r.inputs.findings ?? [], { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" }) };
    let base: any, land: any, hypo: any;
    try { base = run(inp, BASELINE); land = run(inp, LANDING); hypo = run(inp, HYPO); }
    catch (e) { console.log(`  THREW ${r.id}: ${e}`); continue; }
    const bucket = (r.inputs.coverageV2?.disqualifierUncovered ?? []) as Array<{ section: string; obligation: string }>;
    const regEntries = bucket.filter((d) => REGISTRATION_RE.test(d.obligation));
    rows.push({ id: r.id, base: base.verdict, land: land.verdict, hypo: hypo.verdict, bucket, regEntries,
                landFlip: base.verdict !== land.verdict, hypoFlip: base.verdict !== hypo.verdict, landReason: land.reason });
  }

  // ── (1)+(2) ACTUAL LANDING ORDER ──
  const landFlips = rows.filter((r) => r.landFlip);
  console.log(`\n── ACTUAL LANDING ORDER (Option C: narrow ON · veto NOT retired) ────────────────────────────`);
  console.log(`records replayed: ${rows.length} · VERDICT FLIPS vs today's production: ${landFlips.length}\n`);
  if (!landFlips.length) console.log("  (none)");
  for (const f of landFlips) {
    const attributable = f.regEntries.length > 0;
    console.log(`  ▸ ${f.id}`);
    console.log(`      ${f.base}  →  ${f.land}`);
    console.log(`      registration-family entries in its bucket: ${f.regEntries.length}${attributable ? "" : "  ⇒ NOT attributable to the registration family"}`);
    for (const e of f.bucket) console.log(`         · §${e.section} ${REGISTRATION_RE.test(e.obligation) ? "[REG] " : ""}${e.obligation.slice(0, 96)}`);
    console.log(`      landing reason: ${String(f.landReason).slice(0, 150)}`);
  }

  // ── (2) registration-family census: every record whose bucket carries a registration entry ──
  const regRecords = rows.filter((r) => r.regEntries.length > 0);
  console.log(`\n── REGISTRATION-FAMILY CENSUS (itemized — every record carrying a registration entry) ──────`);
  console.log(`records: ${regRecords.length}\n`);
  for (const r of regRecords) {
    console.log(`  ▸ ${r.id}   base=${r.base}  landing=${r.land}  ${r.landFlip ? "⚠ FLIPPED" : "unchanged"}`);
    for (const e of r.regEntries) console.log(`         · §${e.section} ${e.obligation.slice(0, 100)}`);
  }

  // ── the registered ruling's premise, now hypothetical ──
  const hypoFlips = rows.filter((r) => r.hypoFlip);
  console.log(`\n── HYPOTHETICAL (the registered ruling's premise: veto RETIRED) ─────────────────────────────`);
  console.log(`flips under retirement: ${hypoFlips.length} — reported for completeness; retirement is NOT landing under Option (C).`);
  for (const f of hypoFlips) console.log(`  · ${f.id}: ${f.base} → ${f.hypo}`);

  // ── (4) NO SILENT ABSORPTION ──
  const unexplained = landFlips.filter((f) => f.regEntries.length === 0 && f.bucket.length === 0);
  console.log(`\n${"═".repeat(120)}`);
  console.log(`UNEXPLAINED FLIPS (blocker if > 0): ${unexplained.length}`);
  for (const u of unexplained) console.log(`  ❌ ${u.id}: ${u.base} → ${u.land} with an EMPTY bucket — cannot be attributed`);
  process.exit(unexplained.length ? 1 : 0);
})();
