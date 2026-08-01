// The capture seat claims branch 2 ("LIVE — still attendable") is a WINDOWING ARTIFACT: that both branch-2
// records are the same solicitation whose visit had already concluded, so the corpus contains ZERO genuine
// live site visits and my design's evidence table contradicts its own source. Verify independently.
export {};
import { readFileSync } from "node:fs";
import { applyStampedConfig, rebuildLedger } from "./_instrument";
applyStampedConfig("live");
const LIVE = /site visit \/ pre-proposal conference stated in the SAM notice body — attendance gates/;
const CONCLUDED_MARKER = /site\s+visit\s+was\s+(held|concluded)|was\s+held\s+and\s+concluded/i;
(async () => {
  const { applyClauseKeyedTypingFloor } = await import("../../src/lib/audit-decide") as any;
  const led = await rebuildLedger();
  const m = led.filter((r) => r.measurable === "MEASURABLE" && r.inputs);
  for (const r of m) {
    const inp = { ...r.inputs, findings: applyClauseKeyedTypingFloor(r.inputs.findings ?? [], { enabled: process.env.AUDIT_CLAUSE_TYPING_FLOOR === "true" }) };
    const live = (inp.findings ?? []).filter((f: any) => LIVE.test(String(f.requirement ?? "")));
    if (!live.length) continue;
    let sol = r.id.split(".")[0];
    try { sol = JSON.parse(readFileSync(`scripts/audit-ai/run-records/${r.file}`, "utf8"))?.meta?.sol || sol; } catch {}
    const src = String(r.inputs.source ?? "");
    const cm = [...src.matchAll(new RegExp(CONCLUDED_MARKER.source, "gi"))];
    console.log(`\nRECORD ${r.id}`);
    console.log(`   solicitation           : ${sol}`);
    console.log(`   branch-2 findings      : ${live.length}`);
    console.log(`   excerpt                : "${String(live[0].excerpt ?? "").replace(/\s+/g, " ").slice(0, 130)}"`);
    console.log(`   CONCLUDED marker in the SAME source? ${cm.length ? `YES — ${cm.length} match(es)` : "no"}`);
    for (const c of cm.slice(0, 2)) {
      const i = c.index ?? 0;
      console.log(`      …${src.slice(Math.max(0, i - 90), i + 130).replace(/\s+/g, " ")}…`);
    }
  }
})();
