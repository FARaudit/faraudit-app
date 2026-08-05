// $0 proof for ROOT #4 — coverage-coherence (card #453/#448, flag AUDIT_COVERAGE_COHERENCE).
// Run flag ON:  AUDIT_COVERAGE_COHERENCE=true npx tsx src/lib/v4-coverage-coherence.test.ts
// Run flag OFF:                              npx tsx src/lib/v4-coverage-coherence.test.ts
//
// 64b79916: the coverage panel showed §L/§M "missing" while 30+ grounded L/M findings rendered. The fix
// reconciles coverage against the evidence — an evidenced section drops out of `missing` and its core chip
// flips to ok. Tested through the REAL public render path buildV4Data (production faithfulness).
import { buildV4Data } from "./v4-report/build-data";
import { isEnvOn } from "./env-flags";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log((cond ? "PASS" : "FAIL") + ": " + msg); if (!cond) failures++; };
const flagOn = isEnvOn(process.env.AUDIT_COVERAGE_COHERENCE);

// A row whose coverage lists L/M "missing" while findings cite §L / §M (the 64b79916 incoherence).
const row = () => ({
  solicitation_number: "FA813726R0033",
  compliance_json: {
    documents_complete: true,
    v3: {
      verdict: "NEEDS_HUMAN_REVIEW", eligible: null, reason: "Human review required.",
      showStoppers: [],
      findings: [
        { requirement: "Submit the Technical Volume IAW the instructions", citation: "§L 2.1", disposition: "gate_to_clear" },
        { requirement: "Only Low Risk technical approaches are acceptable", citation: "§M 2.1", disposition: "met" },
        { requirement: "Price all CLINs", citation: "§B", disposition: "gate_to_clear" },
      ],
      coverage: { required: ["L", "M", "B"], covered: ["B"], missing: ["L", "M"], coreMissing: [] },
    },
  },
});

console.log("\n-- coverage-coherence: §L/§M evidenced by findings must not read 'missing' --");
{
  const v4 = buildV4Data(row());
  const missing = v4.coverage.missing || [];
  const core = v4.coverage.core || [];
  const okOf = (k: string) => core.find((c: { k: string; ok: boolean }) => c.k === k)?.ok;
  if (flagOn) {
    assert(!missing.includes("L") && !missing.includes("M"), "flag ON: §L/§M dropped from missing[] (evidenced by grounded findings)");
    assert(okOf("L") === true && okOf("M") === true, "flag ON: §L/§M core chips flip to ok (coherent with the rendered findings)");
    assert(okOf("B") === true, "flag ON: §B still covered (unchanged)");
  } else {
    assert(missing.includes("L") && missing.includes("M"), "flag OFF: §L/§M stay in missing[] (byte-identical prior behavior)");
    assert(okOf("L") === false && okOf("M") === false, "flag OFF: §L/§M core chips stay not-ok (byte-identical)");
  }
}

console.log("\n-- guard: a genuinely absent section (no findings cite it) STAYS missing under the flag --");
{
  const r = row();
  // K is required+missing with NO finding citing it → must remain missing even flag ON (no false coverage).
  r.compliance_json.v3.coverage = { required: ["L", "K"], covered: [], missing: ["L", "K"], coreMissing: [] };
  const v4 = buildV4Data(r);
  const missing = v4.coverage.missing || [];
  if (flagOn) {
    assert(!missing.includes("L"), "flag ON: §L (cited by findings) drops from missing");
    assert(missing.includes("K"), "flag ON: §K (NO finding cites it) STAYS missing — no false coverage");
  } else {
    assert(missing.includes("L") && missing.includes("K"), "flag OFF: both stay missing (byte-identical)");
  }
}

console.log("\n-- guard: a BARE letter in prose must NOT false-evidence a section (anchor requires §K or K-<digit>) --");
{
  const r = row();
  // A finding whose text contains a bare 'M' ("Proposal", "M0001") but NO real §M anchor must not cover §M.
  r.compliance_json.v3.findings = [{ requirement: "Provide the Proposal and acknowledge Modification M0001", citation: "cover letter", disposition: "gate_to_clear" }];
  r.compliance_json.v3.coverage = { required: ["M"], covered: [], missing: ["M"], coreMissing: [] };
  const v4 = buildV4Data(r);
  const missing = v4.coverage.missing || [];
  assert(missing.includes("M"), (flagOn ? "flag ON" : "flag OFF") + ": bare-letter prose ('Proposal'/'M0001') does NOT evidence §M — stays missing");
}

console.log("\n" + (failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"));
process.exit(failures === 0 ? 0 : 1);
