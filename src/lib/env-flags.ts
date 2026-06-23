/** Tolerant truthy env parse — accept true/1/yes/on (any case, trimmed) so a
 *  dashboard-set "True"/"1"/"on" doesn't silently leave a runtime flag OFF. Single
 *  source so every flag parses identically (no per-flag drift: the agentic-primary
 *  MAP only runs when AUDIT_ENGINE_V2 *and* AUDIT_AGENTIC_PRIMARY are both on, so a
 *  mismatched parser on one of them silently disables the whole path). */
export const isEnvOn = (v: string | undefined): boolean =>
  v != null && ["true", "1", "yes", "on"].includes(v.trim().toLowerCase());
