// PROFILE-INDEPENDENCE GATE (Brain's hard constraint on 2a).
//
// "One row is not a customer object — a schema plus a single row populated by a
// one-off PR is a fixture with a table around it." With n=1 no test can tell
// "reads the profile" from "hardcoded to this profile", which is the exact defect
// class one layer up from a NAICS list that was assembled rather than chosen.
//
// So: two STRUCTURALLY DIFFERENT profiles must produce two different scopes, and
// a profile with no codes must produce an honest-empty — never a fallback to the
// global list. No network, no real Supabase: we stub the client at the leaf.
//
// Run: npx tsx src/lib/bd-os/feed-scope.test.ts

import { resolveFeedScope } from "./live-opportunities";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

// Leaf stub: only `.from().select().maybeSingle()` is exercised by resolveFeedScope.
function clientWith(naics: string[] | null, opts: { error?: boolean } = {}): any {
  return {
    from() {
      return {
        select() {
          return {
            maybeSingle: async () =>
              opts.error
                ? { data: null, error: { message: "rls denied" } }
                : { data: naics === null ? null : { naics_codes: naics }, error: null }
          };
        }
      };
    }
  };
}

async function main() {
  const savedEnv = process.env.NAICS_CODES;
  delete process.env.NAICS_CODES; // no operator override during the profile cases

  console.log("\n═══ PROFILE-INDEPENDENCE — two different real profiles ═══");
  // Profile 1 = the populated production row (Apex): aircraft parts + machining.
  const p1 = await resolveFeedScope(clientWith(["336413", "332710", "332721"]));
  // Profile 2 = structurally different: different codes, no overlap, no SDVOSB.
  const p2 = await resolveFeedScope(clientWith(["541330", "561210"]));

  ok(p1.source === "profile" && p2.source === "profile", "both profiles resolve from the profile", `${p1.source} / ${p2.source}`);
  ok(JSON.stringify(p1.codes) !== JSON.stringify(p2.codes),
    "two different profiles produce DIFFERENT scopes (not hardcoded to one)",
    `[${p1.codes}] vs [${p2.codes}]`);
  ok(p1.codes.join(",") === "336413,332710,332721", "profile 1 scope is exactly its own codes", p1.codes.join(","));
  ok(p2.codes.join(",") === "541330,561210", "profile 2 scope is exactly its own codes", p2.codes.join(","));
  ok(!p1.codes.includes("332720") && !p2.codes.includes("332720"),
    "the retired hardcoded 332720 (0 live rows) is gone from both scopes");
  ok(p1.codes.includes("332721"), "332721 — a real customer code the old list NEVER queried — is now queried");

  console.log("\n═══ FAIL-CLOSED — no profile codes must NOT fall back to a global list ═══");
  const empty = await resolveFeedScope(clientWith([]));
  ok(empty.codes.length === 0 && empty.source === "no-profile-codes",
    "empty naics_codes → honest-empty scope, never the global fallback", `source=${empty.source}`);
  const noRow = await resolveFeedScope(clientWith(null));
  ok(noRow.codes.length === 0 && noRow.source === "no-profile-codes",
    "no profile row at all → honest-empty scope");
  const denied = await resolveFeedScope(clientWith(null, { error: true }));
  ok(denied.codes.length === 0 && denied.source === "no-profile-codes",
    "profile read ERROR → honest-empty scope (never a permissive fallback)");

  console.log("\n═══ PLANTED POSITIVE — prove this gate can fail ═══");
  // The pre-fix behaviour: a constant global list regardless of the customer.
  const OLD = "336413,332710,332720,332999,334511";
  const oldScope = (_client: unknown) => OLD.split(",");
  ok(oldScope(clientWith(["336413"])).join(",") === oldScope(clientWith(["541330"])).join(","),
    "planted: OLD logic returns an IDENTICAL scope for two different profiles");
  ok(JSON.stringify(p1.codes) !== JSON.stringify(p2.codes),
    "…and the gate's own assertion rejects that shape");
  ok(oldScope(clientWith([])).length > 0 && empty.codes.length === 0,
    "planted: OLD logic served a global feed to a customer with no codes; NEW serves honest-empty");

  console.log("\n═══ OPERATOR OVERRIDE — scripts/probes with no user session ═══");
  process.env.NAICS_CODES = "336413";
  const override = await resolveFeedScope(clientWith([]));
  ok(override.source === "env-override" && override.codes.join(",") === "336413",
    "env override applies ONLY when the profile has no codes", `source=${override.source}`);
  const profileWins = await resolveFeedScope(clientWith(["999999"]));
  ok(profileWins.source === "profile" && profileWins.codes.join(",") === "999999",
    "the customer's profile OUTRANKS the env override");
  if (savedEnv === undefined) delete process.env.NAICS_CODES; else process.env.NAICS_CODES = savedEnv;

  console.log(`\n══════ ${pass} passed · ${fail} failed ══════`);
  if (fail > 0) { console.error("PROFILE-INDEPENDENCE GATE FAILED"); process.exit(1); }
  console.log("profile-independence gate clean.");
}
main();
