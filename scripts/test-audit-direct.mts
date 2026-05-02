import dotenv from "dotenv";
import { readFileSync } from "node:fs";

// Load env BEFORE the engine module evaluates (it captures
// process.env.ANTHROPIC_API_KEY at import time).
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not loaded — check .env.local / cwd is faraudit-app");
  process.exit(1);
}

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error("Usage: npx tsx scripts/test-audit-direct.mts <path-to-pdf> [noticeId] [title]");
  process.exit(1);
}

const pdfBase64 = readFileSync(pdfPath).toString("base64");
const solicitation = {
  noticeId: process.argv[3] || "TEST-001",
  title: process.argv[4] || "Test Solicitation",
  department: "Department of the Air Force",
  naicsCode: "336413"
};

console.log("Running audit on:", pdfPath);
console.log("Solicitation:", solicitation.noticeId);
console.log("---");

// Dynamic import AFTER env is loaded.
// @ts-expect-error tsx resolves this at runtime; TS strict imports don't permit .ts extensions
const engineNs: any = await import("../src/lib/audit-engine.ts");
const engine = engineNs.default ?? engineNs;
const runAudit = engine.runAudit;
if (typeof runAudit !== "function") {
  console.error("runAudit not found. Module shape:", Object.keys(engineNs), Object.keys(engine));
  process.exit(1);
}

const result = await runAudit({ solicitation, pdfBase64 });
console.log(JSON.stringify(result, null, 2));
