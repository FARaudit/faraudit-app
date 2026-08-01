// Chase the 63→1 delta: is the collapse FLAG-driven (a config we armed) or CODE-driven (the grader
// itself changed since bank time)? Rebuild the same records under the live stamp vs everything off.
export {};
import { applyStampedConfig, rebuildLedger } from "./_instrument";
const MODE = process.env.PROBE_MODE ?? "live";
if (MODE === "live") applyStampedConfig("live");
else for (const k of Object.keys(process.env)) if (k.startsWith("AUDIT_")) delete process.env[k];
(async () => {
  const led = await rebuildLedger();
  const m = led.filter((r) => r.measurable === "MEASURABLE");
  const watch = m.filter((r) => r.id.startsWith("FA813726R0033") || r.id.startsWith("70B01C") || r.id.startsWith("697DCK"));
  console.log(`MODE=${MODE}`);
  for (const r of watch.sort((a, b) => a.id.localeCompare(b.id))) console.log(`   ${r.id.slice(0, 52).padEnd(52)} frozen ${String(r.frozenDisq).padStart(3)} → rebuilt ${String(r.rebuiltDisq).padStart(3)}`);
  const drift = m.filter((r) => r.frozenDisq !== r.rebuiltDisq).length;
  console.log(`   drifted: ${drift}/${m.length}`);
})();
