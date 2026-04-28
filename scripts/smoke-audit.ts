/**
 * FARaudit static smoke verification.
 *
 * Runs in Node (no browser). Confirms every layer of the audit pipeline is
 * present and contracted correctly. This is the next-best-thing to a true
 * end-to-end browser test from a CLI.
 *
 *   ANTHROPIC_API_KEY=… node --import tsx scripts/smoke-audit.ts
 *
 * Test stages:
 *   1) Module presence: lib/audit-engine, lib/sam, api/audit, api/ko-email,
 *      api/ko-email/send, schema migrations
 *   2) Surface area: classifyDocument, runAudit, parseDFARSTraps,
 *      KO email send columns
 *   3) DFARS trap configuration: 252.223-7008, 252.204-7018, 252.204-7021
 *   4) Live classifier round-trip if ANTHROPIC_API_KEY is set
 *
 * Exits non-zero on the first failure so CI can gate releases.
 */

import { promises as fs } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const failures: string[] = [];
const okMarks: string[] = [];

async function exists(rel: string): Promise<boolean> {
  try {
    await fs.access(resolve(root, rel));
    return true;
  } catch {
    return false;
  }
}

async function read(rel: string): Promise<string> {
  return fs.readFile(resolve(root, rel), "utf-8");
}

function check(label: string, condition: boolean, detail = "") {
  if (condition) okMarks.push(`✓ ${label}`);
  else failures.push(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main(): Promise<void> {
  // 1) Presence
  check("audit engine present", await exists("src/lib/audit-engine.ts"));
  check("audit API route", await exists("src/app/api/audit/route.ts"));
  check("KO email draft route", await exists("src/app/api/ko-email/route.ts"));
  check("KO email send route", await exists("src/app/api/ko-email/send/route.ts"));
  check("doc-type migration", await exists("schema/audits_doc_type.sql"));
  check("KO email migration", await exists("schema/audits_ko_email.sql"));
  check("how-it-works page", await exists("app/how-it-works/page.tsx"));
  check("lifecycle html", await exists("public/lifecycle/index.html"));

  // 2) Surface area
  if (await exists("src/lib/audit-engine.ts")) {
    const engine = await read("src/lib/audit-engine.ts");
    check("classifyDocument exported", /export\s+async\s+function\s+classifyDocument/.test(engine));
    check("runAudit exported", /export\s+async\s+function\s+runAudit/.test(engine));
    check("parseDFARSTraps exported", /export\s+function\s+parseDFARSTraps/.test(engine));
    check("DFARS 252.223-7008 trap", engine.includes("252.223-7008"));
    check("DFARS 252.204-7018 trap", engine.includes("252.204-7018"));
    check("DFARS 252.204-7021 trap", engine.includes("252.204-7021"));
  }
  if (await exists("src/app/api/audit/route.ts")) {
    const auditRoute = await read("src/app/api/audit/route.ts");
    check("audit route persists document_type", auditRoute.includes("document_type"));
    check("audit route persists classification rationale", auditRoute.includes("document_type_rationale"));
    check("audit route enforces auth", /supabase\.auth\.getUser/.test(auditRoute));
    check("audit route rate-limited", /checkRateLimit/.test(auditRoute));
    check("audit route validates PDF magic bytes", /isPdfMagicValid/.test(auditRoute));
  }
  if (await exists("src/app/api/ko-email/send/route.ts")) {
    const sendRoute = await read("src/app/api/ko-email/send/route.ts");
    check("KO send uses Resend", /Resend/.test(sendRoute));
    check("KO send writes ko_email_sent flag", /ko_email_sent\b/.test(sendRoute));
    check("KO send records message id", /ko_email_message_id/.test(sendRoute));
    check("KO send validates recipient email", /EMAIL_RX/.test(sendRoute));
  }

  // 3) Migration content
  if (await exists("schema/audits_doc_type.sql")) {
    const sql = await read("schema/audits_doc_type.sql");
    check("doc_type SQL adds document_type column", /document_type\s+TEXT/i.test(sql));
    check("doc_type SQL adds rationale column", /document_type_rationale/.test(sql));
    check("doc_type SQL adds confidence column", /document_type_confidence/.test(sql));
  }

  // 4) Live classifier round-trip — only if Anthropic key + classifier importable
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { classifyDocument } = await import("../src/lib/audit-engine.js");
      const sample = JSON.stringify({
        title: "Tower assembly fabrication",
        type: "Combined Synopsis/Solicitation",
        description: "Performance Work Statement for fabrication and finish."
      });
      const result = await classifyDocument(sample, null);
      check(
        "classifier returns DocumentType",
        ["SOW", "PWS", "SOO", "RFP", "RFQ", "IFB", "Sources Sought", "Other"].includes(result.document_type),
        `got "${result.document_type}"`
      );
      check("classifier provides rationale", typeof result.rationale === "string" && result.rationale.length > 0);
    } catch (err) {
      failures.push(`✗ classifier round-trip threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    okMarks.push("⊙ classifier round-trip skipped (no ANTHROPIC_API_KEY)");
  }

  // Report
  console.log("");
  console.log("FARaudit smoke results");
  console.log("──────────────────────");
  for (const o of okMarks) console.log(o);
  if (failures.length > 0) {
    console.log("");
    console.log("Failures:");
    for (const f of failures) console.log(f);
    process.exit(1);
  }
  console.log("");
  console.log(`${okMarks.length} checks passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
