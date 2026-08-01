// $0 — is the banked corpus DEGRADING? Two independent decay signals, no model, no network.
//  (a) SUBSTRATE decay: records that can no longer be replayed at all (NOT MEASURABLE) and why.
//  (b) LEDGER drift: the frozen disqualifier count vs what the CURRENT engine rebuilds from the same
//      attestations. A record whose frozen literal no longer matches the rebuild is a stale answer.
export {};
import { applyStampedConfig, rebuildLedger } from "./_instrument";
applyStampedConfig("live");
(async () => {
  const led = await rebuildLedger();
  const nm = led.filter((r) => r.measurable !== "MEASURABLE");
  const m = led.filter((r) => r.measurable === "MEASURABLE");
  console.log(`\nSUBSTRATE — ${led.length} banked · ${m.length} replayable · ${nm.length} NOT replayable`);
  for (const r of nm) console.log(`   ✗ ${r.id}\n       ${r.cls} — ${r.why.slice(0, 150)}`);
  const cls = new Map<string, number>();
  for (const r of m) cls.set(r.cls, (cls.get(r.cls) ?? 0) + 1);
  for (const [c, n] of [...cls].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}  ${c}`);
  const drift = m.filter((r) => r.frozenDisq !== r.rebuiltDisq);
  console.log(`\nLEDGER DRIFT — frozen literal vs current rebuild: ${drift.length}/${m.length} records disagree`);
  for (const r of drift.slice(0, 20)) console.log(`   ~ ${r.id.padEnd(56)} frozen ${r.frozenDisq} → rebuilt ${r.rebuiltDisq}`);
  if (drift.length > 20) console.log(`   … +${drift.length - 20} more`);
  const worse = drift.filter((r) => (r.rebuiltDisq ?? 0) > (r.frozenDisq ?? 0)).length;
  console.log(`   of those, ${worse} rebuilt MORE uncovered disqualifiers than frozen (engine got stricter), ${drift.length - worse} fewer.`);
})();
