// $0 pin for the no-set-aside REFRAME (Card #481 ruling-4, flag AUDIT_SETASIDE_REFRAME).
// Run: AUDIT_SETASIDE_REFRAME=true npx tsx src/lib/audit-decide-setaside-reframe.test.ts
//
// When the row set_aside is authoritative (SBA), a model finding headlined "No set-aside is present in this solicitation"
// REFRAMES to the honest form (no order-level 52.219-6 clause; parent vehicle carries the set-aside; eligibility gates on
// the BOA seat) so it no longer contradicts the masthead. A genuinely-unrestricted solicitation is left untouched.
import { reframeNoSetAsideFindings, setAsideIsAuthoritative } from "./audit-decide";

let failures = 0;
const assert = (cond: boolean, msg: string) => { console.log(`${cond ? "✅" : "❌"} ${msg}`); if (!cond) failures++; };

// The real 41068f42 finding #7.
const F7 = { requirement: "No set-aside is present in this solicitation. There is no FAR 52.219-6 (Total Small Business Set-Aside) or any other socioeconomic set-aside clause. The acquisition is issued under a Multiple Award BOA.", citation: "Section L §1.1–1.2; Section I (no 52.219-6 found)" };
const OTHER = { requirement: "Bid guarantee (minimum of 20% of proposal) is required IAW FAR 28.101-1.", citation: "§L 4.3" };

async function main() {
  process.env.AUDIT_SETASIDE_REFRAME = "true";
  const { reframeNoSetAsideFindings: reframe } = await import("./audit-decide");

  console.log("── authoritative set_aside (SBA) → the finding reframes, no masthead contradiction ──");
  const out = reframe([F7, OTHER], "SBA");
  const f7 = out[0];
  assert(!/no set-aside is present/i.test(f7.requirement), "the '…no set-aside is present…' masthead-contradicting headline is GONE");
  assert(/no standalone far 52\.219-6/i.test(f7.requirement), "keeps the source-true observation (no §I 52.219-6 clause)");
  assert(/SBA set-aside/i.test(f7.requirement) && /sam records/i.test(f7.requirement), "adds the authoritative SAM context (records the SBA set-aside)");
  assert(f7.citation === F7.citation, "citation preserved");
  assert(out[1].requirement === OTHER.requirement, "an unrelated finding is untouched");

  console.log("\n── card #482 — the STALE dropped-boilerplate finding[40] variant also reframes (no internal contradiction) ──");
  const F40 = { requirement: "No set-aside designation found in this solicitation; no small business program eligibility bar present. (FAR 52.219-6 is NOT in this solicitation.)", citation: "boilerplate" };
  const r40 = reframe([F40], "SBA");
  assert(!/no set-aside designation found/i.test(r40[0].requirement), "finding[40] 'No set-aside designation found' is GONE");
  assert(!/52\.219-6 is not in this solicitation/i.test(r40[0].requirement), "the '52.219-6 is NOT in this solicitation' contradiction is GONE");
  assert(/no standalone far 52\.219-6/i.test(r40[0].requirement) && /SBA set-aside/i.test(r40[0].requirement), "reframed to the honest form (no §I 52.219-6 clause; SAM records the SBA set-aside)");
  // an unrestricted sol with the finding[40] text stays untouched (the 'no set-aside' claim is TRUE there)
  assert(reframe([F40], "Full and Open Competition")[0].requirement === F40.requirement, "unrestricted sol: finding[40] untouched");

  console.log("\n── red-team #481 — VEHICLE-AGNOSTIC: a non-vehicle set-aside (8(a) RFP) must NOT fabricate a BOA/IDIQ seat ──");
  const a8 = reframe([{ requirement: "No set-aside is present in this solicitation.", citation: "§I" }], "8(a)");
  assert(!/BOA|IDIQ|GWAC|vehicle\s+seat|holding the vehicle/i.test(a8[0].requirement), "does NOT invent a vehicle/BOA/IDIQ seat on a non-vehicle 8(a) set-aside");
  assert(/8\(a\) set-aside/i.test(a8[0].requirement), "states the authoritative 8(a) set-aside SAM records");

  console.log("\n── genuinely UNRESTRICTED solicitation → the finding is TRUE, left untouched ──");
  for (const sa of [null, "", "none", "N/A", "Full and Open", "Full and Open Competition", "unrestricted", "No set-aside used"]) {
    assert(!setAsideIsAuthoritative(sa), `setAsideIsAuthoritative(${JSON.stringify(sa)}) = false`);
    const u = reframe([F7], sa);
    assert(u[0].requirement === F7.requirement, `set_aside=${JSON.stringify(sa)} ⇒ finding untouched (the 'no set-aside' claim is true)`);
  }

  console.log("\n── set_aside programs recognized as authoritative ──");
  for (const sa of ["SBA", "8(a)", "HUBZone", "SDVOSB", "WOSB", "Total Small Business Set-Aside"]) {
    assert(setAsideIsAuthoritative(sa), `setAsideIsAuthoritative(${JSON.stringify(sa)}) = true`);
  }

  console.log(`\n${failures === 0 ? "✅ ALL PASS" : "❌ " + failures + " FAIL"} — no-set-aside reframe pin`);
  process.exit(failures === 0 ? 0 : 1);
}
main();

export {};
