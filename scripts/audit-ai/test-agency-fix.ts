// Regression test for the FA-151/172 masthead-agency class (FACTS-law fix
// 2026-06-20): the issuing agency is a deterministic SAM fact and MUST win over
// a doc-keyword scan. On DHS sol 70B01C26R00000080 the doc-text extractor matched
// a passing "geospatial" mention and bound issuingOffice="National Geospatial-
// Intelligence Agency" while SAM said CBP/DHS — rendering NGA on the masthead.
// This asserts the REAL exported bindExternalFacts, not a mirror. No SAM/Opus.
// Run: npx tsx scripts/audit-ai/test-agency-fix.ts
import { bindExternalFacts, type ExternalBoundFacts } from "@/lib/audit-engine";

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

console.log(failures === 0 ? "\nALL PASS ✓" : `\n${failures} FAILED ✗`);
process.exit(failures === 0 ? 0 : 1);
