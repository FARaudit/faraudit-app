// THE COUNTERFACTUAL, DONE PROPERLY ($0, no model). v1 of this probe supplied bare `satisfiedAttributes`
// and concluded the profile was inert. That was a PROBE defect, not an engine defect: AUDIT_PROFILE_SCHEMA_V2
// is LIVE, and under it a bare asserted string cannot clear an authoritative-only or unrecognizable
// namespace — it needs a provenance record in `attributes[]` plus an `asOf` clock. v1 also compared RAW
// token strings, missing that canonicalizeEligibilityAttr already folds "setaside:SDVOSB" → "se:sdvosb".
// This version tests three profiles so the ladder is visible.
export {};
import { applyStampedConfig, rebuildLedger, isCommittal } from "./_instrument";
applyStampedConfig("live");
(async () => {
  const dec = await import("../../src/lib/audit-decide");
  const { deriveVerdict, applyClauseKeyedTypingFloor, canonicalizeEligibilityAttr } = dec as any;
  const led = await rebuildLedger();
  const m = led.filter((r) => r.measurable === "MEASURABLE" && r.inputs);

  // ── canonicalization check: does the engine already fold the lens's free-text tokens? ──
  const asks = new Map<string, number>();
  for (const r of m) for (const f of r.inputs.findings ?? []) if (f.requiredAttribute) asks.set(f.requiredAttribute, (asks.get(f.requiredAttribute) ?? 0) + 1);
  let canon = 0, uncanon = 0;
  const uncanonTokens: Array<[string, number]> = [];
  for (const [a, n] of asks) { if (canonicalizeEligibilityAttr(a)) canon += n; else { uncanon += n; uncanonTokens.push([a, n]); } }
  console.log(`ATTRIBUTE TOKENS the findings ask for: ${asks.size} distinct`);
  console.log(`   canonicalize to the se:/sb: space : ${canon} mentions`);
  console.log(`   do NOT canonicalize               : ${uncanon} mentions`);
  console.log(`   e.g. "setaside:SDVOSB" → ${canonicalizeEligibilityAttr("setaside:SDVOSB")} · "se:sdvosb" → ${canonicalizeEligibilityAttr("se:sdvosb")}`);
  for (const [a, n] of uncanonTokens.sort((x, y) => y[1] - x[1]).slice(0, 8)) console.log(`      ${String(n).padStart(3)}×  ${a}`);

  // ── three profiles, same findings, same flags ──
  const all = [...new Set([...asks.keys(), "se:sdvosb"])];
  const asOf = "2026-07-31T00:00:00.000Z";
  const PROFILES: Array<[string, any]> = [
    ["as banked (se:sdvosb, no provenance)", undefined],
    ["bare enrichment (v1 probe — all tokens, NO attributes[])", { satisfiedAttributes: all, openWorld: true }],
    ["schema-V2 valid (all tokens + sam_api provenance + asOf)", { satisfiedAttributes: all, asOf, attributes: all.map((a) => ({ attr: a, source: "sam_api", verifiedAt: asOf })) }],
  ];
  const results: Array<[string, number, number]> = [];
  const perRecord = new Map<string, string[]>();
  for (const [label, profile] of PROFILES) {
    let commit = 0, n = 0;
    for (const r of m) {
      const base = { ...r.inputs, findings: applyClauseKeyedTypingFloor(r.inputs.findings ?? [], { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" }) };
      const inp = profile === undefined ? base : { ...base, bidderProfile: profile };
      let v = "THREW"; try { v = String(deriveVerdict(inp).verdict); } catch {}
      n++; if (isCommittal(v)) commit++;
      if (!perRecord.has(r.id)) perRecord.set(r.id, []);
      perRecord.get(r.id)!.push(v);
    }
    results.push([label, commit, n]);
  }
  console.log(`\nCOUNTERFACTUAL LADDER — identical findings, identical flags:`);
  for (const [label, c, n] of results) console.log(`   ${String(c).padStart(2)}/${n} commit (${String((100 * c / n).toFixed(1)).padStart(4)}%)  ${label}`);
  console.log(`\nrecords whose verdict MOVED between as-banked and schema-V2-valid:`);
  let moved = 0;
  for (const [id, vs] of perRecord) if (vs[0] !== vs[2]) { moved++; console.log(`   ${id.slice(0, 48).padEnd(48)} ${vs[0]} → ${vs[2]}`); }
  if (!moved) console.log("   none");
})();
