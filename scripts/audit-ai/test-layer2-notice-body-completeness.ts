// Layer-2 (Brain card 262) — content-aware completeness NEGATIVE + gold-guard test. $0, deterministic (no model).
//   npx tsx scripts/audit-ai/test-layer2-notice-body-completeness.ts
// Proves: a solicitation-type buy whose §L/§M live in an un-ingested notice body (80NSSC26936974Q class) now
// reports the missing proposal sections → INCOMPLETE cap (was a confident false-COMPLETE), WITHOUT false-flagging
// Sources Sought/RFI or a validly-read combined file with an unrecognized primary-form name.
import { coreMissingFor } from "@/lib/audit-orchestrator";
import { requiresProposalSections, procurementPart, type AuditToolContext } from "@/lib/audit-tools";

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got ${g}\n      want ${w}`); }
};
const ctx = (fullSource: string, sections: Record<string, string>): AuditToolContext => ({ fullSource, sections });

// The 80NSSC package's actual assembled source: a SOW only (§L/§M were in the notice body, never ingested).
const SOW_ONLY = "STATEMENT OF WORK\n1. SCOPE. The contractor shall furnish the Rockland Piston Cylinder System per the specifications herein. 2. The contractor shall deliver units in accordance with the delivery schedule.";
// A full Part-15 UCF combined file (headers present) — the healthy anchor.
const UCF = "SECTION C - DESCRIPTION/SPECIFICATIONS\nThe contractor shall provide services.\nSECTION L - INSTRUCTIONS TO OFFERORS\nSubmit a technical volume and a price volume.\nSECTION M - EVALUATION FACTORS FOR AWARD\nAward on best value; technical is more important than price.";
// A commercial combined synopsis that references 52.212-1/-2 inline (the C-10 flag path — untouched).
const COMMERCIAL = "Combined Synopsis/Solicitation. This is a commercial acquisition. Provision 52.212-1 Instructions to Offerors and 52.212-2 Evaluation apply. The contractor shall provide widgets.";

console.log("── notice-type → requires §L/§M ──");
eq("Solicitation requires §L/§M", requiresProposalSections("Solicitation"), true);
eq("Combined Synopsis/Solicitation requires", requiresProposalSections("Combined Synopsis/Solicitation"), true);
eq("null/upload → fail-safe requires", requiresProposalSections(null), true);
eq("Sources Sought NOT required", requiresProposalSections("Sources Sought"), false);
eq("Special Notice NOT required", requiresProposalSections("Special Notice"), false);
eq("RFI NOT required", requiresProposalSections("Request for Information"), false);

console.log("── format sanity (procurementPart off the source) ──");
eq("SOW-only → unknown format", procurementPart(ctx(SOW_ONLY, { C: SOW_ONLY })), "unknown");
eq("UCF headers → part15-ucf", procurementPart(ctx(UCF, { C: "x", L: "x", M: "x" })), "part15-ucf");

console.log("── THE TRIGGER: 80NSSC-class (notice-body-resident §L/§M) ──");
// SOW-only source, §C present, §L/§M absent (they were in the un-ingested notice body), solicitation-type buy.
eq("80NSSC: solicitation + SOW-only → coreMissing [L,M] (was [] false-COMPLETE)",
  coreMissingFor(ctx(SOW_ONLY, { C: SOW_ONLY }), { requiresLM: requiresProposalSections("Solicitation") }),
  ["L", "M"]);

console.log("── Brain evidence rule: zero-attachment / nothing located ──");
eq("zero-attachment thin source → coreMissing [C,L,M]",
  coreMissingFor(ctx("(empty)", {}), { requiresLM: requiresProposalSections("Solicitation") }),
  ["C", "L", "M"]);

console.log("── NEGATIVE CONTROLS (must NOT false-flag) ──");
eq("Sources Sought + SOW-only → [] (exempt, no false INCOMPLETE)",
  coreMissingFor(ctx(SOW_ONLY, { C: SOW_ONLY }), { requiresLM: requiresProposalSections("Sources Sought") }),
  []);
eq("commercial 52.212 ref → [] (C-10 flag path untouched)",
  coreMissingFor(ctx(COMMERCIAL, { C: COMMERCIAL }), { requiresLM: requiresProposalSections("Combined Synopsis/Solicitation") }),
  []);

console.log("── GOLD-GUARD: anchors unchanged ──");
eq("Part-15 UCF all present → [] (unchanged)",
  coreMissingFor(ctx(UCF, { C: "x", L: "x", M: "x" }), { requiresLM: true }),
  []);
eq("Part-15 UCF missing §M → [M] (unchanged fail-safe)",
  coreMissingFor(ctx(UCF.replace(/SECTION M[\s\S]*/, ""), { C: "x", L: "x" }), { requiresLM: true }),
  ["M"]);

console.log("── ANTI-OVER-FIRE: validly-read combined file, unrecognized form name (§L/§M located) ──");
// requiresLM true + §L/§M present (real content) → coreMissing [] regardless of form-name → NOT capped.
eq("combined file with §L/§M located → [] (no false-INCOMPLETE on read content)",
  coreMissingFor(ctx(UCF, { C: "x", L: "x", M: "x" }), { requiresLM: true }),
  []);

console.log("── FINDING D: misclassified-commercial bypass (SOW-only + stray 'SF 1449'/'RFQ' string) ──");
// A SOW that carries a stray commercial anchor → classifies part12-commercial, but is really the 80NSSC class.
const SOW_STRAY_COMMERCIAL = "Request for Quotation\nSTATEMENT OF WORK\n1. SCOPE. The contractor shall furnish the system. Deliver FOB destination.";
eq("misclassified commercial part = part12-commercial", procurementPart(ctx(SOW_STRAY_COMMERCIAL, { C: SOW_STRAY_COMMERCIAL })), "part12-commercial");
// No recognized primary form (formIdentified=false), flag OFF → NOW capped flag-independently (was a free pass).
eq("SOW+stray-commercial, no form, flag OFF → [52.212-1,52.212-2] (finding D closed)",
  coreMissingFor(ctx(SOW_STRAY_COMMERCIAL, { C: SOW_STRAY_COMMERCIAL }), { requiresLM: true, formIdentified: false }),
  ["52.212-1", "52.212-2"]);
// Genuine commercial (real SF-1449 form present) → NOT capped flag-OFF → byte-identical (no over-fire).
eq("genuine commercial, form present, flag OFF → [] (byte-identical, no over-fire)",
  coreMissingFor(ctx(SOW_STRAY_COMMERCIAL, { C: SOW_STRAY_COMMERCIAL }), { requiresLM: true, formIdentified: true }),
  []);
// Non-solicitation misclassified commercial, no form, flag OFF → NOT capped (exempt).
eq("Sources Sought + stray commercial, no form → [] (exempt)",
  coreMissingFor(ctx(SOW_STRAY_COMMERCIAL, { C: SOW_STRAY_COMMERCIAL }), { requiresLM: false, formIdentified: false }),
  []);
// Flag ON path still caps when both absent (unchanged Brain card-135 behavior).
eq("commercial flag ON, both 52.212 absent → [52.212-1,52.212-2] (unchanged)",
  coreMissingFor(ctx(SOW_STRAY_COMMERCIAL, { C: SOW_STRAY_COMMERCIAL }), { commercialHonestFail: true }),
  ["52.212-1", "52.212-2"]);

console.log(`\n${fail === 0 ? "✅" : "❌"} Layer-2 completeness: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
