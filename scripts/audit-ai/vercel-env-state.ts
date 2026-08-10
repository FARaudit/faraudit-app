// Three-state reader for a Vercel project env var. Shared, because the two-state version of this was wrong in the
// same way in several scripts at once.
//
// The Vercel env API returns every variable in the list, but only a `plain` one carries a readable `value`. For an
// `encrypted` or `sensitive` variable the `value` field is CIPHERTEXT — AUDIT_V5_SEAL comes back as 984 characters.
// A reader that filters with `if (e.type !== "plain") continue` therefore collapses two different worlds into one:
// a variable that does not exist, and a variable that exists and is set to exactly the value being tested for. Both
// leave the local variable null, both print the same sentence, and that sentence is phrased as a fact about
// production. Comparing `=== "true"` against ciphertext is not a false answer, it is a meaningless one.
//
// So callers get three states and are forced to handle the middle one:
//   absent      — no entry for that key on that target. The code default decides, and the code default is readable.
//   unreadable  — the entry exists; its value cannot be read through this API. Nothing about the value is knowable.
//   readable    — plain, with a string value.
//
// No helper here ever returns or prints the value itself (Rule 32) — only comparison outcomes and byte lengths.

export type RawVercelEnv = { key?: string; value?: string; type?: string; target?: string[] };

export type EnvState =
  | { state: "absent"; key: string }
  | { state: "unreadable"; key: string; type: string; valueBytes: number }
  | { state: "readable"; key: string; value: string };

/** The only `type` whose `value` field is the real value rather than ciphertext. */
const READABLE_TYPE = "plain";

export function classifyEnv(envs: RawVercelEnv[], key: string, target = "production"): EnvState {
  const hit = envs.find((e) => e.key === key && Array.isArray(e.target) && e.target.includes(target));
  if (!hit) return { state: "absent", key };
  if (hit.type === READABLE_TYPE && typeof hit.value === "string") return { state: "readable", key, value: hit.value };
  return {
    state: "unreadable",
    key,
    type: typeof hit.type === "string" ? hit.type : "(no type field)",
    valueBytes: typeof hit.value === "string" ? Buffer.byteLength(hit.value, "utf8") : 0,
  };
}

/**
 * Does this variable equal `expected` on production? `null` means UNKNOWABLE, not false — the caller must not
 * collapse it into a boolean. Absent is a real `false`: the variable is not set, so the code default applies.
 */
export function equals(s: EnvState, expected: string): boolean | null {
  if (s.state === "readable") return s.value === expected;
  if (s.state === "absent") return false;
  return null;
}

/** One line of state, safe to print: never the value, only its type and ciphertext length. */
export function describe(s: EnvState): string {
  switch (s.state) {
    case "absent": return `${s.key}: ABSENT on production (no entry) — the code default decides`;
    case "unreadable": return `${s.key}: PRESENT but NOT READABLE (type=${s.type}, value field is ${s.valueBytes} bytes of ciphertext) — its value is unknown here`;
    case "readable": return `${s.key}: PRESENT and readable (type=plain, ${Buffer.byteLength(s.value, "utf8")} bytes)`;
  }
}

/**
 * The production vars matching `prefix` whose values cannot be read here — reported as `KEY(type)`, never a value.
 * Read-only: it hydrates nothing. Every key it names is OFF in the current process and may be ON in production, so
 * any render performed after a plain-only hydration is at production's flag state only for the flags NOT listed.
 * A script that prints "the served surface" while this list is non-empty is overstating what it measured.
 */
export function unreadableProductionEnvKeys(envs: RawVercelEnv[], prefix = "AUDIT_", target = "production"): string[] {
  return envs
    .filter((e) => typeof e.key === "string" && e.key.startsWith(prefix) && Array.isArray(e.target) && e.target.includes(target))
    .filter((e) => !(e.type === READABLE_TYPE && typeof e.value === "string"))
    .map((e) => `${e.key}(${e.type ?? "?"})`);
}

/**
 * Hydrate process.env from the readable production vars matching `prefix`, and report what was NOT readable.
 * The unreadable list is the point: a render performed after this call is at production's flag state only for the
 * flags in `applied`. Any flag in `unreadable` is silently OFF locally and may be ON in production.
 */
export function applyReadableProductionEnv(envs: RawVercelEnv[], prefix = "AUDIT_", target = "production"): { applied: string[]; unreadable: string[] } {
  const applied: string[] = [];
  const unreadable: string[] = [];
  for (const e of envs) {
    if (typeof e.key !== "string" || !e.key.startsWith(prefix)) continue;
    if (!Array.isArray(e.target) || !e.target.includes(target)) continue;
    if (e.type === READABLE_TYPE && typeof e.value === "string") { process.env[e.key] = e.value; applied.push(e.key); }
    else unreadable.push(`${e.key}(${e.type ?? "?"})`);
  }
  return { applied, unreadable };
}
