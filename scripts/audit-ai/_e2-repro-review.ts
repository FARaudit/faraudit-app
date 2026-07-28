// Reproduce /code-review high findings #1 and #3 on PR #294 before fixing either.
import { extractRegulationTokens, gateCitationsInText } from "../../src/lib/audit-citation-fidelity";
const SRC = "Submission shall be in accordance with FAR 15.408, Table 15-2, Instructions for Submitting Cost/Price Proposals.";
console.log("=== F1 · a citation at the END of a sentence ===");
for (const s of ['Proposal must include documentation per DFARS 215-2.', 'Comply with DFARS 252.204-7012.', 'See FAR 52.219-6.', 'per DFARS 215-2 (mid-sentence)']) {
  const toks = extractRegulationTokens(s);
  const g = gateCitationsInText(s, SRC);
  console.log(`  ${JSON.stringify(s).padEnd(52)} tokens=${toks.length} withheld=${g.withheld.length}`);
}
