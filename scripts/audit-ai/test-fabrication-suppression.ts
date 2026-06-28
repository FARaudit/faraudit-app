// $0 gate for graduation Fix (b) — fabrication-suppression (Brain card 40 · Rule 64).
// A clause cite not literally in source must be stripped before it can propagate/score. #2 raised
// FAR 52.219-14 (inferred from the Total-SB set-aside) — absent from source. Locks the suppression +
// the no-false-strip property (a clause that IS in source stays).  npx tsx scripts/audit-ai/test-fabrication-suppression.ts
import { makeClauseSourceChecker, stripFabricatedClauses } from "@/lib/agentic-sections";

const SOURCE = "This acquisition is a Total Small Business Set-Aside. 52.219-6 Notice of Total Small "
  + "Business Set-Aside (Nov 2025). Offerors must register in SAM per FAR 52.204-7. 252.225-7001 applies.";
const inSrc = makeClauseSourceChecker(SOURCE);

let pass = 0; const fails: string[] = [];
const check = (label: string, got: unknown, exp: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(exp)) pass++; else fails.push(`${label} → ${JSON.stringify(got)} (exp ${JSON.stringify(exp)})`);
};

// checker: present vs absent
check("checker 52.219-6 present", inSrc("52.219-6"), true);
check("checker 52.204-7 present", inSrc("52.204-7"), true);
check("checker 252.225-7001 present", inSrc("252.225-7001"), true);
check("checker 52.219-14 ABSENT", inSrc("52.219-14"), false);
check("checker en-dash form matches", inSrc("52.219 – 6"), true); // en-dash + spaces normalize

// strip: the #2 fabrication is removed, concern text survives
const r1 = stripFabricatedClauses("GATE: must qualify as small business under 52.219-14 — cite: 52.219-14", inSrc);
check("strip #2 fabrication list", r1.stripped, ["52.219-14"]);
check("strip #2 clause gone", r1.clean.includes("52.219-14"), false);
check("strip #2 concern survives", r1.clean.includes("must qualify as small business"), true);

// no false strip: a clause that IS in source stays untouched
const r2 = stripFabricatedClauses("GATE: SAM registration per 52.204-7 and set-aside 52.219-6", inSrc);
check("no-false-strip stripped empty", r2.stripped, []);
check("no-false-strip text unchanged", r2.clean, "GATE: SAM registration per 52.204-7 and set-aside 52.219-6");

// mixed: strip only the absent one
const r3 = stripFabricatedClauses("cites 52.219-6 (real) and 52.219-14 (fabricated)", inSrc);
check("mixed stripped only absent", r3.stripped, ["52.219-14"]);
check("mixed keeps real", r3.clean.includes("52.219-6"), true);
check("mixed drops fake", r3.clean.includes("52.219-14"), false);

const total = pass + fails.length;
console.log(`fabrication-suppression gate: ${pass}/${total} pass`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((f) => console.log("  ❌ " + f)); process.exit(1); }
console.log("✅ ALL PASS — clause cites absent from source are stripped; in-source clauses untouched; concern survives.");
