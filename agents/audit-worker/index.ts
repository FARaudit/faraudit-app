// FA-116 — audit-worker entry point.
//
// Resident Railway service (NOT a cron) that claims user-enqueued rows from
// pending_audits (source='user') and runs the same executeAudit() pipeline as
// the sync /api/audit route. Deployed with Root Directory = / so it imports
// src/lib directly — the vendored-engine drift that left agents/audit-ai
// without runAuditV2 (audit-engine.ts:1998) is exactly what this avoids.
//
// Env: ANTHROPIC_API_KEY · SAM_API_KEY · NEXT_PUBLIC_SUPABASE_URL ·
//      SUPABASE_SERVICE_ROLE_KEY · WORKER_POLL_MS (default 10000)
//
// src/lib/audit-engine.ts captures env at module-init, so dotenv must run
// before the worker module (and its static @/lib imports) is evaluated —
// hence the dynamic import. Repo root package.json is CJS (no "type" field),
// so no top-level await: plain promise chain.

import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "SAM_API_KEY"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[audit-worker] missing env: ${missing.join(", ")}`);
  process.exit(1);
}

// FA-124 — boot logs the effective env so deploy verification doesn't depend
// on dashboard screenshots. Flag values are printed; secrets are presence-only.
// Includes the agentic flags so a deploy can CONFIRM the agentic-primary path is
// actually ON (a mistyped/unset flag silently runs the old V2 single-pass path and
// the run would otherwise look fine). AUDIT_MAP_MODEL is printed too — a stray Opus
// override there would re-introduce the per-doc cost bleed.
const flags = ["CLAUDE_TIMEOUT_MS", "AUDIT_ENGINE_V2", "AUDIT_AGENTIC", "AUDIT_AGENTIC_PRIMARY", "AUDIT_MAP_MODEL", "AUDIT_ASYNC_ENQUEUE", "WORKER_POLL_MS"] as const;
console.log(
  "[audit-worker] effective env ·",
  flags.map((k) => `${k}=${process.env[k] ?? "(unset)"}`).join(" · "),
  "·",
  required.map((k) => `${k}=present`).join(" · ")
);

import("./worker")
  .then((m) => m.runWorker())
  .catch((err) => {
    console.error("[audit-worker] fatal:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
