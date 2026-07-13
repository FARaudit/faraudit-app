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
  assert(/no order-level far 52\.219-6/i.test(f7.requirement), "keeps the source-true observation (no order-level 52.219-6 clause)");
  assert(/SBA set-aside/i.test(f7.requirement) && /BOA/i.test(f7.requirement), "adds the authoritative context (parent vehicle carries the SBA set-aside; eligibility gates on the BOA seat)");
  assert(f7.citation === F7.citation, "citation preserved");
  assert(out[1].requirement === OTHER.requirement, "an unrelated finding is untouched");

  console.log("\n── genuinely UNRESTRICTED solicitation → the finding is TRUE, left untouched ──");
  for (const sa of [null, "", "none", "N/A", "Full and Open", "unrestricted"]) {
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
