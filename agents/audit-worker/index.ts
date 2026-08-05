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
// ONLY flags that something actually reads. AUDIT_ENGINE_V2 and AUDIT_AGENTIC_PRIMARY
// were printed here until 2026-08-04 — commit 5dc9b18d deleted the code that read them
// when V1/V2 were purged, so for months this line invited an operator to confirm a
// setting that could not affect the run. Worse, being NAMED here was what let both pass
// the self-audit flag census as "referenced". A boot log that prints an inert flag is
// not neutral: it manufactures false confidence at exactly the moment someone is
// checking. There is no engine-selection flag any more (audit-executor-v3.ts:53).
// AUDIT_MAP_MODEL stays — a stray Opus override there re-introduces the per-doc cost bleed.
const flags = ["CLAUDE_TIMEOUT_MS", "AUDIT_AGENTIC", "AUDIT_MAP_MODEL", "AUDIT_ASYNC_ENQUEUE", "WORKER_POLL_MS"] as const;
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
