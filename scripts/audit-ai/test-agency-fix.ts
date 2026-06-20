// Regression test for the FA-151/172 masthead-agency class (FACTS-law fix
// 2026-06-20): the issuing agency is a deterministic SAM fact and MUST win over
// a doc-keyword scan. On DHS sol 70B01C26R00000080 the doc-text extractor matched
// a passing "geospatial" mention and bound issuingOffice="National Geospatial-
// Intelligence Agency" while SAM said CBP/DHS — rendering NGA on the masthead.
// This asserts the REAL exported bindExternalFacts, not a mirror. No SAM/Opus.
// Run: npx tsx scripts/audit-ai/test-agency-fix.ts
import { bindExternalFacts, _v2SetAsideClauseFlag, _v2GroundRiskClauses, type ExternalBoundFacts } from "@/lib/audit-engine";

type Facts = Parameters<typeof bindExternalFacts>[0];
const CBP =
  "HOMELAND SECURITY, DEPARTMENT OF.US CUSTOMS AND BORDER PROTECTION.BORDER ENFORCEMENT CONTRACTING DIVISION";
const NGA = "National Geospatial-Intelligence Agency";

let failures = 0;
function check(name: string, cond: boolean, detail: string) {
  console.log(`${cond ? "PASS" : "FAIL"} · ${name}${cond ? "" : " — " + detail}`);
  if (!cond) failures++;
}

// 1) THE BUG: doc-extract bound NGA, SAM says CBP → SAM must win, source=sam_metadata.
{
  const facts = { issuingOffice: NGA } as unknown as Facts;
  const external = { sam: { issuingOffice: CBP } } as unknown as ExternalBoundFacts;
  const sources = bindExternalFacts(facts, external, "");
  check(
    "SAM agency overrides doc-keyword NGA",
    facts.issuingOffice === CBP,
    `got ${JSON.stringify(facts.issuingOffice)}`
  );
  check("override is provenance-tagged sam_metadata", sources.issuingOffice === "sam_metadata", JSON.stringify(sources.issuingOffice));
}

// 2) GUARD (upload path): SAM silent → doc value preserved, not blanked.
{
  const facts = { issuingOffice: "Defense Logistics Agency" } as unknown as Facts;
  const external = { sam: {} } as unknown as ExternalBoundFacts;
  bindExternalFacts(facts, external, "");
  check("SAM-silent preserves doc agency (upload safety)", facts.issuingOffice === "Defense Logistics Agency", JSON.stringify(facts.issuingOffice));
}

// 3) Full doc path: keyword text would mislabel, SAM still wins to CBP.
{
  const facts = {} as unknown as Facts;
  const docText = "Statement of Work: tactical infrastructure including Geospatial-Intelligence survey support.";
  const external = { sam: { issuingOffice: CBP } } as unknown as ExternalBoundFacts;
  bindExternalFacts(facts, external, docText);
  check("doc-text mislabel still resolves to SAM CBP", facts.issuingOffice === CBP, JSON.stringify(facts.issuingOffice));
}

// 4) NAICS BUG: doc-extract bound CLIN line-item 238150, SAM principal 236220 →
//    SAM principal wins on conflict, provenance sam_metadata (masthead → "verify").
{
  const facts = { naicsCode: "238150" } as unknown as Facts;
  const external = { sam: { naicsCode: "236220" } } as unknown as ExternalBoundFacts;
  const sources = bindExternalFacts(facts, external, "");
  check("SAM principal NAICS overrides CLIN line-item", facts.naicsCode === "236220", JSON.stringify(facts.naicsCode));
  check("NAICS override tagged sam_metadata (honest badge)", sources.naicsCode === "sam_metadata", JSON.stringify(sources.naicsCode));
}

// 5) NAICS upload safety: SAM silent → doc NAICS preserved.
{
  const facts = { naicsCode: "561210" } as unknown as Facts;
  const external = { sam: {} } as unknown as ExternalBoundFacts;
  bindExternalFacts(facts, external, "");
  check("SAM-silent preserves doc NAICS (upload safety)", facts.naicsCode === "561210", JSON.stringify(facts.naicsCode));
}

// 6) NAICS no-op on match: doc==SAM → no override, provenance stays "document".
{
  const facts = { naicsCode: "541611" } as unknown as Facts;
  const external = { sam: { naicsCode: "541611" } } as unknown as ExternalBoundFacts;
  const sources = bindExternalFacts(facts, external, "");
  check("matching NAICS keeps document provenance (no false 'verify')", sources.naicsCode === "document", JSON.stringify(sources.naicsCode));
}

// ── Set-aside ↔ §I clause reconciliation (HARD-flag-only) ──────────────────
// 7) THE DTS CASE: SAM says 8(a) but §I carries 52.219-6 (Total SB) → HARD flag.
{
  const note = _v2SetAsideClauseFlag("8A", ["52.219-6", "52.219-14", "52.219-28"], false);
  check("8(a) vs Total-SB clause → flags", !!note && /Total Small Business/.test(note ?? ""), JSON.stringify(note));
}
// 8) CONFIRM: SAM 8(a) + 52.219-18 present → no flag.
{
  const note = _v2SetAsideClauseFlag("8A", ["52.219-18", "52.219-17", "52.219-14"], false);
  check("8(a) + 52.219-18 present → no flag", note === null, JSON.stringify(note));
}
// 9) CONFIRM Total SB: SAM Total SB + 52.219-6 → no flag.
{
  const note = _v2SetAsideClauseFlag("Total Small Business", ["52.219-6"], false);
  check("Total-SB + 52.219-6 → no flag", note === null, JSON.stringify(note));
}
// 10) NO false positive: only cross-program clauses (-14/-28) present → no flag.
{
  const note = _v2SetAsideClauseFlag("8A", ["52.219-14", "52.219-28"], false);
  check("only -14/-28 (non-indicators) → no false flag", note === null, JSON.stringify(note));
}
// 11) VA guard: SDVOSB on a VA sol → no FAR-based flag (VA uses VAAR).
{
  const note = _v2SetAsideClauseFlag("SDVOSBC", ["52.219-6"], true);
  check("VA jurisdiction → no FAR flag", note === null, JSON.stringify(note));
}
// 12) EDWOSB/WOSB cross-eligible: EDWOSB sol + 52.219-30 (WOSB) → no flag.
{
  const note = _v2SetAsideClauseFlag("EDWOSB", ["52.219-30"], false);
  check("EDWOSB + WOSB clause (cross-eligible) → no flag", note === null, JSON.stringify(note));
}
// 13) HARD conflict across programs: HUBZone declared, §I carries SDVOSB clause.
{
  const note = _v2SetAsideClauseFlag("HZC", ["52.219-27"], false);
  check("HUBZone vs SDVOSB clause → flags", !!note && /SDVOSB/.test(note ?? ""), JSON.stringify(note));
}

// ── Clause-citation fidelity (Polish B) ────────────────────────────────────
// 14) THE AFARS CASE: clause number absent from source + not in known list → de-attributed.
{
  const risks = [{ trapClause: "AFARS 5152.242-9000", isDfarsTrap: true }];
  const n = _v2GroundRiskClauses(risks, "PWS: contractor personnel require NCIC-III and Real ID for base access.", []);
  check("ungrounded AFARS clause de-attributed", n === 1 && risks[0].trapClause === null && risks[0].isDfarsTrap === false, JSON.stringify(risks[0]));
}
// 15) Grounded by extracted clause list → kept.
{
  const risks = [{ trapClause: "52.219-6", isDfarsTrap: false }];
  const n = _v2GroundRiskClauses(risks, "no clauses in text here", ["52.219-6"]);
  check("clause in known list kept", n === 0 && risks[0].trapClause === "52.219-6", JSON.stringify(risks[0]));
}
// 16) Grounded by source text (52.252-2 by-reference: number present, no full text) → kept.
{
  const risks = [{ trapClause: "252.204-7012", isDfarsTrap: true }];
  const n = _v2GroundRiskClauses(risks, "Section I incorporates by reference: 252.204-7012, 252.204-7020.", []);
  check("clause present in source (by-reference) kept", n === 0 && risks[0].trapClause === "252.204-7012", JSON.stringify(risks[0]));
}
// 17) Line-wrapped clause number in source still grounds → kept.
{
  const risks = [{ trapClause: "52.222-50", isDfarsTrap: false }];
  const n = _v2GroundRiskClauses(risks, "...clause 52.222-\n50 Combating Trafficking...", []);
  check("line-wrapped clause in source kept", n === 0 && risks[0].trapClause === "52.222-50", JSON.stringify(risks[0]));
}
// 18) Non-clause trapClause (e.g. a section ref) is left untouched.
{
  const risks = [{ trapClause: "Section H special requirements", isDfarsTrap: false }];
  const n = _v2GroundRiskClauses(risks, "irrelevant", []);
  check("non-clause trapClause untouched", n === 0 && risks[0].trapClause === "Section H special requirements", JSON.stringify(risks[0]));
}
// 19) null trapClause untouched.
{
  const risks = [{ trapClause: null as string | null, isDfarsTrap: false }];
  const n = _v2GroundRiskClauses(risks, "x", []);
  check("null trapClause untouched", n === 0 && risks[0].trapClause === null, JSON.stringify(risks[0]));
}

console.log(failures === 0 ? "\nALL PASS ✓" : `\n${failures} FAILED ✗`);
process.exit(failures === 0 ? 0 : 1);
