// FALSIFICATION PROBE for the three-state Vercel env reader (scripts/audit-ai/vercel-env-state.ts).
//
// The bug being guarded against is not visible on a healthy variable: AUDIT_REPORT_V5 is plain and readable, so the
// old two-state reader printed the right answer for the right reason and looked correct. It only lied on the
// ENCRYPTED case — where it printed exactly the same sentence it prints for a variable that does not exist.
//
// So this probe is built around a NEGATIVE CONTROL: it runs the reader against a variable that is genuinely
// unreadable on this project (AUDIT_V5_SEAL, encrypted) and fails if the reader answers confidently. It also
// re-runs the OLD two-state expression on the same entry and prints what it would have concluded, so the delta
// between the two is measured rather than asserted.
//
// Read-only: one GET against the Vercel env API. No value is ever printed (Rule 32) — types, byte lengths and
// comparison outcomes only.
//   npx tsx scripts/audit-ai/_probe-env-three-state.ts
import * as dotenv from "dotenv";
import { classifyEnv, equals, describe, type RawVercelEnv } from "./vercel-env-state";
dotenv.config({ path: ".env.local", quiet: true });

const PROJ = "prj_oqyqfwO0qJmkSAO9Hvt7VxbLUToD";
const TEAM = "team_4FAowTLgslDBY6aZ0acPaES0";

const results: Array<{ name: string; pass: boolean; detail: string }> = [];
const check = (name: string, pass: boolean, detail: string) => { results.push({ name, pass, detail }); };

// OFFLINE fixture. A worktree has no .env.local, so without this the probe simply cannot run where the code is
// edited. Shapes are TRANSCRIBED from the real 2026-08-10 API response, not invented: AUDIT_REPORT_V5 came back
// type=plain value "true"; AUDIT_V5_SEAL came back type=encrypted with a 984-character `value`. The ciphertext here
// is filler of the right LENGTH — the reader only ever looks at type and length, never at the bytes.
const FIXTURE: RawVercelEnv[] = [
  { key: "AUDIT_REPORT_V5", value: "true", type: "plain", target: ["production"] },
  { key: "AUDIT_V5_SEAL", value: "x".repeat(984), type: "encrypted", target: ["production"] },
  { key: "AUDIT_V3_SECTION_ROUTING", value: "x".repeat(984), type: "encrypted", target: ["production"] },
];

(async () => {
  const token = process.env.VERCEL_TOKEN;
  let envs: RawVercelEnv[];
  if (token) {
    const res = await fetch(`https://api.vercel.com/v9/projects/${PROJ}/env?teamId=${TEAM}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { console.error(`Vercel env fetch failed — HTTP ${res.status}`); process.exit(1); }
    const j = await res.json() as { envs?: RawVercelEnv[] };
    envs = j.envs ?? [];
    console.log(`SOURCE: LIVE Vercel production · ${envs.filter((e) => e.target?.includes("production")).length} entries\n`);
  } else {
    // Say this loudly. Reporting fixture output as a live reading is the same error class this probe exists to catch.
    envs = FIXTURE;
    console.log(`SOURCE: ⚠ OFFLINE FIXTURE (VERCEL_TOKEN absent) · ${envs.length} transcribed entries.`);
    console.log(`        This proves the READER's logic. It is NOT a reading of production — nothing below is evidence about the live flag state.\n`);
  }

  // ── 1. READABLE. A plain var must classify readable and answer the comparison.
  const v5 = classifyEnv(envs, "AUDIT_REPORT_V5");
  console.log(`AUDIT_REPORT_V5           → ${describe(v5)} · === "true": ${equals(v5, "true")}`);
  check("readable var classifies readable", v5.state === "readable", `state=${v5.state}`);
  check("readable var yields a boolean, not null", typeof equals(v5, "true") === "boolean", `equals=${equals(v5, "true")}`);

  // ── 2. NEGATIVE CONTROL — the case the old reader got wrong. An encrypted var must classify unreadable, must
  //      carry a non-trivial ciphertext length, and equals() must be null. If any of these is false the fix is inert.
  const seal = classifyEnv(envs, "AUDIT_V5_SEAL");
  console.log(`AUDIT_V5_SEAL             → ${describe(seal)} · === "true": ${equals(seal, "true")}`);
  check("encrypted var classifies UNREADABLE", seal.state === "unreadable", `state=${seal.state}`);
  check("encrypted var refuses a boolean (null)", equals(seal, "true") === null, `equals=${equals(seal, "true")}`);
  check("encrypted `value` is ciphertext, not a flag", seal.state === "unreadable" && seal.valueBytes > 32, seal.state === "unreadable" ? `${seal.valueBytes} bytes` : "n/a");

  // ── 3. ABSENT. A key nobody has ever set must classify absent and answer FALSE — the code default really does
  //      apply, so this one is knowable. Absent and unreadable must not share an answer.
  const ghost = classifyEnv(envs, "AUDIT_PROBE_KEY_THAT_DOES_NOT_EXIST");
  console.log(`AUDIT_PROBE_…NOT_EXIST    → ${describe(ghost)} · === "true": ${equals(ghost, "true")}`);
  check("absent var classifies ABSENT", ghost.state === "absent", `state=${ghost.state}`);
  check("absent var yields false, not null", equals(ghost, "true") === false, `equals=${equals(ghost, "true")}`);
  check("ABSENT and UNREADABLE are distinguishable", ghost.state !== seal.state, `${ghost.state} vs ${seal.state}`);

  // ── 4. THE DELTA. Re-run the discarded two-state expression on the encrypted entry and show what it concluded.
  //      This is the measurement, not a claim: the old code answered "v4", confidently, about a variable it never read.
  const rawSeal = envs.find((e) => e.key === "AUDIT_V5_SEAL" && e.target?.includes("production"));
  const oldSaid = rawSeal ? (rawSeal.type === "plain" ? rawSeal.value : null) : null;   // the `continue` path, verbatim
  console.log(`\nOLD two-state logic on AUDIT_V5_SEAL → v5 = ${oldSaid ?? "(unset)"} → "served renderer = ${oldSaid === "true" ? "V5" : "v4"}"`);
  console.log(`NEW three-state logic on the same entry → ${equals(seal, "true") === null ? "refuses to name a renderer" : "names one"}`);
  check("old logic did produce a confident wrong-shaped verdict", oldSaid === null, "reached the (unset)→v4 branch");

  console.log("");
  for (const r of results) console.log(`${r.pass ? "✅" : "❌"} ${r.name}  [${r.detail}]`);
  const failed = results.filter((r) => !r.pass).length;
  const src = token ? "against LIVE production" : "against the OFFLINE FIXTURE — reader logic only, no claim about production";
  console.log(`\n${failed ? `PROBE FAILED — ${failed}/${results.length} checks red` : `PROBE PASSED — ${results.length}/${results.length} checks green, including the encrypted negative control`} (${src})`);
  process.exit(failed ? 1 : 0);
})();
