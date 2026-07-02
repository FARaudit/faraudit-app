// Card 217 Step 4 — render the customer-facing HTML report from a persisted run-record.
//   npx tsx scripts/audit-ai/card217-render-report.ts <run-record.json> <sol> <title> <agency> <naics>
// $0: reconstructs the Decision (deriveVerdict on the recorded inputs) → buildV3Payload → renderV3Report.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deriveVerdict } from "../../src/lib/audit-decide";
import { buildV3Payload, renderV3Report } from "../../src/lib/audit-v3-report";

const [recPath, sol, title, agency, naics] = process.argv.slice(2);
process.env.AUDIT_ELIGIBLE_TRISTATE = "true"; // prod state (mirror the run)
const rec = JSON.parse(readFileSync(recPath, "utf8"));
const decision = deriveVerdict(rec.result.inputs);
const cov = rec.result.coverage || { required: [], covered: [], missing: [], coreMissing: [] };
const payload = buildV3Payload(decision, cov, rec.result.findings, rec.meta?.startedAt);
const html = renderV3Report(payload, { solicitationNumber: sol, title, agency, naicsCode: naics, auditId: rec.meta?.runId });

const dir = `ceo/Solicitation + Export Reviews/${(sol || "run").replace(/[^A-Za-z0-9._-]/g, "_")}/`;
mkdirSync(dir, { recursive: true });
const out = `${dir}${sol}-card217-report.html`;
writeFileSync(out, html);
console.log(`verdict=${decision.verdict} eligible=${decision.eligible}`);
console.log(`report → ${out} (${html.length} bytes)`);
