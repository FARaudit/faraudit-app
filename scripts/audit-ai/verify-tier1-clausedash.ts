// $0 deterministic gate for T1-11 (ASCII-dash-only clause regex misses OCR dashes).
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/verify-tier1-clausedash.ts
//
// The deterministic clause sweep matched an ASCII hyphen only, so a clause number
// typeset or OCR'd with an en/em/figure/minus/fullwidth dash (e.g. "52.219–14")
// was dropped from the completeness floor. Fix: normalize Unicode dashes to ASCII
// before the sweep; canonical ASCII-hyphen clause numbers come back.

import { extractClauseNumbers } from "@/lib/section-extractors";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { cond ? pass++ : fails.push(label); };

// en-dash (U+2013)
ok("T1-11 R1: en-dash clause '52.219–14' is captured as canonical '52.219-14'",
  extractClauseNumbers("Incorporated: 52.219–14 Limitations on Subcontracting.").includes("52.219-14"));
// em-dash (U+2014)
ok("T1-11 R2: em-dash clause '252.204—7012' captured",
  extractClauseNumbers("DFARS 252.204—7012 Safeguarding.").includes("252.204-7012"));
// minus sign (U+2212)
ok("T1-11 R3: minus-sign clause '52.212−4' captured",
  extractClauseNumbers("Clause 52.212−4 Contract Terms.").includes("52.212-4"));
// fullwidth hyphen (U+FF0D)
ok("T1-11 R4: fullwidth-hyphen clause '52.222－50' captured",
  extractClauseNumbers("52.222－50 Combating Trafficking.").includes("52.222-50"));
// ASCII regression
ok("T1-11 R5: plain ASCII clause '52.219-6' still captured (regression)",
  extractClauseNumbers("Total small business set-aside 52.219-6.").includes("52.219-6"));
// mixed doc — all three surface, deduped
const mixed = extractClauseNumbers("52.219–14 and 52.219-14 (same); also 252.225—7001; and 5352.201-9101.");
ok("T1-11 R6: mixed ASCII+en-dash of the SAME clause dedups to one canonical token", mixed.filter((c) => c === "52.219-14").length === 1);
ok("T1-11 R7: agency-supplement clause 5352.201-9101 still captured", mixed.includes("5352.201-9101"));
ok("T1-11 R8: em-dash DFARS in the mixed doc captured", mixed.includes("252.225-7001"));

console.log(`\nTier1 clause-dash (T1-11): ${pass}/${pass + fails.length} PASS`);
if (fails.length) { console.error("FAILS:\n" + fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
