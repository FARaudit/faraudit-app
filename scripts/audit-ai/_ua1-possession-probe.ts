// U-A.1 · POSSESSION-ARM NARROWING — FALSIFICATION PROBE, written BEFORE the fix (round-3 finding 1).
//
// THE DEFECT (round-3, executed): the bare `(?:shall|must|to)\s+(?:hold|possess)` token in
// PREAWARD_POSSESSION_RE makes firm_fact_bar re-mute buckets containing common §L submission mechanics
// ("hold prices firm for 90 days", "shall hold a pre-bid conference") — safe pole, but it silently re-mutes
// a slice of the U-A release cohort and poisons the live wall measurement.
//
// THE NARROWING (scoped to the U-A kind computation ONLY — PREAWARD_POSSESSION_RE itself is shared with the
// #576 upkeep discriminator and the #590 self-clearable recognizer and is NOT touched): the possession-frame
// arm holds the mute only when the SAME obligation also carries a credential noun (CREDENTIAL_TOKEN_RE) or a
// long-lead token; the long-lead arm is unchanged (its tokens are credential nouns by construction).
//
// Run BEFORE the fix: R1/R2/R3 (release legs) must be RED — that is the planted known-positive.
// Run AFTER the fix: all legs GREEN. Env: banked bb1d6997 flagEnv + AUDIT_COVERAGE_CAP_NOT_MUTE=true;
// documentsComplete pinned true so the release pole is the capped committal, not INCOMPLETE.
import { readFileSync } from "fs";

const bb = JSON.parse(readFileSync("scripts/audit-ai/run-records/_ua-bb1d6997.json", "utf8"));
for (const [k, v] of Object.entries(bb.meta?.flagEnv ?? {})) if (v !== undefined) process.env[k] = v as string;
process.env.AUDIT_COVERAGE_CAP_NOT_MUTE = "true";

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "✅" : "❌"} ${label}${ok ? "" : ` — ${detail}`}`);
  ok ? pass++ : fail++;
};

(async () => {
  const { deriveVerdict } = await import("../../src/lib/audit-decide");
  const withBucket = (obligations: string[]) => {
    const inp = JSON.parse(JSON.stringify(bb.result.inputs));
    inp.documentsComplete = true;
    inp.coverageV2.disqualifierUncovered = obligations.map((obligation) => ({ section: "L", obligation }));
    return deriveVerdict(inp);
  };

  // ── RELEASE legs (RED before the fix — the over-hold class must flow to the capped committal) ──
  const r1 = withBucket(["Offerors must hold their prices firm for a period of 90 days from the date of quote submission."]);
  check("R1 'hold prices firm' (no credential noun) → RELEASES to BID_WITH_CAUTION",
    r1.verdict === "BID_WITH_CAUTION", `got ${r1.verdict} :: ${(r1.reason ?? "").slice(0, 110)}`);
  const r2 = withBucket(["The Government shall hold a pre-bid conference at the site on the date specified in the schedule."]);
  check("R2 'shall hold a pre-bid conference' → RELEASES to BID_WITH_CAUTION",
    r2.verdict === "BID_WITH_CAUTION", `got ${r2.verdict} :: ${(r2.reason ?? "").slice(0, 110)}`);
  const r3 = withBucket(["The Contractor must possess the proper equipment to perform the services described herein."]);
  check("R3 'must possess the proper equipment' (no credential noun) → RELEASES to BID_WITH_CAUTION",
    r3.verdict === "BID_WITH_CAUTION", `got ${r3.verdict} :: ${(r3.reason ?? "").slice(0, 110)}`);

  // ── HOLD legs (must stay GREEN before AND after — the narrowing may not release a real firm-fact) ──
  const h1 = withBucket(["Offeror must possess a current Top Secret facility clearance at the time of award."]);
  check("H1 possession + long-lead credential → HOLDS NEEDS_HUMAN_REVIEW",
    h1.verdict === "NEEDS_HUMAN_REVIEW", `got ${h1.verdict}`);
  const h2 = withBucket(["The offeror shall hold an active DEA registration prior to contract award."]);
  check("H2 possession + credential noun (registration) → HOLDS NEEDS_HUMAN_REVIEW",
    h2.verdict === "NEEDS_HUMAN_REVIEW", `got ${h2.verdict}`);
  const h3 = withBucket(["Offerors must possess a valid state contractor license at the time of proposal submission."]);
  check("H3 possession + credential noun (license) → HOLDS NEEDS_HUMAN_REVIEW",
    h3.verdict === "NEEDS_HUMAN_REVIEW", `got ${h3.verdict}`);
  const h4 = withBucket(["All personnel must be CMMC Level 2 certified before performance begins."]);
  check("H4 long-lead arm unchanged (CMMC, no possession frame) → HOLDS NEEDS_HUMAN_REVIEW",
    h4.verdict === "NEEDS_HUMAN_REVIEW", `got ${h4.verdict}`);
  // cc family untouched
  const h5 = withBucket(["The contractor shall maintain an active SAM registration throughout the period of performance."]);
  check("H5 credential-conditional family untouched → HOLDS NEEDS_HUMAN_REVIEW",
    h5.verdict === "NEEDS_HUMAN_REVIEW", `got ${h5.verdict}`);

  // ── H6-H11 (U-A.1 verification F1, executed): firm-fact phrasings the PARENT held that the bare
  // CREDENTIAL_TOKEN_RE narrowing RELEASED — credential-noun-by-reference, permit, verb-form "registered",
  // "credentials", facility rating, Authority to Operate. All must HOLD. ──
  const f1Sentences: Array<[string, string]> = [
    ["H6 qualifications-by-reference", "The offeror must possess the qualifications described in Section H at the time of award."],
    ["H7 permits", "The contractor must hold all permits required by the State of California at time of proposal submission."],
    ["H8 verb-form 'registered'", "At the time of award, the offeror must be registered as a general contractor with the Nevada State Contractors Board and shall hold that standing through award."],
    ["H9 'credentials'", "Key personnel must possess the credentials specified in the PWS at the time of award."],
    ["H10 facility rating", "The offeror must possess an interim facility rating issued by DCSA prior to award."],
    ["H11 Authority to Operate", "The offeror must possess an Authority to Operate for the hosting environment prior to contract start."],
  ];
  for (const [label, ob] of f1Sentences) {
    const v = withBucket([ob]);
    check(`${label} → HOLDS NEEDS_HUMAN_REVIEW`, v.verdict === "NEEDS_HUMAN_REVIEW", `got ${v.verdict}`);
  }
  // R4 — collision guard from the same review: "qualified personnel" (adjective form) must NOT re-hold the
  // equipment/personnel mechanics class — the noun set is qualificat\w*, not qualif\w*.
  const r4 = withBucket(["The Contractor must possess adequate equipment and qualified personnel to perform the work described herein."]);
  check("R4 'equipment and qualified personnel' → still RELEASES to BID_WITH_CAUTION",
    r4.verdict === "BID_WITH_CAUTION", `got ${r4.verdict} :: ${(r4.reason ?? "").slice(0, 110)}`);

  // ── OFF-state guard: with the flag OFF everything above is the pre-U-A NHR mute (byte-identity class) ──
  process.env.AUDIT_COVERAGE_CAP_NOT_MUTE = "false";
  const off = withBucket(["Offerors must hold their prices firm for a period of 90 days from the date of quote submission."]);
  check("O1 flag-OFF → NEEDS_HUMAN_REVIEW coverage mute (narrowing is invisible OFF)",
    off.verdict === "NEEDS_HUMAN_REVIEW" && /could not be grounded/i.test(off.reason ?? ""), `got ${off.verdict}`);

  console.log(`\n${pass} pass · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
