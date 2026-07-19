/* Card #562 mini-certs — Item 1 new nouns (SCIF/COMSEC/FOCI) + AS9100 dedup finding + Item 2 access-to-bid carve-out.
 * Run: npx tsx scripts/audit-ai/_cert-phase5-card562.ts */
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";
process.env.AUDIT_AMBIGUOUS_SIGNAL_DEMOTION = "true";
process.env.AUDIT_COVERED_DIRECT_BAR_FLOOR = "true";
process.env.AUDIT_ELIG_BAR_PASSIVE_FRAME = "true";
import { passiveFrameEligBarSentence, completenessOf } from "@/lib/audit-orchestrator";
import type { TypedFinding } from "@/lib/audit-types";
let fail = 0; const ok = (l: string, c: boolean) => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) fail++; };
const F = (ex: string): TypedFinding => ({ id: "fb", citation: "§H", excerpt: ex, kind: "requirement", controllability: "bidder_controls", severity: "info" } as unknown as TypedFinding);

console.log("── Item 1 — SCIF / COMSEC / FOCI real bars FLAG ──");
ok("SCIF: 'Award may only be made to firms holding an active SCIF accreditation.'", passiveFrameEligBarSentence("Award may only be made to firms holding an active SCIF accreditation."));
ok("COMSEC: 'A DCSA-accredited SCIF and an approved COMSEC account are required prior to any classified work.'", passiveFrameEligBarSentence("A DCSA-accredited SCIF and an approved COMSEC account are required prior to any classified work."));
ok("FOCI: 'Foreign-owned offerors must have an approved FOCI mitigation agreement in place prior to award.'", passiveFrameEligBarSentence("Foreign-owned offerors must have an approved FOCI mitigation agreement in place prior to award."));

console.log("\n── Item 1 — new-noun benign surfaces SKIP (guard) ──");
ok("SCIF marketing: 'Our SCIF-accredited facility is available for classified meetings during performance.'", !passiveFrameEligBarSentence("Our SCIF-accredited facility is available for classified meetings during performance."));
ok("COMSEC post-award handling: 'COMSEC material shall be handled in accordance with the CMS during performance.'", !passiveFrameEligBarSentence("COMSEC material shall be handled in accordance with the CMS during performance."));
ok("FOCI disclosure: 'Offerors shall disclose any FOCI factors in their proposal.'", !passiveFrameEligBarSentence("Offerors shall disclose any FOCI factors in their proposal."));

console.log("\n── AS9100 dedup finding — already caught by ELIGIBILITY_BAR_RE bare token at the FLOOR (do NOT add to passive) ──");
ok("passiveFrameEligBarSentence does NOT claim AS9100 (not in passive vocab)", !passiveFrameEligBarSentence("Eligibility is limited to holders of a valid AS9100 certification."));
{
  const src = ["SECTION H - SPECIAL CONTRACT REQUIREMENTS", "The Government will provide workspace.", "Eligibility is limited to holders of a valid AS9100 certification."].join("\n");
  const r = completenessOf({ fullSource: src } as any, ["H"], [F("The Government will provide workspace.")], new Set(["H"]));
  ok("but the FLOOR still floors AS9100 via ELIGIBILITY_BAR_RE's bare \\bas9100\\b token → obligations_ungrounded (a passive add would DOUBLE-fire; NOT added)", r.attestations.find((a) => a.section === "H")?.status === "obligations_ungrounded");
}

console.log("\n── Item 2 — access-to-BID carve-out (mini-cert a/b/c) ──");
ok("(a) clearance gates receipt of the REQUIRED TDP-to-quote → FLAG (NHR)", passiveFrameEligBarSentence("A Top Secret facility clearance is a precondition to receiving the technical data package required to prepare a responsive quote."));
ok("(a2) DDTC gates receipt of the TDP → FLAG", passiveFrameEligBarSentence("DDTC registration status current and in good standing is a precondition to receiving the technical data package."));
ok("(b) benign 'TDP available, no clearance gate' → SKIP", !passiveFrameEligBarSentence("The technical data package is available upon request; no clearance is required to receive it."));
ok("(c1) 'security clearance is a condition of access to Building 7' → SKIP (access-to-perform)", !passiveFrameEligBarSentence("A security clearance is a condition of access to Building 7 during performance."));
ok("(c2) 'only cleared personnel may access the reading room' → SKIP", !passiveFrameEligBarSentence("Only cleared personnel may access the classified reading room."));

console.log(`\n${fail ? "❌ FAIL" : "✅ ALL PASS"} — ${fail} failed`);
process.exit(fail ? 1 : 0);
