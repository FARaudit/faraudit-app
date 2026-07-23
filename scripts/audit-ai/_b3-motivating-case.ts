export {};
import { applyStampedConfig, rebuildLedger } from "./_instrument";
import { readFileSync } from "fs";
applyStampedConfig("live");
(async () => {
  const led = await rebuildLedger();
  for (const frag of ["be69ce16","bd605b88","dad686d4","64b79916"]) {
    const r = led.find(x=>x.id.includes(frag)); if(!r?.inputs) continue;
    const rec = JSON.parse(readFileSync(`scripts/audit-ai/run-records/${r.file}`,"utf8"));
    const frozen = rec.result.inputs.coverageV2?.disqualifierUncovered ?? [];
    const now = r.inputs.coverageV2.disqualifierUncovered;
    console.log(`\n▸ ${frag}  FROZEN bucket=${frozen.length}  →  REBUILT bucket=${now.length}`);
    console.log(`   frozen[0]:  ${JSON.stringify((frozen[0]?.obligation||"").slice(0,105))}`);
    for (const e of now) console.log(`   rebuilt:    §${e.section} ${JSON.stringify(e.obligation.slice(0,105))}`);
    const bg = frozen.filter((e:any)=>/bid guarantee|bid bond/i.test(e.obligation||""));
    console.log(`   frozen entries mentioning a bid guarantee: ${bg.length}`);
  }
})();
