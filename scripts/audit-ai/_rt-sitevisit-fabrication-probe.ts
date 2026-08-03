// RED-TEAM probe. Two questions, both executed against PRODUCTION flag state (queried live from the
// audit-worker on 2026-07-31), NOT the stale live-flags.snapshot.json.
//   Q1  Does the notice-body emitter write the words "Mandatory" and "this BARS AWARD" onto a source
//       whose own text says the site visit was NON-MANDATORY?
//   Q2  Is the item-B guard (AUDIT_SITEVISIT_MANDATORY_GROUNDED, LIVE=true) able to stop it?
//   Q3  Is the design's named acceptance case (AOCSSB26R0023) capable of failing? Count how many of its
//       frozen findings are even eligible candidates for applyClauseKeyedTypingFloor.
export {};
import { readFileSync } from "node:fs";

// PRODUCTION flag state for the paths under test (railway variables --service audit-worker --kv, 2026-07-31).
process.env.AUDIT_NOTICE_BODY_ELIG_FLOOR = "true";
process.env.AUDIT_SITEVISIT_CONCLUDED_NOTICEWIDE = "true";
process.env.AUDIT_SITEVISIT_SEVERITY_FLOOR = "true";
process.env.AUDIT_ELIG_OPERATIVE_EXCERPT = "true";
process.env.AUDIT_SITEVISIT_MANDATORY_GROUNDED = "true";
process.env.AUDIT_CLAUSE_TYPING_FLOOR = "true";
process.env.AUDIT_SELF_DETERMINABLE_ELIG_CLASS = "true";
process.env.AUDIT_SIZE_STANDARD_SELF_CERT = "true";

(async () => {
  const orch = await import("../../src/lib/audit-orchestrator") as any;
  const dec = await import("../../src/lib/audit-decide") as any;
  const pat = await import("../../src/lib/audit-site-visit-patterns") as any;

  // ── Q1/Q2 ────────────────────────────────────────────────────────────────────────────────────────
  // A notice body whose ONLY site-visit statement says the visit was NON-mandatory and is over.
  const CASES: Array<[string, string]> = [
    ["C1 · NON-MANDATORY visit, concluded (the fabrication case)",
      "Solicitation W91QVN26R0777 — Repair of Building 42 HVAC. A NON-MANDATORY site visit was held and concluded on May 28, 2026; offerors who did not attend remain eligible to propose. Proposals are due July 15, 2026."],
    ["C2 · NON-MANDATORY visit, still upcoming (branch 2 / the design's target)",
      "Solicitation W91QVN26R0778. A NON-MANDATORY site visit will be held on September 9, 2026; attendance is optional and non-attendees remain eligible to propose. Proposals are due October 1, 2026."],
    ["C3 · ELIG_OPERATIVE_EXCERPT cross-frame: mandatory visit #1 concluded, DIFFERENT non-mandatory visit #2",
      "Solicitation W91QVN26R0779. You must attend the Initial Site Visit for the project to be considered eligible to propose. UPDATE 01: the site visit was held and concluded on May 28, 2026."],
  ];

  for (const [label, NOTICE] of CASES) {
    console.log(`\n──────── ${label}`);
    const em = orch.emitNoticeBodyEligBarFindings(NOTICE, [], NOTICE, null) as any[];
    console.log(`   findings emitted: ${em.length}`);
    for (const f of em) {
      console.log(`   • requirement : ${String(f.requirement).replace(/\s+/g, " ").slice(0, 340)}`);
      console.log(`     excerpt     : "${String(f.excerpt).replace(/\s+/g, " ").slice(0, 240)}"`);
      const saysMandatory = /\bMandatory\b/.test(String(f.requirement));
      const saysBars = /BARS AWARD/.test(String(f.requirement));
      const saysNonRetro = /non-retroactive/.test(String(f.requirement));
      console.log(`     >> engine wrote "Mandatory"=${saysMandatory} "BARS AWARD"=${saysBars} "non-retroactive"=${saysNonRetro} | source contains NON-MANDATORY=${/NON-MANDATORY/i.test(NOTICE)}`);
      const gm = new RegExp(pat.SITE_VISIT_MANDATORY_ATTENDANCE_RE.source, "i").exec(String(f.excerpt));
      console.log(`     >> item-B guard (LIVE=true) fires on excerpt ⇒ bar KEPT: ${!!gm}${gm ? ` (matched "${gm[0]}")` : " ⇒ demoted to advisory"}`);
      const fl = dec.applyClauseKeyedTypingFloor([{ ...f }], { enabled: true })[0];
      console.log(`     >> typing after floor: kind=${fl.kind} controllability=${fl.controllability} curable=${fl.curableInWindow} attr=${fl.requiredAttribute ?? "(none)"}`);
    }
  }

  const NOTICE = CASES[0][1];
  const emitted = orch.emitNoticeBodyEligBarFindings(NOTICE, [], NOTICE, null) as any[];
  console.log("Q1 — emitter output on a NON-MANDATORY, concluded notice");
  console.log(`   findings emitted: ${emitted.length}`);
  for (const f of emitted) {
    console.log(`   • requirement : ${String(f.requirement).replace(/\s+/g, " ").slice(0, 300)}`);
    console.log(`     excerpt     : "${String(f.excerpt).replace(/\s+/g, " ").slice(0, 200)}"`);
    console.log(`     typing      : kind=${f.kind} controllability=${f.controllability} curable=${f.curableInWindow} attr=${f.requiredAttribute ?? "(none)"}`);
    const saysMandatory = /\bMandatory\b/.test(String(f.requirement));
    const saysBars = /BARS AWARD/.test(String(f.requirement));
    const srcSaysNonMandatory = /NON-MANDATORY/i.test(NOTICE);
    console.log(`     >> engine wrote "Mandatory": ${saysMandatory} · engine wrote "BARS AWARD": ${saysBars} · source says NON-MANDATORY: ${srcSaysNonMandatory}`);
    console.log(`     >> item-B guard regex fires on the excerpt (⇒ NO demotion, bar KEPT): ${pat.SITE_VISIT_MANDATORY_ATTENDANCE_RE.test(String(f.excerpt))}`);
    const m = new RegExp(pat.SITE_VISIT_MANDATORY_ATTENDANCE_RE.source, "i").exec(String(f.excerpt));
    if (m) console.log(`     >> what the guard matched: "${m[0]}"`);
  }

  // Q2 end-to-end: does the disqualifying bar survive to the show-stopper band?
  const typed = emitted.map((f) => ({ ...f }));
  const floored = dec.applyClauseKeyedTypingFloor(typed, { enabled: true });
  console.log(`\nQ2 — after applyClauseKeyedTypingFloor (AUDIT_CLAUSE_TYPING_FLOOR live=true):`);
  for (const f of floored) console.log(`   controllability=${f.controllability} curable=${f.curableInWindow} attr=${f.requiredAttribute ?? "(none)"}`);

  // ── Q3 — is the design's acceptance case structurally able to fail? ──────────────────────────────
  const fx = JSON.parse(readFileSync("tests/fixtures/frozen/aocssb-with-qual.json", "utf8"));
  const findings: any[] = fx.decision?.dispositions ?? fx.findings ?? [];
  const sv = findings.filter((f) => /site\s*visit/i.test(`${f.requirement ?? ""} ${f.excerpt ?? ""} ${f.citation ?? ""}`));
  const candidates = findings.filter((f) => f.kind === "eligibility_bar" && f.controllability === "bidder_cannot_move" && !f.requiredAttribute);
  console.log(`\nQ3 — AOCSSB26R0023 frozen fixture (the design's named acceptance case, criterion #4)`);
  console.log(`   total findings                                  : ${findings.length}`);
  console.log(`   findings mentioning a site visit                 : ${sv.length}`);
  for (const f of sv) console.log(`      - kind=${f.kind} controllability=${f.controllability} disp=${f.disposition} :: ${String(f.requirement).slice(0, 90)}`);
  console.log(`   findings that L.2.1 ("NON-MANDATORY … MUST register") produced : ${findings.filter((f) => /L\.2\.1|NON-MANDATORY|all companies MUST register/i.test(`${f.requirement ?? ""} ${f.excerpt ?? ""} ${f.citation ?? ""}`)).length}`);
  console.log(`   CANDIDATES for applyClauseKeyedTypingFloor       : ${candidates.length}`);
  console.log(`   >> acceptance criterion #4 can only fail if CANDIDATES > 0 and one of them is the site visit.`);
})();
