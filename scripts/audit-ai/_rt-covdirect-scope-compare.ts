// RED-TEAM R1e — SCOPE comparison. The over-fire firings (ISO 9001, Top Secret data-class, block 8(a)) are the SAME
// ELIGIBILITY_BAR_RE behaviour the RATIFIED notice-body floor has. Question: is this a NEW risk or a known-accepted one?
// The distinction that MATTERS: the ratified floor scans ONLY the short eligibility-dense NOTICE BODY; the new floor
// scans the FULL §C/§D/§E/§F/§H section text — where incidental technical strings live in DENSE prose. Same regex,
// vastly larger + prose-heavier surface = higher absolute over-fire rate.
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
import { noticeBodyEligibilityUngrounded } from "@/lib/audit-orchestrator";

// Run the ratified notice-body floor over each incidental-string SOW sentence (as if it were the notice body, no
// covering finding). If it returns true, the RATIFIED floor ALSO over-fires on these strings → same regex class.
const probes: Array<[string, string]> = [
  ["ISO 9001 deliverable", "All welds shall conform to ISO 9001 process controls."],
  ["Top Secret data-class", "Documents classified up to Top Secret shall be stored in the approved container."],
  ["block 8(a) form ref", "Enter the value in block 8(a) of the inspection form."],
  ["ineligible goods", "Nonconforming units are ineligible for acceptance and shall be rejected."],
];
console.log("=== Ratified noticeBodyEligibilityUngrounded on the SAME incidental SOW strings (true = ratified floor ALSO over-fires) ===");
for (const [n, s] of probes) {
  // pass s as the explicit notice-body text; no findings → uncovered
  const fires = noticeBodyEligibilityUngrounded(s, [], s);
  console.log(`  ${fires ? "FIRES(over)" : "clean"}  [${n}]`);
}
console.log("\nInterpretation: identical regex → identical firing. The NEW risk is not a new regex leak, it is SCOPE:");
console.log("the ratified floor gates ONE short notice body; the new floor gates SIX full section bodies incl the §C SOW,");
console.log("which is exactly where ISO-9001/Top-Secret(data)/8(a)-block collocations densely occur → amplified over-fire.");
