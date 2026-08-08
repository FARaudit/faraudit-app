// ─────────────────────────────────────────────────────────────────────────────
// CERT PROVENANCE GATE — a typed certification must never clear a set-aside bar;
// an SBA-registered one must.
//
// This gate exists because the two halves were built years apart in effect: the
// engine's V2 discipline refuses `customer_asserted` records on floored
// namespaces, and NOTHING wrote the authoritative alternative. A gate on the
// producer alone would prove the records are well-formed and prove nothing about
// the outcome, so V6 below drives the REAL engine seam —
// buildBidderProfileFromCapability → firmStatus — and asserts the verdict.
//
//   V1  SAM's own sbaBusinessTypeDesc vocabulary → attr TABLE, hand-written from
//       the source strings, never recomputed from the mapper under test.
//   V2  shape — every emitted record is sam_api + verifiedAt + expiresAt.
//   V3  FAIL-CLOSED — inactive registration, missing or unparseable expiry, and
//       a null entity each emit NOTHING.
//   V4  an SBA type we cannot canonicalize emits nothing — never a guess.
//   V5  no size-class namespace is ever emitted (size is per-run only).
//   V6  END-TO-END through the engine: verified SATISFIES, asserted does NOT,
//       expired does NOT.
//   V7  PLANTED POSITIVES incl. today's exposure reproduced with the flag OFF.
//
// Run: npx tsx src/lib/cert-verification.test.ts
// ─────────────────────────────────────────────────────────────────────────────
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { verifiedCertRecords } from "./cert-verification";
import { buildBidderProfileFromCapability } from "./audit-bidder-profile";
import { firmStatus } from "./audit-decide";
import type { SamEntity } from "./sam-entity";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const NOW = "2026-07-30T00:00:00.000Z";
const FUTURE = "2027-06-01T00:00:00.000Z";
const PAST = "2026-01-01T00:00:00.000Z";

const entity = (over: Partial<SamEntity>): SamEntity => ({
  uei: "ABC123DEF456", legal_business_name: "Ridgeline Mfg", cage_code: "1A2B3",
  primary_naics: "336413", naics_codes: ["336413"], state: "TX", zip: "75001",
  business_types: [], certifications: [], sba_certifications: [], poc_name: null, poc_email: null, poc_phone: null,
  registration_status: "Active", registration_expiration: FUTURE, ...over,
});

// ═══ V1 · SAM's vocabulary → attr table ══════════════════════════════════════
console.log("\nV1 · sbaBusinessTypeDesc → eligibility attr");
const TABLE: Array<[string, string | null]> = [
  ["Service Disabled Veteran Owned Small Business", "se:sdvosb"],
  ["Women Owned Small Business", "se:wosb"],
  ["Economically Disadvantaged Women Owned Small Business", "se:edwosb"],
  ["8(a) Program Participant", "se:8a"],
  ["HUBZone Program", "se:hubzone"],
  ["Veteran Owned Business", "se:vosb"],
  ["Minority Owned Business", null],           // real SAM value, no set-aside program of its own
  ["Self-Certified Small Disadvantaged Business", null],
];
for (const [desc, want] of TABLE) {
  const recs = verifiedCertRecords(entity({ business_types: [desc] }), NOW);
  const got = recs.length ? recs[0].attr : null;
  ok(got === want, `${JSON.stringify(desc).slice(0, 52).padEnd(54)} → ${want ?? "(nothing)"}`,
     got === want ? "" : `got ${got ?? "(nothing)"}`);
}

// ═══ V2 · record shape ═══════════════════════════════════════════════════════
console.log("\nV2 · every emitted record carries provenance and both dates");
const multi = verifiedCertRecords(entity({
  business_types: ["Service Disabled Veteran Owned Small Business", "HUBZone Program", "Service Disabled Veteran Owned Small Business"],
}), NOW);
ok(multi.length === 2, `duplicate SBA types collapse`, `${multi.length} records`);
ok(multi.every(r => r.source === "sam_api"), `source is sam_api on every record`);
ok(multi.every(r => r.verifiedAt === NOW), `verifiedAt is the injected construction clock`);
ok(multi.every(r => r.expiresAt === FUTURE), `expiresAt is the SAM registration expiry`);

// ═══ V3 · fail-closed ════════════════════════════════════════════════════════
console.log("\nV3 · fail-closed — every uncertain input emits nothing");
const BT = ["Service Disabled Veteran Owned Small Business"];
ok(verifiedCertRecords(null, NOW).length === 0, `null entity → no records`);
ok(verifiedCertRecords(entity({ business_types: BT, registration_status: "Expired" }), NOW).length === 0, `expired registration → no records`);
ok(verifiedCertRecords(entity({ business_types: BT, registration_status: "Submitted" }), NOW).length === 0, `non-active status → no records`);
ok(verifiedCertRecords(entity({ business_types: BT, registration_status: null }), NOW).length === 0, `absent status → no records`);
ok(verifiedCertRecords(entity({ business_types: BT, registration_expiration: null }), NOW).length === 0, `no expiry → no records (no time anchor, no determination)`);
ok(verifiedCertRecords(entity({ business_types: BT, registration_expiration: "not a date" }), NOW).length === 0, `unparseable expiry → no records`);
ok(verifiedCertRecords(entity({ business_types: BT, registration_status: "A" }), NOW).length === 1, `status code "A" is accepted as active`);

// ═══ V4 + V5 · no guesses, no size class ═════════════════════════════════════
console.log("\nV4/V5 · unrecognized types emit nothing; size class never emitted");
const mixed = verifiedCertRecords(entity({ business_types: ["Minority Owned Business", "HUBZone Program", "Woman-Owned Business"] }), NOW);
ok(mixed.length === 2, `2 of 3 types canonicalize; the unrecognized one is dropped`, mixed.map(r => r.attr).join(" "));
const SIZE_NS = new Set(["sb", "size", "naics"]);
ok(mixed.every(r => !SIZE_NS.has(r.attr.split(":")[0])), `no sb:/size:/naics: record is ever produced`);
ok(mixed.every(r => r.attr.startsWith("se:")), `every emitted attr is socioeconomic`);

// ═══ V6 · END-TO-END through the real engine seam ════════════════════════════
console.log("\nV6 · the verdict, driven through buildBidderProfile → firmStatus");
const BAR = {
  requirement: "This acquisition is a total Service-Disabled Veteran-Owned Small Business set-aside.",
  excerpt: "Offers are solicited only from SDVOSB concerns.",
  requiredAttribute: "se:sdvosb",
} as never;
const verdictFor = (attributes_v2: unknown, flag: boolean) => {
  const prior = process.env.AUDIT_PROFILE_SCHEMA_V2;
  process.env.AUDIT_PROFILE_SCHEMA_V2 = flag ? "true" : "false";
  try {
    const profile = buildBidderProfileFromCapability(
      { certifications: ["SDVOSB"], attributes_v2 },
      { now: () => NOW, solicitationNaics: "336413" },
    );
    return firmStatus(BAR, profile);
  } finally {
    if (prior === undefined) delete process.env.AUDIT_PROFILE_SCHEMA_V2;
    else process.env.AUDIT_PROFILE_SCHEMA_V2 = prior;
  }
};
const verified = verifiedCertRecords(entity({ business_types: ["Service Disabled Veteran Owned Small Business"] }), NOW);
ok(verified.length === 1, `producer emitted the verified record to drive the engine with`);
ok(verdictFor(verified, true) === "satisfies",
   `SBA-registered SDVOSB → satisfies`, `got ${verdictFor(verified, true)}`);

const asserted = [{ attr: "se:sdvosb", source: "customer_asserted", verifiedAt: NOW, expiresAt: FUTURE }];
ok(verdictFor(asserted, true) !== "satisfies",
   `self-typed SDVOSB → does NOT satisfy`, `got ${verdictFor(asserted, true)}`);

const expired = [{ attr: "se:sdvosb", source: "sam_api", verifiedAt: PAST, expiresAt: PAST }];
ok(verdictFor(expired, true) !== "satisfies",
   `lapsed registration → does NOT satisfy`, `got ${verdictFor(expired, true)}`);

// ═══ V7 · planted positives ══════════════════════════════════════════════════
console.log("\nV7 · planted positives — this gate must be able to fail");
// P1 · REWRITTEN 2026-08-08, on the instruction this leg's own author left: "if this ever
// stops being true the flag has been hard-wired and this gate needs rewriting, not muting."
// It has. On the CEO ruling, the three `!profileSchemaV2Enabled() ||` escapes in firmStatus
// are gone, so the discipline is no longer flag-dependent and the exposure cannot be
// reproduced by unsetting a variable. The leg P1 actually played — proving this gate can
// FAIL — is preserved below by P1b, which goes red if the guard becomes a blanket wall.
ok(verdictFor(asserted, false) !== "satisfies",
   `P1 a typed cert is refused with the flag OFF too — the escape is gone`, `got ${verdictFor(asserted, false)}`);
ok(verdictFor(verified, false) === "satisfies",
   `P1b the guard is not a blanket wall — a SAM record clears its bar, flag OFF`, `got ${verdictFor(verified, false)}`);
// P2 · an authoritative source the engine does not recognize must not sneak through.
const bogus = [{ attr: "se:sdvosb", source: "trust_me", verifiedAt: NOW, expiresAt: FUTURE }];
ok(verdictFor(bogus, true) !== "satisfies", `P2 an unrecognized provenance source does not satisfy`);
// P3 · the producer must not be able to emit a record the engine would reject as malformed.
ok(verified.every(r => typeof r.attr === "string" && r.attr.includes(":") && !!r.verifiedAt && !!r.expiresAt),
   `P3 emitted records are well-formed for validAttributeRecords`);

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
