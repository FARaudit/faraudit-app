// $0 CLOSED-WORLD SPOT-CHECK (Brain card 217 Step 2 — the card-216 open note, now a gate).
//   npx tsx scripts/audit-ai/test-nmr-closedworld-spotcheck.ts   (run with all five flags ON)
//
// The NMR key-fact is an eligibility_bar + requiredAttribute + bidder_controls. Under a CLOSED-WORLD profile
// (openWorld:false — a trusted/gold profile) it must behave per doctrine:
//   (a) profile does NOT assert nonmanufacturer:compliant → firmStatus "unknown"/"fails" → eligible=null
//       (NOT determined) + verify-caution, NEVER false INELIGIBLE, NEVER a show-stopper (bidder_controls);
//   (b) profile PROVES nonmanufacturer:compliant → firmStatus "satisfies" → NMR clears the unverified-gate set,
//       eligible can be true.
// Confirms flags-ON does not turn a who-can-win NMR restriction into a wrongful INELIGIBLE on a supply
// set-aside with a closed-world profile (the zero-contract-loss lock).
import { deriveVerdict, firmStatus } from "@/lib/audit-decide";
import { applyKeyfactDetector } from "@/lib/audit-keyfact-detector";
import type { TypedFinding, BidderProfile, VerdictInputs } from "@/lib/audit-findings";

let pass = 0; const fails: string[] = [];
const ok = (l: string, c: boolean) => { if (c) pass++; else fails.push(l); };
process.env.AUDIT_ELIGIBLE_TRISTATE = "true"; // prod state

// A small-business supply set-aside source that triggers the NMR applicability gate.
const SRC = "100% Women-Owned Small Business (WOSB) set-aside under NAICS 337214. Schedule of Supplies. FAR 52.219-33 Non-Manufacturer Rule applies.";
const wosb: TypedFinding = { id: "wosb", requirement: "WOSB set-aside", citation: "§A", excerpt: "100% Women-Owned Small Business (WOSB) set-aside", kind: "eligibility_bar", controllability: "already_satisfied", requiredAttribute: "setaside:WOSB", curableInWindow: true, grounded: true, lens: "capture" };
const findings = applyKeyfactDetector([wosb], SRC, { enabled: true });
const nmr = findings.find((f) => f.requiredAttribute === "nonmanufacturer:compliant");
ok("NMR emitted on supply set-aside source", !!nmr);

const vin = (fs: TypedFinding[], profile: BidderProfile | null): VerdictInputs =>
  ({ findings: fs, bidderProfile: profile, coverageComplete: true, verifierSound: true, conflict: false, manifestComplete: true });

// (a) CLOSED-WORLD profile that satisfies WOSB but NOT nonmanufacturer:compliant.
const cwPartial: BidderProfile = { satisfiedAttributes: ["setaside:WOSB", "registration:SAM.gov-active"], openWorld: false } as BidderProfile;
{
  const d = deriveVerdict(vin(findings, cwPartial));
  ok("(a) closed-world, NMR unverified → eligible=null (NOT false)", d.eligible === null);
  ok("(a) verdict is NOT INELIGIBLE", d.verdict !== "INELIGIBLE");
  ok("(a) verdict is NOT NO_BID", d.verdict !== "NO_BID");
  ok("(a) NMR is a gate_to_clear, not a show-stopper", d.dispositions.find((f) => f.requiredAttribute === "nonmanufacturer:compliant")?.disposition === "gate_to_clear");
  ok("(a) firmStatus(NMR, cwPartial) !== satisfies", firmStatus(nmr!, cwPartial) !== "satisfies");
  ok("(a) verify-caution names nonmanufacturer:compliant", /nonmanufacturer:compliant/i.test(d.reason));
}

// (b) CLOSED-WORLD profile that PROVES nonmanufacturer:compliant (+ WOSB) → NMR clears.
const cwFull: BidderProfile = { satisfiedAttributes: ["setaside:WOSB", "registration:SAM.gov-active", "nonmanufacturer:compliant"], openWorld: false } as BidderProfile;
{
  ok("(b) firmStatus(NMR, cwFull) === satisfies", firmStatus(nmr!, cwFull) === "satisfies");
  const d = deriveVerdict(vin(findings, cwFull));
  ok("(b) NMR no longer forces eligible=null when proven-satisfied", d.eligible === true || !/nonmanufacturer:compliant/i.test(d.reason));
  ok("(b) verdict is a committal (BID/BID_WITH_CAUTION)", d.verdict === "BID" || d.verdict === "BID_WITH_CAUTION");
}

// (c) NULL profile → eligible=null (baseline sanity).
ok("(c) null profile → eligible=null", deriveVerdict(vin(findings, null)).eligible === null);

console.log(`nmr-closedworld spot-check: ${pass}/${pass + fails.length} pass`);
if (fails.length) { console.log("FAILURES:"); fails.forEach((f) => console.log("  ❌ " + f)); process.exit(1); }
console.log("✅ ALL PASS — NMR under closed-world profiles: unverified→eligible=null (never false INELIGIBLE); proven→clears. Zero-contract-loss lock holds under 5 flags.");
