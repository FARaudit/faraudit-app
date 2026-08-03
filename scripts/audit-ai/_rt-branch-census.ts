// RED-TEAM: the design's evidence table reports branch counts as FINDINGS. Re-count by SOLICITATION.
export {};
import { readFileSync } from "node:fs";
import { applyStampedConfig, rebuildLedger } from "./_instrument";
applyStampedConfig("live");
const B1 = /site visit stated in the SAM notice body was held\/concluded/i;
const B2 = /site visit \/ pre-proposal conference stated in the SAM notice body — attendance gates/i;
const B3 = /Security\/facility clearance stated as an eligibility bar/i;
const B4 = /^Eligibility bar stated in the SAM notice body/i;
const B5 = /Order restricted to vehicle HOLDERS ONLY/i;
(async () => {
  const led = await rebuildLedger();
  const rows = led.filter((r: any) => r.measurable === "MEASURABLE" && r.inputs);
  const tally: Record<string, { f: number; sols: Set<string>; recs: number }> = {};
  for (const k of ["b1", "b2", "b3", "b4", "b5"]) tally[k] = { f: 0, sols: new Set(), recs: 0 };
  for (const r of rows) {
    let sol = r.id.split(".")[0];
    try { sol = JSON.parse(readFileSync(`scripts/audit-ai/run-records/${r.file}`, "utf8"))?.meta?.sol || sol; } catch {}
    const fs = (r.inputs.findings ?? []) as any[];
    const seen = new Set<string>();
    for (const f of fs) {
      const req = String(f.requirement ?? "");
      const k = B1.test(req) ? "b1" : B2.test(req) ? "b2" : B3.test(req) ? "b3" : B5.test(req) ? "b5" : B4.test(req) ? "b4" : null;
      if (!k) continue;
      tally[k].f++; tally[k].sols.add(sol);
      if (!seen.has(k)) { tally[k].recs++; seen.add(k); }
    }
  }
  console.log(`\nmeasurable records: ${rows.length}`);
  console.log(`branch  findings  records  DISTINCT SOLICITATIONS`);
  for (const [k, v] of Object.entries(tally))
    console.log(`  ${k}      ${String(v.f).padStart(4)}     ${String(v.recs).padStart(4)}     ${v.sols.size}  ${[...v.sols].join(", ") || "—"}`);
})();
