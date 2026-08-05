/** Tolerant truthy env parse — accept true/1/yes/on (any case, trimmed) so a
 *  dashboard-set "True"/"1"/"on" doesn't silently leave a runtime flag OFF.
 *  Single source so every flag parses identically (no per-flag drift).
 *
 *  This is not hypothetical: the live audit-worker service carries
 *  AUDIT_AGENTIC_PRIMARY=True — capital T, typed into the Railway dashboard.
 *  A raw `=== "true"` reads that as OFF.
 *
 *  Uniformity is ENFORCED, not merely documented: a raw comparison of any
 *  process.env value against "true"/"false" fails
 *  scripts/audit-ai/_cert-env-flag-parse-uniformity.ts. Without that gate this
 *  comment was false for 201 read sites. */
export const isEnvOn = (v: string | undefined): boolean =>
  v != null && ["true", "1", "yes", "on"].includes(v.trim().toLowerCase());

/** Tolerant FALSY parse, for DEFAULT-ON flags — written `!isEnvOff(process.env.X)`.
 *
 *  A default-ON flag must NOT be expressed as `isEnvOn`: unset has to stay ON, so
 *  the test is for an explicit off-value, never for the absence of an on-value.
 *  Same tolerance in the other direction — a dashboard-set "False"/"0"/"off" must
 *  actually disable the path, which a raw `!== "false"` does not.
 *
 *  The two directions fail oppositely, which is why both parsers exist: a
 *  mis-cased ON value silently disables a feature, a mis-cased OFF value silently
 *  leaves one running. Neither is caught by testing only the other. */
export const isEnvOff = (v: string | undefined): boolean =>
  v != null && ["false", "0", "no", "off"].includes(v.trim().toLowerCase());
