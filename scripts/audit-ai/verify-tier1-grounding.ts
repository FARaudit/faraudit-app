// $0 deterministic gate for T1-7 (grounding sweep one-archetype loss).
//   npx dotenv -e .env.local -- tsx scripts/audit-ai/verify-tier1-grounding.ts
//
// classify() returned a single archetype per paragraph, so co-located bindings
// were lost: a segment carrying BOTH a FAT precondition AND a delivery window
// (common when pdftotext blobs §F) grounded only the FAT, and Step 2's temporal-
// conflict NO_BID check never saw the delivery half. Fix: classifyAll grounds
// every distinct archetype in the segment (personnel_qual variants stay single).

import { highSignalSweep } from "@/lib/audit-grounding-sweep";

let pass = 0; const fails: string[] = [];
const ok = (label: string, cond: boolean) => { cond ? pass++ : fails.push(label); };
const arch = (fs: { sweepArchetype?: string }[]) => fs.map((f) => f.sweepArchetype);

// One paragraph carrying BOTH a FAT precondition and a delivery-window binding.
const coLocated = [
  "SECTION F — DELIVERIES OR PERFORMANCE",
  "",
  "First Article Testing is non-waivable and must be completed within 60 days " +
  "prior to production of any deliverable. Production delivery shall be made within 90 " +
  "days after receipt of order (ARO) to the destination named in Section B.",
].join("\n");

const hits = highSignalSweep(coLocated);
const archs = arch(hits);
ok("T1-7 R1: the FAT precondition archetype is grounded", archs.includes("fat_precondition"));
ok("T1-7 R2: the CO-LOCATED delivery-window archetype is ALSO grounded (was lost pre-fix)", archs.includes("delivery_window"));
ok("T1-7 R3: both archetypes present so Step 2 can see the FAT+delivery pair", archs.includes("fat_precondition") && archs.includes("delivery_window"));

// A paragraph that matches BOTH personnel_qual variants (years + cert) stays a
// SINGLE personnel_qual finding — behavior-preserving (no double-emit).
const personnel = "Key personnel: the on-site engineer shall be a licensed professional engineer " +
  "with at least ten (10) years of experience in similar work.";
const pHits = highSignalSweep(personnel);
ok("T1-7 R4: personnel double-match still grounds exactly ONE personnel_qual",
  arch(pHits).filter((a) => a === "personnel_qual").length === 1);

// Regression: separate paragraphs still each ground their archetype.
const separate = [
  "FAT is non-waivable and must complete within 30 days prior to production.",
  "",
  "Delivery shall be within 45 days ARO after award.",
].join("\n");
const sArch = arch(highSignalSweep(separate));
ok("T1-7 R5: separate-paragraph FAT still grounds", sArch.includes("fat_precondition"));
ok("T1-7 R6: separate-paragraph delivery still grounds", sArch.includes("delivery_window"));

// Non-binding text grounds nothing.
ok("T1-7 R7: plain prose grounds no archetype", highSignalSweep("This is an ordinary sentence about coffee.").length === 0);

console.log(`\nTier1 grounding (T1-7): ${pass}/${pass + fails.length} PASS`);
if (fails.length) { console.error("FAILS:\n" + fails.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
