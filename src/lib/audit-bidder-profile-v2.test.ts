// $0 proof — U-C construction side: capability row → V2 BidderProfile (attributes + asOf + per-run size).
// Run: npx tsx src/lib/audit-bidder-profile-v2.test.ts
//
// Written RED-FIRST against the pre-extension builder (every V2 leg must FAIL before the
// implementation lands — battery doctrine: a probe proven RED is the only probe trusted GREEN).
//
// Invariants under test:
//  • FLAG OFF ⇒ byte-identical legacy output even when the row carries attributes_v2/size_facts.
//  • FLAG ON, no V2 data ⇒ byte-identical legacy output (no asOf/attributes keys materialize).
//  • V2 records: validated (bad source/attr dropped, jsonb nulls tolerated), attrs join
//    satisfiedAttributes, asOf stamped from the injected construction clock.
//  • Size: computed PER-RUN vs THIS solicitation's NAICS from affiliate-inclusive facts —
//    small ⇒ naics:<code>-small + sb:total records carrying the facts' source; not-small or
//    unknown standard or missing fact-kind ⇒ NO emission (open-world, never a false INELIGIBLE).
//  • End-to-end firmStatus: sba_api SDVOSB record clears a pure SDVOSB bar; expired record
//    (expiresAt ≤ asOf) refuses; customer_asserted-only floored namespace refuses.

import { buildBidderProfileFromCapability } from "./audit-bidder-profile";
import { firmStatus } from "./audit-decide";
import type { TypedFinding } from "./audit-findings";

let pass = 0; let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const ok = g === w;
  if (ok) pass++; else fail++;
  console.log(`${ok ? "✓ PASS" : "✗ FAIL"}  ${label}${ok ? "" : `  — got ${g} want ${w}`}`);
};
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✓ PASS" : "✗ FAIL"}  ${label}${cond ? "" : `  — ${detail}`}`);
};

const NOW = "2026-07-29T12:00:00.000Z";
const nowFn = () => NOW;
const FLAG = "AUDIT_PROFILE_SCHEMA_V2";

const v2row = {
  certifications: ["SDVOSB"],
  attributes_v2: [
    { attr: "se:sdvosb", source: "sba_api", verifiedAt: "2026-07-15", expiresAt: "2029-07-15" },
    { attr: "registration:SAM-active", source: "sam_api", verifiedAt: "2026-07-15", expiresAt: "2027-05-01" },
  ],
  size_facts: { receiptsAvg3yrAffiliateInclusiveUsd: 28_400_000, employeesAffiliateInclusive: 185, source: "verified_import", verifiedAt: "2026-07-15" },
};

// ── 1 · CONSTRUCTION NO LONGER READS THE FLAG (CEO ruling 2026-08-08) ──
// This leg used to assert that with the flag OFF a V2 row degrades to the legacy shape. It was
// rewritten rather than muted: gating construction while the satisfy discipline in firmStatus is
// unconditional builds a WALL — the records that CAN clear a bar never reach the profile, so a
// SAM-verified firm and a firm asserting the same string both come back `unknown`. Refusing a
// claim is the ruling; refusing the proof is not. The row now builds identically either way, and
// the assertion below is the SAME OBJECT the flag-ON leg expects — that is the point.
delete process.env[FLAG];
eq("flag OFF: a V2 row still builds the record-bearing profile",
  buildBidderProfileFromCapability(v2row as any, { solicitationNaics: "236220", now: nowFn }),
  {
    satisfiedAttributes: ["se:sdvosb", "registration:SAM-active", "naics:236220-small", "sb:total"],
    openWorld: true,
    attributes: [
      { attr: "se:sdvosb", source: "sba_api", verifiedAt: "2026-07-15", expiresAt: "2029-07-15" },
      { attr: "registration:SAM-active", source: "sam_api", verifiedAt: "2026-07-15", expiresAt: "2027-05-01" },
      { attr: "naics:236220-small", source: "verified_import", verifiedAt: "2026-07-15", expiresAt: "2027-07-15T00:00:00.000Z" },
      { attr: "sb:total", source: "verified_import", verifiedAt: "2026-07-15", expiresAt: "2027-07-15T00:00:00.000Z" },
    ],
    asOf: "2026-07-29T12:00:00.000Z",
  });

// ── 2 · flag ON, plain legacy row ⇒ byte-identical legacy ──
process.env[FLAG] = "true";
eq("flag ON, no V2 data: legacy row unchanged",
  buildBidderProfileFromCapability({ certifications: ["SDVOSB"] }, { solicitationNaics: "236220", now: nowFn }),
  { satisfiedAttributes: ["se:sdvosb"], openWorld: true });
eq("flag ON, empty row still null", buildBidderProfileFromCapability({ certifications: [] }, { now: nowFn }), null);

// ── 3 · flag ON + V2 records ──
const p = buildBidderProfileFromCapability(v2row as any, { solicitationNaics: "236220", now: nowFn });
ok("V2: profile built", p !== null);
eq("V2: asOf stamped from the construction clock", p?.asOf, NOW);
ok("V2: satisfiedAttributes carries the v2 attrs",
  !!p && p.satisfiedAttributes.includes("se:sdvosb") && p.satisfiedAttributes.includes("registration:SAM-active"),
  JSON.stringify(p?.satisfiedAttributes));
ok("V2: attribute records attached with provenance",
  !!p?.attributes && p.attributes.some((r) => r.attr === "se:sdvosb" && r.source === "sba_api" && r.expiresAt === "2029-07-15"),
  JSON.stringify(p?.attributes));
ok("V2: stays open-world (closedWorld never set)", p?.closedWorld === undefined, JSON.stringify(p));

// ── 4 · per-run size vs THIS solicitation NAICS ──
ok("size: 236220 ($45M std) @ $28.4M ⇒ naics:236220-small emitted",
  !!p?.attributes && p.attributes.some((r) => r.attr === "naics:236220-small" && r.source === "verified_import"),
  JSON.stringify(p?.attributes));
ok("size: small ⇒ sb:total emitted with the facts' source",
  !!p?.attributes && p.attributes.some((r) => r.attr === "sb:total" && r.source === "verified_import"),
  JSON.stringify(p?.attributes));
const pEmp = buildBidderProfileFromCapability(v2row as any, { solicitationNaics: "336413", now: nowFn });
ok("size: 336413 (1,250-employee std) @ 185 ⇒ naics:336413-small emitted",
  !!pEmp?.attributes && pEmp.attributes.some((r) => r.attr === "naics:336413-small"),
  JSON.stringify(pEmp?.attributes));
const pBig = buildBidderProfileFromCapability(v2row as any, { solicitationNaics: "561730", now: nowFn });
ok("size: 561730 ($9.5M std) @ $28.4M ⇒ NOT small — no size record, no sb:total",
  !!pBig?.attributes && !pBig.attributes.some((r) => r.attr.startsWith("naics:") || r.attr === "sb:total"),
  JSON.stringify(pBig?.attributes));
const pUnk = buildBidderProfileFromCapability(v2row as any, { solicitationNaics: "999999", now: nowFn });
ok("size: unknown NAICS ⇒ no size emission (honest-fail, never a guessed threshold)",
  !!pUnk?.attributes && !pUnk.attributes.some((r) => r.attr.startsWith("naics:") || r.attr === "sb:total"),
  JSON.stringify(pUnk?.attributes));
const pNoFact = buildBidderProfileFromCapability(
  { ...v2row, size_facts: { employeesAffiliateInclusive: 185, source: "verified_import", verifiedAt: "2026-07-15" } } as any,
  { solicitationNaics: "236220", now: nowFn });
ok("size: receipts standard but only employee fact ⇒ no emission (missing fact-kind = unknown)",
  !!pNoFact?.attributes && !pNoFact.attributes.some((r) => r.attr.startsWith("naics:") || r.attr === "sb:total"),
  JSON.stringify(pNoFact?.attributes));

// ── 4b · size freshness + doctrine (verification round F5/F2) ──
const pNoVer = buildBidderProfileFromCapability(
  { ...v2row, size_facts: { receiptsAvg3yrAffiliateInclusiveUsd: 28_400_000, source: "verified_import" } } as any,
  { solicitationNaics: "236220", now: nowFn });
ok("size F5: facts WITHOUT verifiedAt ⇒ no emission (freshness discipline — stale-forever forbidden)",
  !pNoVer?.attributes?.some((r) => r.attr.startsWith("naics:") || r.attr === "sb:total"),
  JSON.stringify(pNoVer?.attributes));
ok("size F5: emitted size records carry expiresAt = verifiedAt + 1 year",
  !!p?.attributes && p.attributes.filter((r) => r.attr === "sb:total" || r.attr.startsWith("naics:"))
    .every((r) => r.expiresAt === "2027-07-15T00:00:00.000Z"),
  JSON.stringify(p?.attributes));
const pSmuggle = buildBidderProfileFromCapability({
  certifications: [],
  attributes_v2: [
    { attr: "sb:total", source: "verified_import" },          // stored derived size boolean — forbidden
    { attr: "naics:236220-small", source: "sam_api" },        // forbidden
    { attr: "size:small", source: "verified_import" },        // forbidden
    { attr: "se:sdvosb", source: "sba_api" },                 // legitimate — must survive
  ],
} as any, { solicitationNaics: "561730", now: nowFn });
ok("F2: size-class tokens (sb:/naics:/size:) in attributes_v2 are DROPPED — per-run computation is the only size source",
  pSmuggle?.attributes?.length === 1 && pSmuggle.attributes[0].attr === "se:sdvosb"
    && !pSmuggle.satisfiedAttributes.includes("sb:total") && !pSmuggle.satisfiedAttributes.includes("naics:236220-small"),
  JSON.stringify(pSmuggle));

// ── 5 · validation: malformed records dropped, valid kept; jsonb nulls tolerated ──
const pVal = buildBidderProfileFromCapability({
  certifications: [],
  attributes_v2: [
    { attr: "se:sdvosb", source: "sba_api", verifiedAt: null, expiresAt: null },  // nulls from jsonb ⇒ treated absent
    { attr: "se:8a", source: "not_a_source" },                                     // bad enum ⇒ dropped
    { attr: "", source: "sam_api" },                                               // empty attr ⇒ dropped
    { attr: 42, source: "sam_api" },                                               // non-string ⇒ dropped
  ],
} as any, { now: nowFn });
eq("validate: only the well-formed record survives", pVal?.attributes?.length, 1);
eq("validate: null dates dropped from the surviving record",
  pVal?.attributes?.[0], { attr: "se:sdvosb", source: "sba_api" });

// ── 6 · end-to-end firmStatus under the armed engine flag ──
const bar = (attr: string): TypedFinding => ({
  requirement: "This acquisition is set aside for SDVOSB concerns", citation: "52.219-27", excerpt: "set aside for SDVOSB",
  kind: "eligibility_bar", controllability: "bidder_cannot_move", grounded: true, lens: "eligibility", requiredAttribute: attr,
} as TypedFinding);
ok("e2e: sba_api SDVOSB record clears a pure SDVOSB bar", firmStatus(bar("setaside:SDVOSB"), p) === "satisfies",
  `got ${firmStatus(bar("setaside:SDVOSB"), p)}`);
ok("e2e: sb:total exact token decides when size computed small", firmStatus(bar("sb:total"), p) === "satisfies",
  `got ${firmStatus(bar("sb:total"), p)}`);
const pExpired = buildBidderProfileFromCapability({
  certifications: [],
  attributes_v2: [{ attr: "se:sdvosb", source: "sba_api", verifiedAt: "2024-01-01", expiresAt: "2025-01-01" }],
} as any, { now: nowFn });
ok("e2e: EXPIRED sba_api record refuses (expiry vs asOf)", firmStatus(bar("setaside:SDVOSB"), pExpired) === "unknown",
  `got ${firmStatus(bar("setaside:SDVOSB"), pExpired)}`);
const pAsserted = buildBidderProfileFromCapability({
  certifications: [],
  attributes_v2: [{ attr: "se:8a", source: "customer_asserted" }],
} as any, { now: nowFn });
ok("e2e: customer_asserted-only floored namespace refuses (authoritative floor)",
  firmStatus(bar("8(a) certified"), pAsserted) === "unknown",
  `got ${firmStatus(bar("8(a) certified"), pAsserted)}`);

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
