// FALSIFICATION of my own recommendation. I claimed the concluded-site-visit mute is Rule 70 case (c)
// misapplied, because whether attendance GATED AWARD is stated in the solicitation and whether the visit
// CONCLUDED is a date the engine holds. That is only true if the source text actually says so. Read it.
export {};
import { applyStampedConfig, rebuildLedger } from "./_instrument";
applyStampedConfig("live");
(async () => {
  const { deriveVerdict, applyClauseKeyedTypingFloor } = await import("../../src/lib/audit-decide") as any;
  const led = await rebuildLedger();
  const m = led.filter((r) => r.measurable === "MEASURABLE" && r.inputs);
  let n = 0;
  for (const r of m) {
    const inp = { ...r.inputs, findings: applyClauseKeyedTypingFloor(r.inputs.findings ?? [], { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" }) };
    let d: any; try { d = deriveVerdict(inp); } catch { continue; }
    const sv = (d.showStoppers ?? []).filter((s: any) => /site visit/i.test(String(s.requirement)));
    if (!sv.length) continue;
    n++;
    console.log(`\n${"═".repeat(100)}\n${r.id}   verdict=${d.verdict}`);
    for (const s of sv) {
      console.log(`  BAR        : ${String(s.requirement).slice(0, 150)}`);
      console.log(`  attr       : ${s.requiredAttribute ?? "(none)"}   controllability=${s.controllability ?? "?"}  kind=${s.kind ?? "?"}`);
      console.log(`  EXCERPT    : ${String(s.excerpt ?? "(none)").replace(/\s+/g, " ").slice(0, 300)}`);
    }
    // What does the SOURCE actually say around every site-visit mention?
    const src: string = String(r.inputs.source ?? "");
    const hits = [...src.matchAll(/site\s+visit/gi)].slice(0, 4);
    console.log(`  source mentions of "site visit": ${[...src.matchAll(/site\s+visit/gi)].length}`);
    for (const h of hits) {
      const i = h.index ?? 0;
      console.log(`    …${src.slice(Math.max(0, i - 260), i + 300).replace(/\s+/g, " ")}…`);
    }
  }
  console.log(`\nrecords carrying a site-visit show-stopper: ${n}`);
})();
