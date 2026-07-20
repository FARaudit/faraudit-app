import { gradeCoverageV2, verifyRecitalInSource } from "../../src/lib/audit-gate-v2";
const att = (ob: string) => ({ section: "L", status: "obligations_ungrounded", obligations: [ob], citedFindingIds: [], ungrounded: [ob] } as any);
let fails = 0;
const run = (label: string, ob: string, source: string, wantCaveat: boolean) => {
  const cov: any = gradeCoverageV2([att(ob)], { verifyRecitalPresence: (o: string) => verifyRecitalInSource(source, o) });
  const caveat = (cov.caveatRecital ?? []).length > 0;
  const disq = cov.disqualifierUncovered.length > 0;
  const ok = caveat === wantCaveat && disq === !wantCaveat;
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌ FAIL"} [${wantCaveat ? "CAVEAT" : "ESCALATE"}] ${label}  (caveat=${caveat} disq=${disq})`);
};
// baseline: LBJ still demotes (in-source, benign tail)
run("LBJ production fragment (must still DEMOTE)", "Maintain licensing requirements, certifications, accreditations, and the required insurance", "SOW. Maintain licensing requirements, certifications, accreditations, and the required insurance coverage during the entire performance period with proof to the CO. Next.", true);
// F1: paraphrased/unlocatable → present=false → escalate
run("F1 paraphrased obligation NOT in source (fail-closed)", "must maintain general liability insurance during the performance period", "The contractor shall maintain commercial general liability insurance during the performance period and shall possess a facility security clearance at the time of award.", false);
// F3: bonding/surety in the severed tail → recitalTailVeto → escalate
run("F3 bonding/surety in severed tail", "The contractor shall maintain the required insurance", "The contractor shall maintain the required insurance and shall maintain bonding capacity of $5,000,000 with a Treasury-listed surety during performance.", false);
// F4 compound: OEM distributor rides insurance
run("F4 compound insurance + OEM distributor", "maintain product liability insurance and its status as an authorized OEM distributor for Caterpillar during the entire period of performance", "SOW. maintain product liability insurance and its status as an authorized OEM distributor for Caterpillar during the entire period of performance.", false);
// F4 at-contract-award
run("F4 insurance + hold license AT CONTRACT AWARD", "maintain workers' compensation insurance during performance and shall hold a state contractor license at contract award", "SOW. maintain workers' compensation insurance during performance and shall hold a state contractor license at contract award.", false);
// F5 DEA registration
run("F5 DEA registration (scarce, not SAM)", "shall maintain an active registration with the Drug Enforcement Administration during the performance period", "SOW. shall maintain an active registration with the Drug Enforcement Administration during the performance period.", false);
// F5 export licensing
run("F5 export licensing under EAR", "maintain all export licensing requirements under the Export Administration Regulations during performance", "SOW. maintain all export licensing requirements under the Export Administration Regulations during performance.", false);
console.log(`\n${fails === 0 ? "🟢 DRY — all 6 Gauntlet findings CLOSED (LBJ still demotes; every confirmed leak escalates)" : `🔴 ${fails} FAILURE(S)`}`);
process.exit(fails === 0 ? 0 : 1);
