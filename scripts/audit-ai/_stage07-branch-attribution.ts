// $0 READ-ONLY — with EVERY coverage/document gate forcibly cleared, WHICH ladder branch still refuses?
// Attribution is by the branch's own verbatim reason lead, not by guesswork.
import { readdirSync, readFileSync } from "node:fs";
import { deriveVerdict } from "../../src/lib/audit-decide";
import { registerJudgmentVerifier } from "../../src/lib/audit-judgment-layer";

registerJudgmentVerifier();
const DIR = "scripts/audit-ai/run-records";

// each key is a verbatim fragment unique to ONE return site in deriveVerdict (file:line in the comment)
const BRANCH: Array<[string, string]> = [
  ["Could not confidently identify the base solicitation", "0  primaryIndeterminate :3525"],
  ["Document set not complete", "1-PRE/1b documentsComplete :3572/:3639"],
  ["could not be grounded to a finding", "1  GATE_V2 coverage NHR :3611"],
  ["Could not fully read binding content", "1  GATE_V2 INCOMPLETE :3584"],
  ["completeness proof is empty", "1  GATE_V2 zero-attestation :3584"],
  ["bidder-eligibility bar stated in the solicitation notice", "1a notice-body bar :3630"],
  ["Unread/missing referenced material", "1c unreadEvidence :3647"],
  ["Set-aside conflict", "1d setAsideConflict :3658"],
  ["Adversarial verification did not succeed", "2  verifierSound :3662"],
  ["No decision-bearing findings survived", "2b verified-floor (empty/all-boilerplate) :3675"],
  ["FORK-5 invariant breach", "3  FORK-5 unverified mark :3706"],
  ["SUPPRESSED to NHR pending four-walls", "3  card-275 R4b NO_BID suppression :3719"],
  ["CONDITIONAL bar(s) on an INCOMPLETE read", "3  manifest asymmetry cap :3739"],
  ["Universal solicitation defect", "3  NO_BID :3750"],
  ["Ineligible — the firm's profile does not satisfy", "3  INELIGIBLE :3756"],
  ["This is a sole-source award", "4  sole-source lock :3801"],
  ["claim a universal impossibility", "FORK-2 unmarkedUniversalClaim :3811"],
  ["Unresolved material conflict", "4  conflict :3816"],
  ["Self-clearable package", "4b self-clearable BWC :3830"],
  ["missing required typing", "5a UNTYPED bar — fail closed :3846"],
  ["CONDITIONAL NO-BID:", "5b non-curable structural bar :3872"],
  ["Nonmanufacturer Rule compliance", "5b-NMR :3881"],
  ["Cannot confirm the solicitation is still open", "currency cap :3896"],
  ["manifest-named attachment went unfetched", "manifest cap :3907/:3920"],
  ["residual curable risk", "5c curable BWC :3913"],
  ["qualification caution(s) to verify", "5c caution-floor BWC :3913"],
  ["all other unmet items are bidder-controllable", "6  DEFAULT BID :3922"],
  ["all unmet items are bidder-controllable gates", "6  DEFAULT BID :3923"],
];
const attribute = (reason: string) => BRANCH.find(([frag]) => reason.includes(frag))?.[1] ?? `UNATTRIBUTED: ${reason.slice(0, 70)}`;

const counts: Record<string, number> = {};
const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
let n = 0;

for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  let rec: { result?: { inputs?: Record<string, unknown> } };
  try { rec = JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")); } catch { continue; }
  const inp = rec?.result?.inputs;
  if (!inp || !Array.isArray(inp.findings)) continue;
  const cov = inp.coverageV2 as undefined | Record<string, unknown>;
  const cleared = {
    ...inp, documentsComplete: true, manifestComplete: true, coverageComplete: true,
    coverageV2: cov ? { ...cov, disqualifierUncovered: [], ungroundedRead: [], unreadable: [] } : cov,
    noticeBodyBarUngrounded: false, unreadEvidence: [],
  };
  let d; try { d = deriveVerdict(cleared as never); } catch { bump("THREW EngineInvariantError"); n++; continue; }
  n++;
  bump(`${d.verdict.padEnd(19)} ← ${attribute(d.reason)}`);
}

console.log(`PERFECT-COVERAGE COUNTERFACTUAL — every read/coverage gate forced clean, ${n} banked records\n`);
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
