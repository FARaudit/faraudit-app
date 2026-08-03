// ─────────────────────────────────────────────────────────────────────────────
// CERT SYNC GATE — the write that makes a real certification count again.
//
// The defect this closes was invisible to every existing gate because it fails
// SAFE: with AUDIT_PROFILE_SCHEMA_V2 armed and nothing writing attributes_v2, a
// genuinely SBA-registered SDVOSB firm scored `unknown` on an SDVOSB set-aside
// instead of `satisfies` — caution, not a wrong answer, so nothing went red.
//
// So S1 is the load-bearing assertion and it is an END-TO-END one: sync, then
// drive the REAL engine seam (buildBidderProfileFromCapability → firmStatus) and
// require the verdict to move. A gate that only checked "a row was written"
// would pass on a write the engine ignores — which is precisely the state the
// product was already in.
//
//   S1  END-TO-END — after sync, the engine says `satisfies`; before it, `unknown`.
//   S2  THE WRITE MATRIX — each of the five states writes what it should, and
//       `unverified` writes NOTHING (our outage must not strip real eligibility).
//   S3  UEI BINDING — the previous firm's records never survive a UEI change,
//       INCLUDING when SAM is unreachable. One firm attesting for another is the
//       worst failure available here.
//   S4  NO-OP DETECTION — an unchanged record set does not rewrite the row.
//   S5  A FAILED WRITE IS NOT REPORTED AS A WRITE — including the silent kind:
//       PostgREST reports SUCCESS on an UPDATE that matched zero rows, so the
//       writer asks for the row back and treats an empty result as not-written.
//   S6  PLANTED POSITIVES — the stub must be shown able to observe a write, and
//       the engine leg must be shown able to return `unknown`.
//
// Run: npx tsx src/lib/cert-sync.test.ts
// ─────────────────────────────────────────────────────────────────────────────
export {}; // module scope (harness memory: tsx script-scope redeclare collisions)
import { syncCertifications } from "./cert-sync";
import { buildBidderProfileFromCapability } from "./audit-bidder-profile";
import { firmStatus } from "./audit-decide";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  if (c) { pass++; console.log(`  ✓ ${label}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  ✗ FAIL ${label}${detail ? "  — " + detail : ""}`); }
};

const OTHER_UEI = "ZZZ999YYY888";
const EXPIRY = "2027-06-01";

// cert-sync memoizes the SAM ENTITY read per UEI for 15 minutes, so every case below needs its own
// UEI or it is served the previous case's entity. That memo is real production behaviour (a customer
// who fixes their SAM record waits out the TTL), so the fix here is distinct fixtures, NOT a
// test-only reset hatch that would leave the real cache path unexercised.
let ueiSeq = 0;
const nextUei = () => `UEI${String(++ueiSeq).padStart(9, "0")}`;

// THE REAL v3 PAYLOAD SHAPE, transcribed from a live sam.gov/api/prod response — not from what the
// mapper expected. The previous fixture put sbaBusinessTypeList under a top-level `socioeconomic` key,
// which does not exist in any real response; it mirrored the code's assumption, so it certified a
// mapping that could never read a live record. SBA rows live under coreData.businessTypes, and the
// descriptions are SAM's own strings (5 codes exist: A6 · JT · XX · A9 · A0 — no SDVOSB).
const samRow = (uei: string, over: Record<string, unknown> = {}) => ({
  entityRegistration: {
    ueiSAM: uei, registrationStatus: "Active", registrationExpirationDate: EXPIRY,
    legalBusinessName: "Ridgeline Mfg", ...(over.reg as object ?? {}),
  },
  coreData: {
    businessTypes: {
      // Self-certified list — present on every real payload and deliberately NOT read as certification.
      businessTypeList: [{ businessTypeCode: "2X", businessTypeDesc: "For Profit Organization" }],
      sbaBusinessTypeList: (over.types as string[] ?? ["SBA Certified HUBZone Firm"]).map((d) => ({
        sbaBusinessTypeCode: d.includes("HUBZone") ? "XX" : d.includes("8(a)") ? "A6" : "A9",
        sbaBusinessTypeDesc: d,
        certificationEntryDate: "2024-01-01",
        certificationExitDate: (over.certExit as string) ?? null,
      })),
    },
  },
});

// ── a supabase stub that RECORDS what was written ────────────────────────────
function makeDb(
  row: { uei: string | null; attributes_v2: unknown },
  opts: { writeFails?: boolean; zeroRows?: boolean } = {},
) {
  const state = { row, writes: [] as unknown[], updateCalls: 0 };
  const client = {
    from() {
      return {
        select() {
          return { eq() { return { maybeSingle: async () => ({ data: state.row, error: null }) }; } };
        },
        update(patch: Record<string, unknown>) {
          state.updateCalls++;
          state.writes.push(patch.attributes_v2);
          const blocked = opts.writeFails || opts.zeroRows;
          if (!blocked) state.row = { ...state.row, attributes_v2: patch.attributes_v2 };
          return {
            // `.eq()` no longer resolves on its own — the writer asks for the row back, because
            // PostgREST reports success on an UPDATE that matched zero rows.
            eq: () => ({
              select: async () => ({
                data: opts.writeFails ? null : (opts.zeroRows ? [] : [{ user_id: "u" }]),
                error: opts.writeFails ? { message: "denied" } : null,
              }),
            }),
          };
        },
      };
    },
  };
  return { client: client as never, state };
}

function stubSam(impl: () => Promise<Response> | never) { (globalThis as never as { fetch: unknown }).fetch = impl; }
const samJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const realFetch = globalThis.fetch;
const realKey = process.env.SAM_API_KEY;
const realV2 = process.env.AUDIT_PROFILE_SCHEMA_V2;

// The engine bar every leg is measured against. HUBZone, not SDVOSB: SAM's SBA list carries no
// service-disabled veteran code at all, so an SDVOSB bar could never be cleared from this source and
// an end-to-end leg built on one would assert something the producer cannot do.
const HUBZONE_BAR = {
  requiredAttribute: "se:hubzone",
  requirement: "This acquisition is a total HUBZone set-aside; offerors must be a certified HUBZone firm.",
  excerpt: "total HUBZone set-aside",
} as never;

async function main() {
  process.env.SAM_API_KEY = "test-key-not-a-real-credential";
  // Armed, because that is what is LIVE on the worker. A gate run with it off would
  // certify a world we are not in.
  process.env.AUDIT_PROFILE_SCHEMA_V2 = "true";

  // ── S1 · END TO END ────────────────────────────────────────────────────────
  console.log("\nS1 · the engine's verdict actually moves");
  {
    const typedOnly = { certifications: ["HUBZone"], attributes_v2: null, size_facts: null };
    const before = firmStatus(HUBZONE_BAR, buildBidderProfileFromCapability(typedOnly as never));
    ok(before === "unknown",
      "BEFORE sync: a typed cert on a HUBZone bar is `unknown` (the shipped defect, reproduced)", before);

    const U = nextUei();
    const { client, state } = makeDb({ uei: U, attributes_v2: null });
    stubSam(async () => samJson({ totalRecords: 1, entityData: [samRow(U)] }));
    const r = await syncCertifications(client, "user-1");
    ok(!("error" in r) && r.state === "verified", "sync reports verified", JSON.stringify(r).slice(0, 60));

    const after = firmStatus(
      HUBZONE_BAR,
      buildBidderProfileFromCapability({ ...typedOnly, attributes_v2: state.row.attributes_v2 } as never),
    );
    ok(after === "satisfies",
      "AFTER sync: the SAME firm on the SAME bar is `satisfies` — the write is what the engine reads", after);
  }

  // ── S2 · THE WRITE MATRIX ──────────────────────────────────────────────────
  console.log("\nS2 · each state writes what it should");
  {
    // verified → records, tagged with the UEI they came from
    const U1 = nextUei();
    let db = makeDb({ uei: U1, attributes_v2: null });
    stubSam(async () => samJson({ totalRecords: 1, entityData: [samRow(U1, { types: ["SBA Certified HUBZone Firm"] })] }));
    let r = await syncCertifications(db.client, "u");
    const written = db.state.writes[0] as Record<string, unknown>[];
    ok(!("error" in r) && r.persisted === "written", "verified → written", !("error" in r) ? r.persisted : "");
    ok(written?.length === 1 && written[0].attr === "se:hubzone", "the derived program is stored", JSON.stringify(written));
    ok(written[0].source === "sam_api" && written[0].uei === U1 && written[0].expiresAt === EXPIRY,
      "stored record carries sam_api provenance, its UEI, and the registration expiry");

    // uei-not-found → []
    const U2 = nextUei();
    db = makeDb({ uei: U2, attributes_v2: [{ attr: "se:sdvosb", source: "sam_api", verifiedAt: "x", expiresAt: EXPIRY, uei: U2 }] });
    stubSam(async () => samJson({ totalRecords: 0, entityData: [] }));
    r = await syncCertifications(db.client, "u");
    ok(!("error" in r) && r.state === "uei-not-found", "SAM answered zero rows → uei-not-found");
    ok(Array.isArray(db.state.writes[0]) && (db.state.writes[0] as unknown[]).length === 0,
      "uei-not-found CLEARS the stored records — SAM says nothing is registered");

    // registration-inactive → []
    const U3 = nextUei();
    db = makeDb({ uei: U3, attributes_v2: [{ attr: "se:sdvosb", source: "sam_api", verifiedAt: "x", expiresAt: EXPIRY, uei: U3 }] });
    stubSam(async () => samJson({ totalRecords: 1, entityData: [samRow(U3, { reg: { registrationStatus: "Expired" } })] }));
    r = await syncCertifications(db.client, "u");
    ok(!("error" in r) && r.state === "registration-inactive", "lapsed registration → registration-inactive");
    ok((db.state.writes[0] as unknown[]).length === 0, "a lapsed registration CLEARS the records — it attests nothing");

    // no-uei → []
    db = makeDb({ uei: null, attributes_v2: [{ attr: "se:sdvosb", source: "sam_api", verifiedAt: "x", expiresAt: EXPIRY, uei: nextUei() }] });
    r = await syncCertifications(db.client, "u");
    ok(!("error" in r) && r.state === "no-uei", "no UEI → no-uei");
    ok((db.state.writes[0] as unknown[]).length === 0, "removing the UEI CLEARS the records it produced");

    // unverified → NOTHING is written
    const U4 = nextUei();
    db = makeDb({ uei: U4, attributes_v2: [{ attr: "se:sdvosb", source: "sam_api", verifiedAt: "x", expiresAt: EXPIRY, uei: U4 }] });
    stubSam(async () => { throw new Error("SAM down"); });
    r = await syncCertifications(db.client, "u");
    ok(!("error" in r) && r.state === "unverified", "network failure → unverified");
    ok(db.state.updateCalls === 0,
      "OUR OUTAGE WRITES NOTHING — it must never strip a firm's real eligibility", `${db.state.updateCalls} update(s)`);
    ok(!("error" in r) && r.records.length === 1 && r.persisted === "preserved",
      "the existing records survive the outage and are reported as preserved");
  }

  // ── S3 · UEI BINDING ───────────────────────────────────────────────────────
  console.log("\nS3 · one firm's records never attest for another");
  {
    // Records tagged to a DIFFERENT uei, and SAM unreachable so nothing can overwrite them.
    const stale = [{ attr: "se:sdvosb", source: "sam_api", verifiedAt: "x", expiresAt: EXPIRY, uei: OTHER_UEI }];
    const db = makeDb({ uei: nextUei(), attributes_v2: stale });
    stubSam(async () => { throw new Error("SAM down"); });
    const r = await syncCertifications(db.client, "u");
    ok(!("error" in r) && r.records.length === 0,
      "a previous firm's records are NOT preserved across a UEI change, even during an outage",
      !("error" in r) ? JSON.stringify(r.records) : "");
    ok(!("error" in r) && r.establishedPrograms.length === 0,
      "and they establish no programs — nothing from the old UEI can clear a bar");

    // Untagged legacy rows are equally not ours to vouch for.
    const untagged = [{ attr: "se:8a", source: "sam_api", verifiedAt: "x", expiresAt: EXPIRY }];
    const db2 = makeDb({ uei: nextUei(), attributes_v2: untagged });
    stubSam(async () => { throw new Error("SAM down"); });
    const r2 = await syncCertifications(db2.client, "u");
    ok(!("error" in r2) && r2.records.length === 0,
      "an untagged record cannot be shown to describe THIS firm, so it is not preserved");
  }

  // ── S4 · NO-OP DETECTION ───────────────────────────────────────────────────
  console.log("\nS4 · an unchanged answer does not rewrite the row");
  {
    const U = nextUei();
    const existing = [{ attr: "se:hubzone", source: "sam_api", verifiedAt: "2026-01-01", expiresAt: EXPIRY, uei: U }];
    const db = makeDb({ uei: U, attributes_v2: existing });
    stubSam(async () => samJson({ totalRecords: 1, entityData: [samRow(U)] }));
    const r = await syncCertifications(db.client, "u");
    ok(!("error" in r) && r.persisted === "unchanged", "identical record set → unchanged", !("error" in r) ? r.persisted : "");
    ok(db.state.updateCalls === 0, "no write was issued", `${db.state.updateCalls}`);
  }

  // ── S5 · A FAILED WRITE IS NOT A WRITE ─────────────────────────────────────
  console.log("\nS5 · a rejected write is reported honestly");
  {
    const U = nextUei();
    const db = makeDb({ uei: U, attributes_v2: null }, { writeFails: true });
    stubSam(async () => samJson({ totalRecords: 1, entityData: [samRow(U)] }));
    const r = await syncCertifications(db.client, "u");
    ok(!("error" in r) && r.persisted === "preserved",
      "a denied write reports `preserved`, never `written`", !("error" in r) ? r.persisted : "");
  }

  // ── S5b · A ZERO-ROW UPDATE IS NOT A WRITE ─────────────────────────────────
  console.log("\nS5b · an UPDATE that matched nothing is not reported as written");
  {
    // The trap this exists for: PostgREST returns NO ERROR when an UPDATE matches zero rows, so an RLS
    // policy that filters the row out is byte-indistinguishable from a successful write at the error
    // level. Reporting "written" there would mean the engine keeps scoring a firm on records that no
    // page visit can ever correct.
    const U = nextUei();
    const db = makeDb({ uei: U, attributes_v2: null }, { zeroRows: true });
    stubSam(async () => samJson({ totalRecords: 1, entityData: [samRow(U)] }));
    const r = await syncCertifications(db.client, "u");
    ok(db.state.updateCalls === 1, "the update WAS attempted", `${db.state.updateCalls}`);
    ok(!("error" in r) && r.persisted === "preserved",
      "zero rows matched → `preserved`, never `written`", !("error" in r) ? r.persisted : "");
  }

  // ── S6 · PLANTED POSITIVES ─────────────────────────────────────────────────
  console.log("\nS6 · the harness can fail");
  {
    // The stub must be able to SEE a write, or every "no write" assertion above is free.
    const U = nextUei();
    const db = makeDb({ uei: U, attributes_v2: null });
    stubSam(async () => samJson({ totalRecords: 1, entityData: [samRow(U)] }));
    await syncCertifications(db.client, "u");
    ok(db.state.updateCalls === 1,
      "PLANTED: the stub observes a real write (so S2/S4's zero-write assertions are not vacuous)",
      `${db.state.updateCalls}`);

    // The engine leg must be able to return `unknown`, or S1's `satisfies` is free.
    const none = firmStatus(HUBZONE_BAR, buildBidderProfileFromCapability({ certifications: [], attributes_v2: null, size_facts: null } as never));
    ok(none === "unknown", "PLANTED: an empty profile still yields `unknown` (S1's contrast is real)", none);

    // And a HUBZone-only registration must NOT clear an SDVOSB bar.
    const other = firmStatus(HUBZONE_BAR, buildBidderProfileFromCapability({
      certifications: ["HUBZone"], size_facts: null,
      attributes_v2: [{ attr: "se:8a", source: "sam_api", verifiedAt: "2026-01-01", expiresAt: EXPIRY, uei: nextUei() }],
    } as never));
    ok(other !== "satisfies",
      "PLANTED: a verified 8(a) record does NOT clear a HUBZone bar — the write is not a blanket pass", other);
  }

  (globalThis as never as { fetch: unknown }).fetch = realFetch;
  if (realKey === undefined) delete process.env.SAM_API_KEY; else process.env.SAM_API_KEY = realKey;
  if (realV2 === undefined) delete process.env.AUDIT_PROFILE_SCHEMA_V2; else process.env.AUDIT_PROFILE_SCHEMA_V2 = realV2;

  console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
