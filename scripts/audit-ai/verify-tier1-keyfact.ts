// $0 deterministic gate for T1-9 (false NMR fire on a services set-aside).
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/verify-tier1-keyfact.ts
//
// supplyCtx keyed partly on the "nonmanufacturer" token — which is satisfied by
// the TITLE of clause 52.219-33 itself. So a SERVICES set-aside that merely lists
// 52.219-33 in a clause matrix fired supplyCtx circularly and produced a FALSE NMR
// eligibility bar. Fix: supplyCtx keys on genuine supply signals only (mfg/whlsl/
// retail NAICS, "schedule of supplies", "manufactured"). Genuine supply NMR still fires.

import { applyKeyfactDetector } from "@/lib/audit-keyfact-detector";
import type { TypedFinding } from "@/lib/audit-findings";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { cond ? pass++ : fails.push(label); };

const run = (src: string, enabled = true) => applyKeyfactDetector([] as TypedFinding[], src, { enabled });
const hasNmrBar = (fs: TypedFinding[]) => fs.some((f) => f.kind === "eligibility_bar" && f.requiredAttribute === "nonmanufacturer:compliant");

// (1) SERVICES set-aside listing the clause, NO supply NAICS → must NOT fire.
const services = "This SDVOSB set-aside is for base operations support services. NAICS 561210. " +
  "The clause matrix incorporates 52.219-33 Nonmanufacturer Rule by reference along with dozens of others.";
ok("T1-9 R1: services set-aside merely listing 52.219-33 → NO false NMR eligibility bar", !hasNmrBar(run(services)));

// (2) GENUINE supply set-aside (manufacturing NAICS 33xxxx) → must still fire.
const supplyNaics = "Small business set-aside. NAICS 335931 for the manufacture of connectors. " +
  "Clause 52.219-33 Nonmanufacturer Rule applies to this supply acquisition.";
ok("T1-9 R2: real supply set-aside (mfg NAICS) → NMR eligibility bar STILL fires", hasNmrBar(run(supplyNaics)));

// (3) "schedule of supplies" supply signal + set-aside → still fires.
const scheduleSupplies = "This is a total small business set-aside. See the schedule of supplies below. " +
  "52.219-33 Nonmanufacturer Rule is incorporated.";
ok("T1-9 R3: 'schedule of supplies' supply signal → NMR bar STILL fires", hasNmrBar(run(scheduleSupplies)));

// (4) Services buy with NO supply signal at all and NO clause → nothing.
ok("T1-9 R4: services set-aside with no supply signal and no clause → no NMR bar",
  !hasNmrBar(run("HUBZone set-aside for janitorial services. NAICS 561720.")));

// (5) Flag OFF → byte-identical (no findings added) even with supply+set-aside.
ok("T1-9 R5: flag OFF → byte-identical (no NMR bar injected)", !hasNmrBar(run(supplyNaics, false)) && run(supplyNaics, false).length === 0);

console.log(`\nTier1 keyfact (T1-9): ${pass}/${pass + fails.length} PASS`);
if (fails.length) { console.error("FAILS:\n" + fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
