// RED-TEAM (redesign panel) — attack the frozen-ledger falsification. Deterministic, no network. READ-ONLY on src.
process.env.AUDIT_GATE_V2 = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
process.env.AUDIT_ELIG_BAR_PASSIVE_FRAME = "true";
import { readFileSync, readdirSync } from "fs";
(async () => {
  const g = await import("../../src/lib/audit-gate-v2");
  const dir = "scripts/audit-ai/run-records";
  const all = readdirSync(dir).filter((f) => f.endsWith(".json") && !/panel-findings-bank|panel-characterization|smoke|REMOTE_/.test(f));
  const rec = (frag: string) => JSON.parse(readFileSync(`${dir}/${all.find((x) => x.includes(frag))!}`, "utf8"));

  // ── P1: substrate census — how many banked records can even be RECOMPUTED? ──
  let haveAtt = 0, noAtt = 0, haveFrozen = 0;
  const keysets = new Map<string, number>();
  for (const f of all) {
    const r = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    const att = r?.result?.coverage?.attestations;
    const cv = r?.result?.inputs?.coverageV2;
    if (Array.isArray(att) && att.length) haveAtt++; else noAtt++;
    if (cv) { haveFrozen++; keysets.set(Object.keys(cv).sort().join(","), (keysets.get(Object.keys(cv).sort().join(",")) || 0) + 1); }
  }
  console.log(`P1 SUBSTRATE: ${all.length} records · frozen coverageV2 present ${haveFrozen} · recomputable (attestations present) ${haveAtt} · NOT recomputable ${noAtt}`);
  for (const [k, n] of [...keysets].sort((a,b)=>b[1]-a[1])) console.log(`   ${n} × keyset [${k}]`);

  // ── P2: 999e909b recompute under BOTH step-2 guard states (the posture ex-KO never ran) ──
  for (const frag of ["999e909b", "be69ce16"]) {
    const r = rec(frag);
    const att = r?.result?.coverage?.attestations ?? [];
    const frozen = r?.result?.inputs?.coverageV2;
    console.log(`\nP2 ${frag}: attestations=${att.length} · frozen disq=${frozen?.disqualifierUncovered?.length ?? "n/a"} · frozen keys=[${frozen?Object.keys(frozen).sort().join(","):"—"}]`);
    for (const guard of ["false", "true"]) {
      process.env.AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD = guard;
      const cov = g.gradeCoverageV2(att as any);
      const out = g.gateV2Outcome(cov as any);
      console.log(`   guard=${guard.padEnd(5)} disq=${String(cov.disqualifierUncovered.length).padEnd(3)} nonBar=${String((cov.ungroundedNonBarSignal||[]).length).padEnd(3)} cap=${out.cap}`);
    }
    delete process.env.AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD;
  }

  // ── P3: banner selection on be69ce16 FROZEN bucket — is index 0 the best entry? ──
  const b = rec("be69ce16")?.result?.inputs?.coverageV2?.disqualifierUncovered ?? [];
  console.log(`\nP3 be69ce16 FROZEN bucket n=${b.length}`);
  console.log(`   [0] QUOTED TO CUSTOMER: ${JSON.stringify(String(b[0]?.obligation).slice(0,110))} · imp=${g.importanceOf(b[0]?.obligation||"")} · barSignal=${g.hasBarSignal(b[0]?.obligation||"")}`);
  const better = b.map((e:any,i:number)=>({i,ob:e.obligation,imp:g.importanceOf(e.obligation),bs:g.hasBarSignal(e.obligation)})).filter((x:any)=>x.imp==="disqualifier"||x.bs);
  console.log(`   entries that OUTRANK index 0 (disqualifier-typed or bar-signal-positive): ${better.length}`);
  for (const x of better) console.log(`     [${x.i}] imp=${x.imp} bs=${x.bs} :: ${JSON.stringify(String(x.ob).slice(0,110))}`);
})();
