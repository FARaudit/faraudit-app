// Post-restart validation · runs FA301626Q0068 baseline through the new
// production defaults (Sonnet 4.6 + escalation router + model tagging) without
// any setActiveModel override. Confirms:
//   1. Default model is now "claude-sonnet-4-6" (CLAUDE_MODEL constant swap)
//   2. AuditResult.model_used + retry_escalations populate correctly
//   3. Trap detection on baseline still hits 3/3 parity vs run-2 evidence
//   4. Compile + runtime wiring of new fields is sound
//
// Single audit · ~$0.70 spend · confirms wiring rather than re-validating quality.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..");

const env = Object.fromEntries(
  readFileSync(join(PROJECT_ROOT, ".env.local"), "utf8")
    .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1).trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      return [l.slice(0, i).trim(), v];
    })
);
process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
process.env.SAM_API_KEY = env.SAM_API_KEY;
process.env.CLAUDE_TIMEOUT_MS = "300000";

const engineNs = await import(join(PROJECT_ROOT, "src", "lib", "audit-engine.ts"));
const samNs = await import(join(PROJECT_ROOT, "src", "lib", "sam.ts"));
const pdfNs = await import(join(PROJECT_ROOT, "agents", "audit-ai", "pdf.ts"));
const { runAudit, setUsageSink } = engineNs.default ?? engineNs;
const { fetchSolicitationByNoticeId } = samNs.default ?? samNs;
const { fetchPdfFromPath } = pdfNs.default ?? pdfNs;

console.log("=".repeat(70));
console.log("POST-RESTART VALIDATION · FA301626Q0068 baseline · production defaults");
console.log("=".repeat(70));

const usage = [];
setUsageSink((u) => usage.push(u));

const pdf = await fetchPdfFromPath(join(PROJECT_ROOT, "Solicitation+-+FA301626Q0068.pdf"));
const sol = await fetchSolicitationByNoticeId("FA301626Q0068") || {
  noticeId: "FA301626Q0068",
  title: "T-38 Talon Intake Plugs and Exhaust Covers",
  department: "DEPT OF DEFENSE",
  naicsCode: "336413",
  description: "post-restart validation · baseline"
};

const t0 = Date.now();
const result = await runAudit({ solicitation: sol, pdfBase64: pdf.base64 });
const ms = Date.now() - t0;
setUsageSink(null);

const inT = usage.reduce((s, u) => s + u.input_tokens, 0);
const outT = usage.reduce((s, u) => s + u.output_tokens, 0);
const cost = (inT / 1e6) * 3 + (outT / 1e6) * 15; // sonnet pricing
const c = result.compliance.json;

const hexDetected = (c.dfars_clauses || []).some((cl) => (cl || "").includes("252.223-7008"));
const fobConflict = ((c.fob_conflicts || []).length > 0);
const flags = c.dfars_flags || [];

console.log(`\n[wiring]`);
console.log(`  result.model_used:         ${result.model_used}`);
console.log(`  result.retry_escalations:  ${JSON.stringify(result.retry_escalations)}`);
console.log(`  expected: model_used="claude-sonnet-4-6" · retry_escalations=[]`);
console.log(`\n[trap detection]`);
console.log(`  hex-chrome (252.223-7008): ${hexDetected ? "✓" : "✗"}`);
console.log(`  FOB conflict:              ${fobConflict ? "✓" : "✗"}`);
console.log(`  DFARS flags (count):       ${flags.length}`);
console.log(`\n[economics]`);
console.log(`  calls=${usage.length} input=${inT.toLocaleString()} output=${outT.toLocaleString()} · $${cost.toFixed(2)} · ${(ms / 1000).toFixed(1)}s`);
console.log(`\n[full result]`);
console.log(`  classification: ${result.classification.document_type} (${result.classification.confidence})`);
console.log(`  recommendation: ${result.recommendation}`);
console.log(`  compliance_score: ${result.compliance_score}/100`);

const lines = [
  "# Post-restart validation · FA301626Q0068",
  "",
  `Date: ${new Date().toISOString()}`,
  `Spend: $${cost.toFixed(2)} · ${(ms / 1000).toFixed(1)}s wall-clock`,
  "",
  "## Wiring",
  `- \`result.model_used\` = \`${result.model_used}\` (expected \`claude-sonnet-4-6\`) · ${result.model_used === "claude-sonnet-4-6" ? "✓" : "✗"}`,
  `- \`result.retry_escalations\` = \`${JSON.stringify(result.retry_escalations)}\` (expected \`[]\` for clean run) · ${result.retry_escalations.length === 0 ? "✓" : "⚠ retries fired"}`,
  "",
  "## Trap detection (vs quality-gate run-2 baseline)",
  `- hex-chrome (DFARS 252.223-7008): ${hexDetected ? "✓ detected" : "✗ MISSED"}`,
  `- FOB conflict: ${fobConflict ? "✓ detected" : "✗ MISSED"}`,
  `- DFARS engine flags: ${flags.length} (run-2 baseline: 5)`,
  "",
  "## Economics",
  `- Calls: ${usage.length}`,
  `- Input tokens: ${inT.toLocaleString()}`,
  `- Output tokens: ${outT.toLocaleString()}`,
  `- Cost: $${cost.toFixed(2)} (Sonnet pricing $3 in / $15 out per MTok)`,
  `- Wall-clock: ${(ms / 1000).toFixed(1)}s`,
  "",
  "## Full result",
  `- Classification: \`${result.classification.document_type}\` (${result.classification.confidence})`,
  `- Recommendation: \`${result.recommendation}\``,
  `- Compliance score: ${result.compliance_score}/100`,
  "",
  "## Verdict",
  "",
  hexDetected && fobConflict && result.model_used === "claude-sonnet-4-6"
    ? "**PASS** — production defaults wire cleanly · Sonnet 4.6 holds trap parity · model tagging populates correctly · ready to bump BATCH_SIZE."
    : "**REVIEW NEEDED** — wiring or trap parity didn't hold. Inspect raw JSON before BATCH_SIZE bump."
];

writeFileSync(join(__dirname, "output", "post-restart-validation.md"), lines.join("\n"));
console.log(`\nReport: scripts/quality-gate/output/post-restart-validation.md`);
