// A TYPED CERTIFICATION MAY NOT CLEAR A SET-ASIDE BAR — AND THAT MAY NOT DEPEND ON A VARIABLE.
//
// CEO ruling 2026-08-08. firmStatus used to read `!profileSchemaV2Enabled() || …` in THREE places
// — the closed-world customer-asserted exclusion, the exact-match fast path, and the canonical
// socioeconomic match — so with AUDIT_PROFILE_SCHEMA_V2 unset an asserted string returned
// "satisfies" with no provenance check at all. The variable was `true` in both production
// environments and its documented default was OFF: the safe behaviour was opt-in and the false-BID
// was the fallback.
//
// This gate is the thing that stays. It does not read the source for the absence of a string — a
// grep proves an author's phrasing, not a behaviour. It DRIVES firmStatus across every value the
// variable can take and asserts the answer does not move. Reintroducing any one of the three
// escapes turns this red.
//
// The mirror assertion matters as much: a SAM-verified record must still clear its bar on every
// flag value. A guard that refuses everything is not a fix, and would pass a one-sided gate.
import { buildBidderProfileFromCapability } from "./audit-bidder-profile";
import { firmStatus } from "./audit-decide";

let pass = 0, fail = 0;
function ok(cond: boolean, label: string, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}${got === undefined ? "" : `  [${String(got)}]`}`); }
  else { fail++; console.log(`  ✗ FAIL  ${label}  GOT: ${String(got)}`); }
}

const NOW = "2026-08-08T00:00:00.000Z";
const bar = (attr: string, requirement: string, excerpt: string) =>
  ({ requiredAttribute: attr, requirement, excerpt } as never);

const BARS = [
  bar("se:sdvosb", "This acquisition is a total SDVOSB set-aside; offerors must be a verified service-disabled veteran-owned small business.", "total SDVOSB set-aside"),
  bar("se:hubzone", "This acquisition is a total HUBZone set-aside; offerors must be a certified HUBZone firm.", "total HUBZone set-aside"),
  bar("se:8a", "This acquisition is set aside for 8(a) program participants.", "set aside for 8(a)"),
];
const TYPED = ["SDVOSB", "HUBZone", "8(a)"];

// Every value the variable can hold, including absent — the state a fresh environment starts in.
const FLAG_STATES: Array<[string, string | undefined]> = [["unset", undefined], ["false", "false"], ["true", "true"]];

function withFlag<T>(v: string | undefined, fn: () => T): T {
  const prior = process.env.AUDIT_PROFILE_SCHEMA_V2;
  if (v === undefined) delete process.env.AUDIT_PROFILE_SCHEMA_V2;
  else process.env.AUDIT_PROFILE_SCHEMA_V2 = v;
  try { return fn(); } finally {
    if (prior === undefined) delete process.env.AUDIT_PROFILE_SCHEMA_V2;
    else process.env.AUDIT_PROFILE_SCHEMA_V2 = prior;
  }
}

console.log("── a typed certification never clears its own bar, on any flag value ──");
for (const [name, value] of FLAG_STATES) {
  for (let i = 0; i < BARS.length; i++) {
    const status = withFlag(value, () => {
      const p = buildBidderProfileFromCapability(
        { certifications: [TYPED[i]], attributes_v2: [], size_facts: null } as never,
        { solicitationNaics: "336412", now: () => NOW });
      return firmStatus(BARS[i], p);
    });
    ok(status !== "satisfies", `flag ${name}: typed "${TYPED[i]}" does not clear its bar`, status);
  }
}

console.log("\n── ...and a SAM-verified record still does, on any flag value ──");
for (const [name, value] of FLAG_STATES) {
  const status = withFlag(value, () => {
    const p = buildBidderProfileFromCapability({
      certifications: [],
      attributes_v2: [{ attr: "se:hubzone", source: "sam_api", verifiedAt: "2026-01-01", expiresAt: "2027-06-01", uei: "ABCDEFGH1234" }],
      size_facts: null,
    } as never, { solicitationNaics: "336412", now: () => NOW });
    return firmStatus(BARS[1], p);
  });
  ok(status === "satisfies", `flag ${name}: a SAM-verified HUBZone record clears the HUBZone bar`, status);
}

console.log("\n── planted positives — this gate must be able to fail ──");
// P1 · the bar fixture is real: a profile that PROVES the program clears it, so the negatives above
// are a property of the provenance discipline and not of an unsatisfiable fixture.
{
  const p = withFlag("true", () => buildBidderProfileFromCapability({
    certifications: [],
    attributes_v2: [{ attr: "se:sdvosb", source: "sba_api", verifiedAt: "2026-01-01", expiresAt: "2029-01-01", uei: "ABCDEFGH1234" }],
    size_facts: null,
  } as never, { solicitationNaics: "336412", now: () => NOW }));
  ok(withFlag("true", () => firmStatus(BARS[0], p)) === "satisfies",
    "P1 the SDVOSB bar IS clearable by proof — the negatives are not a dead fixture");
}
// P2 · the typed profile really did carry the token, so "does not clear" is the DISCIPLINE
// declining it and not the builder quietly dropping the string before firmStatus ever saw it.
{
  const p = withFlag("true", () => buildBidderProfileFromCapability(
    { certifications: ["SDVOSB"], attributes_v2: [], size_facts: null } as never,
    { solicitationNaics: "336412", now: () => NOW }));
  ok((p?.satisfiedAttributes ?? []).includes("se:sdvosb"),
    "P2 the typed token reaches satisfiedAttributes — it is refused, not absent",
    JSON.stringify(p?.satisfiedAttributes));
}
// P3 · the harness observes a real difference between flag values when one exists, so the
// "identical on every flag value" claim above is not vacuous.
{
  const seen = FLAG_STATES.map(([, v]) => withFlag(v, () => process.env.AUDIT_PROFILE_SCHEMA_V2 ?? "unset"));
  ok(new Set(seen).size === FLAG_STATES.length,
    "P3 withFlag genuinely sets each distinct value", JSON.stringify(seen));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed · ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
