// One-shot: sweep expired pending audits so they stop polluting the dashboard.
//
// Marks pending_audits rows where status='pending' AND response_deadline < now()
// as status='failed' with error_message='response_deadline expired before scoring',
// and mirrors the same flip to audits rows with audit_source='opportunities_pin'
// and status='pending'. Safe to re-run (idempotent — once a row is 'failed' it
// no longer matches the filter).
//
// Run locally:   npx dotenv -e .env.local -- tsx agents/audit-ai/cleanup-expired.ts
// Run on Railway: invoked as a pre-cron step from agents/audit-ai/index.ts.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// @ts-expect-error tsx runtime resolves .ts; tsc strict imports forbid the extension
const { cleanupExpired } = await import("./queue.ts");

const result = await cleanupExpired();
console.log(`[cleanup-expired] swept pending_audits=${result.pending_audits} · audits=${result.audits}`);
