// CLAIM 3 UNDER TEST: "add the two firm-fact questions to the profile — converts the largest mute class
// from unanswerable to answered, and needs NO engine change." If true, a profile asserting attendance and
// vehicle-holding must move the nine site-visit records. Executed, not reasoned.
export {};
import { applyStampedConfig, rebuildLedger } from "./_instrument";
applyStampedConfig("live");
(async () => {
  const { deriveVerdict, applyClauseKeyedTypingFloor } = await import("../../src/lib/audit-decide") as any;
  const led = await rebuildLedger();
  const m = led.filter((r) => r.measurable === "MEASURABLE" && r.inputs);
  const asOf = "2026-07-31T00:00:00.000Z";
  // Every plausible spelling a product form could store the two answers under.
  const attrs = ["site_visit:attended", "attendance:site-visit-attended", "sitevisit:attended",
    "contract:MAC-BOA-holder", "MAC_BOA_holder: existing Basic Ordering Agreement holder under this MAC vehicle",
    "vehicle:MAC-BOA-holder", "vehicle_holder:true"];
  const answered = { satisfiedAttributes: attrs, asOf, attributes: attrs.map((a) => ({ attr: a, source: "verified_import", verifiedAt: asOf })) };
  let n = 0, moved = 0, reachable = 0, unreachable = 0;
  for (const r of m) {
    const base = { ...r.inputs, findings: applyClauseKeyedTypingFloor(r.inputs.findings ?? [], { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" }) };
    let a: any, b: any;
    try { a = deriveVerdict(base); b = deriveVerdict({ ...base, bidderProfile: answered }); } catch { continue; }
    const sv = (a.showStoppers ?? []).filter((s: any) => /site visit|holders only|BOA/i.test(String(s.requirement)));
    if (!sv.length) continue;
    n++;
    for (const s of sv) { if (s.requiredAttribute) reachable++; else unreachable++; }
    if (a.verdict !== b.verdict) { moved++; console.log(`   MOVED ${r.id.slice(0, 44)} ${a.verdict} → ${b.verdict}`); }
  }
  console.log(`\nrecords carrying a site-visit / vehicle-holder bar: ${n}`);
  console.log(`   those bars: ${reachable} carry a requiredAttribute (profile CAN reach) · ${unreachable} do NOT`);
  console.log(`   verdicts moved by answering both questions in the profile: ${moved}/${n}`);
  console.log(moved === 0
    ? "\n   ⇒ CLAIM 3 FALSIFIED. firmStatus returns \"unknown\" on its first line for any finding without a\n     requiredAttribute, so the answer is unreachable no matter how it is stored. Collecting the answer\n     is necessary but NOT sufficient — the notice-bar path must also emit an attribute to match on.\n     \"needs no engine change\" is wrong."
    : "\n   ⇒ claim 3 holds for the moved records.");
})();
