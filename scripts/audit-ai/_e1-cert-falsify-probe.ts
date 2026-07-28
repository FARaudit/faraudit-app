// Can _e1-cert-flagoff-report.ts actually go RED? A cert that only ever prints green is a placebo.
// This injects a divergent excerptPreReground into one record and asserts the differential CATCHES it.
import * as fs from "fs";
import * as path from "path";
import { RUN_RECORD_SCHEMA, type RunRecord } from "../../src/lib/audit-run-record";
import { buildV4Data } from "../../src/lib/v4-report/build-data";
import { buildV3Payload } from "../../src/lib/audit-v3-report";
import type { Decision } from "../../src/lib/audit-decide";

delete process.env.AUDIT_EXCERPT_HEAD_REGROUND;
process.env.AUDIT_SEVERITY_HONEST = "true";
const strip = (f: Record<string, unknown>) => { const { excerptPreReground: _d, ...rest } = f; return rest; };
const DIR = path.join(__dirname, "run-records");

// find a record with two findings sharing a clause head after synthetic widening
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".run-record.json"))) {
  let rec: RunRecord;
  try { rec = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")); if (rec?.schema !== RUN_RECORD_SCHEMA) continue; } catch { continue; }
  const f0 = (rec.result?.findings ?? []) as unknown as Record<string, unknown>[];
  if (f0.length < 2 || !f0[0].excerpt || !f0[1].excerpt) continue;

  const HEAD = "The Contractor shall comply with the following provisions of this solicitation, without exception, ";
  const mutated = f0.map((f, i) => i < 2 ? { ...f, excerpt: HEAD + String(f.excerpt), excerptPreReground: f.excerpt } : f);

  const decision = { verdict: "BID_WITH_CAUTION", eligible: null, reason: "", dispositions: [], showStoppers: [] } as unknown as Decision;
  const cov = { required: [], covered: [], missing: [], coreMissing: [] };
  const mk = (xs: Record<string, unknown>[]) => buildV4Data({ compliance_json: { v3: buildV3Payload(decision, cov as never, xs as never, "2026-07-27T00:00:00Z"), engine: "agentic_v3" } } as never);

  const A = JSON.stringify(mk(mutated));          // keys off the ANALYZED span → two rows survive
  const B = JSON.stringify(mk(mutated.map(strip))); // keys off the widened display span → they collide
  console.log(`record: ${file}`);
  console.log(`A === B ? ${A === B}`);
  console.log(A !== B
    ? "✅ FALSIFIABLE — the differential detects a divergent analyzed span, so a green run is meaningful"
    : "❌ PLACEBO — the differential cannot distinguish the two, the cert proves nothing");
  process.exit(A !== B ? 0 : 1);
}
console.log("❌ no suitable record found");
process.exit(1);
