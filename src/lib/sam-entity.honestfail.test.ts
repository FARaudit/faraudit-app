// $0 REGRESSION for searchTeamingPartners' FAILURE TAXONOMY.
// Run: npx tsx src/lib/sam-entity.honestfail.test.ts
//
// The defect: every failure path returned `[]`. /api/teaming-partners maps an empty list to
// reason "no-partners", which public/team-app.js renders as "SAM answered and returned no active
// registrations under your primary codes." So a SAM outage became a positive claim about the
// customer's market. This gate holds the three failure exits apart from a genuine zero-result
// answer, and holds the zero-result answer REACHABLE so the fix cannot become fail-everything.
import { searchTeamingPartners, type TeamingSearchResult } from "./sam-entity";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

const realFetch = globalThis.fetch;
const realKey = process.env.SAM_API_KEY;
const NAICS = "332710";

// Shape transcribed from the v3 payload the mapper actually reads (entityRegistration /
// coreData.businessTypes.sbaBusinessTypeList / assertions.goodsAndServices / pointsOfContact),
// per the field map at src/lib/sam-entity.ts:88-124.
const ONE_ENTITY = {
  entityRegistration: {
    ueiSAM: "APXDF5339KL2", legalBusinessName: "PRECISION MACHINE WORKS LLC", cageCode: "7X2Q4",
    registrationStatus: "Active", registrationExpirationDate: "2027-03-14"
  },
  coreData: {
    physicalAddress: { stateOrProvinceCode: "TX", zipCode: "76101" },
    businessTypes: {
      sbaBusinessTypeList: [
        { sbaBusinessTypeCode: "A6", sbaBusinessTypeDesc: "Service Disabled Veteran Owned Small Business",
          certificationEntryDate: "2024-01-10", certificationExitDate: "2027-01-10" },
        // An all-null row — SAM emits these for firms holding no certification. Must be filtered.
        { sbaBusinessTypeCode: null, sbaBusinessTypeDesc: null, certificationEntryDate: null, certificationExitDate: null }
      ]
    }
  },
  assertions: { goodsAndServices: { primaryNaics: NAICS, naicsList: [{ naicsCode: NAICS }, { naicsCode: "332721" }] } },
  pointsOfContact: { governmentBusinessPOC: { firstName: "Dana", lastName: "Ruiz", email: "dana@example.com", phoneNumber: "817-555-0110" } }
};

function mockFetch(impl: () => Promise<unknown>) {
  globalThis.fetch = impl as unknown as typeof fetch;
}
const jsonRes = (body: unknown, status = 200) => Promise.resolve({
  ok: status >= 200 && status < 300, status,
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(JSON.stringify(body))
});

async function run() {
  // ── 1. unconfigured — a missing key is OUR fault, never a statement about the market ──
  delete process.env.SAM_API_KEY;
  mockFetch(() => { throw new Error("fetch must not be called without a key"); });
  let r: TeamingSearchResult = await searchTeamingPartners({ naics: NAICS });
  assert(r.outcome === "unconfigured", "no SAM_API_KEY → outcome 'unconfigured'");
  assert(r.partners === null, "unconfigured carries partners: null, NOT an empty list");

  process.env.SAM_API_KEY = "test-key-abc123";

  // An absent NAICS is the caller's own state, not a SAM answer about one.
  r = await searchTeamingPartners({ naics: "" });
  assert(r.outcome === "unconfigured", "empty NAICS → 'unconfigured' (no request made)");

  // ── 2. network throw. PLANTED KNOWN-POSITIVE: a real ECONNREFUSED embeds the whole request
  //      URL, api_key included. The returned result must be outcome-only — no leaked key. ──
  mockFetch(() => Promise.reject(new Error(
    `request to https://sam.gov/api/prod/entity-information/v3/entities?api_key=test-key-abc123&primaryNaics=${NAICS} failed, reason: ECONNREFUSED`
  )));
  r = await searchTeamingPartners({ naics: NAICS });
  assert(r.outcome === "unreachable", "fetch throws → outcome 'unreachable'");
  assert(!JSON.stringify(r).includes("test-key-abc123"), "the API key never reaches the returned result");

  // ── 3. upstream non-2xx ──
  mockFetch(() => jsonRes({ error: "service unavailable" }, 503));
  r = await searchTeamingPartners({ naics: NAICS });
  assert(r.outcome === "unreachable", "SAM 503 → 'unreachable'");
  mockFetch(() => jsonRes({ error: "bad request" }, 400));
  r = await searchTeamingPartners({ naics: NAICS });
  assert(r.outcome === "unreachable", "SAM 400 → 'unreachable'");

  // ── 4. 200 with an unparseable body ──
  mockFetch(() => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.reject(new Error("Unexpected token < in JSON")),
    text: () => Promise.resolve("<html>gateway</html>")
  }));
  r = await searchTeamingPartners({ naics: NAICS });
  assert(r.outcome === "unreachable", "200 + unparseable body → 'unreachable'");

  // ── 5. THE COMPLEMENT — a genuinely quiet market stays reportable. Without this the fix
  //      is a fail-everything machine and the page could never say "nothing is registered". ──
  mockFetch(() => jsonRes({ entityData: [], totalRecords: 0 }));
  r = await searchTeamingPartners({ naics: NAICS });
  assert(r.outcome === "ok", "SAM answers with zero rows → outcome 'ok' (a real answer)");
  assert(Array.isArray(r.partners) && r.partners.length === 0, "zero-result answer carries an empty list, not null");

  // ── 5b. THE SILENT-CAP DISCLOSURE. SAM serves one page and rejects pageSize; measured
  //      live, primaryNaics=332710 answers totalRecords 4384 and returns 10 rows. `total`
  //      must be SAM's count, not the row count, or the page states a 0.2% sample as the market.
  mockFetch(() => jsonRes({ entityData: [ONE_ENTITY], totalRecords: 4384 }));
  r = await searchTeamingPartners({ naics: NAICS });
  assert(r.outcome === "ok" && r.total === 4384, `total carries SAM's totalRecords (got ${r.outcome === "ok" ? r.total : "n/a"})`);
  assert(r.outcome === "ok" && r.partners.length === 1, "…while partners carries only what arrived");
  // An absent totalRecords must not make a capped page look complete.
  mockFetch(() => jsonRes({ entityData: [ONE_ENTITY] }));
  r = await searchTeamingPartners({ naics: NAICS });
  assert(r.outcome === "ok" && r.total === 1, "totalRecords absent → total falls back to the row count, never 0");

  // ── 6. the happy path still maps and dedupes ──
  mockFetch(() => jsonRes({ entityData: [ONE_ENTITY, ONE_ENTITY], totalRecords: 2 }));
  r = await searchTeamingPartners({ naics: NAICS });
  assert(r.outcome === "ok", "rows returned → 'ok'");
  const p = r.partners || [];
  assert(p.length === 1, `duplicate UEI collapsed to one row (got ${p.length})`);
  assert(p[0]?.legal_business_name === "PRECISION MACHINE WORKS LLC", "legal name mapped");
  assert(p[0]?.uei === "APXDF5339KL2" && p[0]?.cage_code === "7X2Q4", "UEI + CAGE mapped");
  assert(p[0]?.state === "TX", "state mapped from coreData.physicalAddress");
  assert(p[0]?.primary_naics === NAICS, "primary NAICS mapped from assertions.goodsAndServices");
  assert(p[0]?.business_types.length === 1, "the all-null SBA row is filtered out");
  assert(p[0]?.sba_certifications[0]?.certifiedUntil === "2027-01-10", "certification expiry read (not registration expiry)");
  assert(p[0]?.poc_email === "dana@example.com", "government business POC mapped");

  // ── 7. THE FALSIFIER. Every failure outcome must be distinguishable from a real answer by
  //      the exact test the route makes. If any failure path regressed to `[]`, this flips. ──
  const failureModes: Array<[string, () => Promise<unknown>]> = [
    ["throw", () => Promise.reject(new Error("boom"))],
    ["503", () => jsonRes({}, 503)],
    ["unparseable", () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error("x")), text: () => Promise.resolve("") })]
  ];
  for (const [name, impl] of failureModes) {
    mockFetch(impl);
    const res = await searchTeamingPartners({ naics: NAICS });
    assert(res.outcome !== "ok", `${name}: never reports 'ok' — the route's own discriminator`);
    assert(!Array.isArray(res.partners), `${name}: partners is not an array, so it cannot be rendered as a market`);
  }

  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.SAM_API_KEY; else process.env.SAM_API_KEY = realKey;

  console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run();
