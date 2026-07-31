// Model registry — role→model config for the agentic engine.
//
// PRINCIPLE (plan of record · memory project_engine_call_architecture):
// bet on the ROLES, not the model. Engine LOGIC names a role (extractor / lens /
// crossdoc / judge); this is the ONE place a role binds to a concrete model ID.
// Models retire AND improve; every swap (forced or opportunistic) is a config
// change here + a gold-set re-run — never a code edit scattered across the engine.
//
// Each role honors an env override (so Railway can pin a model per role without a
// deploy), falling back to the curated default. Haiku-vs-Sonnet for the extractor
// is DATA-DECIDED in Stage 4 (gold-set A/B) — the default below is the starting
// hypothesis ("max capability, not max model": extraction is factual work → cheap).

export type ModelRole = "extractor" | "lens" | "crossdoc" | "judge" | "finder";

// Curated defaults. NOT permanent — Stage 4 decides extractor empirically; any
// model swap re-runs the gold set before adoption. No model ID lives in engine
// logic; they all live here.
const DEFAULTS: Record<ModelRole, string> = {
  extractor: "claude-haiku-4-5", // per-doc MAP — factual extraction, runs once/doc → cheap
  lens: "claude-sonnet-4-6",     // Stage 2 — overview/compliance/risk lenses over the compact matrix
  // OPUS 5 (2026-07-31). Same price as Opus 4.8 — $5/$25 per MTok, verified against the live pricing table —
  // so this buys capability at zero marginal cost. Opus 5 is documented strongest on exactly these two jobs:
  // deep reasoning, long-horizon agentic work, and high-precision/high-recall adversarial review. It also halves
  // the prompt-cache minimum (1024 → 512 tokens), which the compact-matrix cached prefix benefits from directly.
  // Per this file's own contract, a swap is a config change HERE plus a gold-set re-run — never scattered edits.
  crossdoc: "claude-opus-5",     // Stage 2.5 — cross-doc reasoning over the binding-doc subset
  judge: "claude-opus-5",        // final judgment over compact facts (the already-correct call 4)
  // L3 (Brain card 265/267) — grounded agentic section-finder. LOCATE-only (returns a verbatim anchor,
  // never a summary) + deterministic offset-string-match gate ⇒ a wrong locate is REJECTED, fails SAFE to
  // INCOMPLETE. Sonnet by "max capability, not max model": the gate — not the model — guarantees correctness.
  finder: "claude-sonnet-4-6",
};

// Per-role env override knobs. AUDIT_MAP_MODEL / AUDIT_MODEL are the pre-registry
// names already wired in Railway + the harness — kept so existing config keeps
// working; the new roles get fresh names.
const ENV_OVERRIDE: Record<ModelRole, string> = {
  extractor: "AUDIT_MAP_MODEL",
  lens: "AUDIT_LENS_MODEL",
  crossdoc: "AUDIT_CROSSDOC_MODEL",
  judge: "AUDIT_MODEL",
  finder: "AUDIT_FINDER_MODEL",
};

/** Resolve the model for a role: env override (trimmed, tolerant of stray spaces)
 *  else the curated default. The single source of truth for "which model runs this
 *  role" — engine code calls modelFor(role), never a literal model ID. */
export function modelFor(role: ModelRole): string {
  const override = process.env[ENV_OVERRIDE[role]]?.trim();
  return override && override.length > 0 ? override : DEFAULTS[role];
}

/** True when a model ID is an Opus-tier model — used to warn loudly when a cheap
 *  role (the per-doc extractor) is pinned to Opus, which re-introduces the
 *  per-document Opus cost bleed the agentic engine exists to eliminate. */
export function isOpusModel(model: string): boolean {
  return /opus/i.test(model);
}
