// REPORT-TRUTH #8 — fabricated modal qualifier. Pure fixtures, no database, no network.
//
// The MUST-NOT set carries the weight. Stripping force from a real obligation softens a live requirement and
// under-warns the bidder; failing to strip a fabricated one merely leaves today's behaviour in place. So the
// negatives are exhaustive and the positives are few.
import { groundModalForce, FORCE_CORRECTED_PREFIX } from "./audit-force-grounding";

let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { if (c) pass++; else { fail++; console.log(`  ✗ ${l}`); } };

type F = { id: string; requirement: string; excerpt?: string };
const run = (f: F, source: string) => groundModalForce([f], source);
const fires = (f: F, source: string) => run(f, source).corrected.length === 1;

// The live specimen, verbatim from run 61aaaa95 (W9123826QA032). The source's ONLY site-visit sentences are a
// clause-table row and a scheduling statement; "mandatory" appears nowhere in the document.
const SPEC_SOURCE = [
  "Section L - Instructions, Conditions, & Notices to Offerors or Quoters.",
  "52.237-1 Site Visit. 1984-04.",
  "Site visit will be held at US Army Corps of Engineers-Valley Resident Office, 1810 Jefferson Blvd, Old West Sacramento, CA on 13 August 2026, at 11:00am PDT.",
  // The trap: a real obligation, on a DIFFERENT event, elsewhere in the document. A whole-document obligation scan
  // reads this and wrongly concludes the mandatory site visit was grounded.
  "Subcontractors may attend the pre-work meeting however the Prime must attend and subcontractors may NOT represent submittals for the prime contractor.",
].join("\n");
const SPEC_EXCERPT = "Site visit will be held at US Army Corps of Engineers-Valley Resident Office, 1810 Jefferson Blvd, Old West Sacramento, CA on 13 August 2026, at 11:00am PDT.";

console.log("-- fires on the fabricated qualifier --");
{
  const r = run({ id: "18", requirement: "Mandatory site visit: Site visit will be held at the Valley Resident Office on 13 August 2026 at 11:00am PDT. FAR 52.237-1 (Site Visit) is incorporated.", excerpt: SPEC_EXCERPT }, SPEC_SOURCE);
  ok("attributive form corrected", r.corrected.length === 1);
  ok("subject read from the finding at runtime", r.corrected[0]?.subject === "site visit");
  ok("output carries the CORRECTED prefix", String(r.findings[0].requirement).startsWith(FORCE_CORRECTED_PREFIX));
  ok("fabricated qualifier no longer asserted of the subject", !/\bmandatory site visit\b/i.test(String(r.findings[0].requirement)));
  ok("real substance preserved (date)", /13 August 2026/.test(String(r.findings[0].requirement)));
  ok("real substance preserved (clause ref)", /52\.237-1/.test(String(r.findings[0].requirement)));
  ok("no stutter from the stripped label", !/site visit: site visit/i.test(String(r.findings[0].requirement)));
}
ok("predicative form corrected", fires({ id: "30", requirement: "A mandatory site visit is scheduled at the Valley Resident Office on 13 August 2026.", excerpt: SPEC_EXCERPT }, SPEC_SOURCE));

console.log("-- MUST NOT fire: the obligation is real --");
ok("excerpt says shall attend", !fires({ id: "a", requirement: "Mandatory site visit.", excerpt: "Offerors shall attend the site visit." }, "Offerors shall attend the site visit."));
ok("excerpt says must attend", !fires({ id: "b", requirement: "Mandatory site visit.", excerpt: "Offerors must attend the site visit." }, "Offerors must attend the site visit."));
ok("excerpt states a prerequisite", !fires({ id: "c", requirement: "Mandatory pre-bid conference.", excerpt: "Attendance at the pre-bid conference is a prerequisite to award." }, "Attendance at the pre-bid conference is a prerequisite to award."));
ok("consequence form with no modal", !fires({ id: "d", requirement: "Mandatory job walk.", excerpt: "Offers from firms that did not attend the job walk will not be considered." }, "Offers from firms that did not attend the job walk will not be considered."));
ok("obligation in another sentence naming the subject", !fires({ id: "e", requirement: "Mandatory site visit.", excerpt: "Site visit will be held on 13 August." }, "Site visit will be held on 13 August. The site visit is required for all offerors."));
ok("source uses the force word anywhere at all", !fires({ id: "f", requirement: "Mandatory site visit.", excerpt: "Site visit will be held on 13 August." }, "Site visit will be held on 13 August. A mandatory pre-work meeting follows award."));
ok("subject never discussed in the source", !fires({ id: "g", requirement: "Mandatory bid bond.", excerpt: "No bond language located." }, "This solicitation is for lawn maintenance services."));
ok("no force qualifier at all", !fires({ id: "h", requirement: "Site visit attendance (FAR 52.237-1 incorporated by reference).", excerpt: SPEC_EXCERPT }, SPEC_SOURCE));
ok("'required' alone is not treated as an absolute qualifier", !fires({ id: "i", requirement: "Registration in SAM is required before award.", excerpt: "Offerors shall be registered in SAM." }, "Offerors shall be registered in SAM."));

console.log("-- structural properties --");
ok("empty findings ⇒ no crash", groundModalForce([], SPEC_SOURCE).findings.length === 0);
ok("empty source ⇒ untouched", groundModalForce([{ id: "a", requirement: "Mandatory site visit." }], "").corrected.length === 0);
ok("missing excerpt ⇒ still safe to evaluate", (() => { try { groundModalForce([{ id: "a", requirement: "Mandatory site visit." }], SPEC_SOURCE); return true; } catch { return false; } })());
ok("input array is not mutated", (() => { const arr = [{ id: "a", requirement: "Mandatory site visit: held 13 August.", excerpt: SPEC_EXCERPT }]; groundModalForce(arr, SPEC_SOURCE); return arr[0].requirement.startsWith("Mandatory"); })());
ok("untouched findings returned by reference", (() => { const arr = [{ id: "a", requirement: "An ordinary finding." }]; return groundModalForce(arr, SPEC_SOURCE).findings[0] === arr[0]; })());
ok("idempotent — a second pass is a no-op", (() => {
  const p1 = groundModalForce([{ id: "a", requirement: "Mandatory site visit: held 13 August 2026.", excerpt: SPEC_EXCERPT }], SPEC_SOURCE);
  return groundModalForce(p1.findings, SPEC_SOURCE).corrected.length === 0;
})());
ok("no double CORRECTED prefix on re-entry", (() => {
  const p1 = groundModalForce([{ id: "a", requirement: "Mandatory site visit: held 13 August 2026.", excerpt: SPEC_EXCERPT }], SPEC_SOURCE);
  const p2 = groundModalForce(p1.findings, SPEC_SOURCE);
  return !/CORRECTED — CORRECTED/.test(String(p2.findings[0].requirement));
})());

console.log(`\nREPORT-TRUTH #8 · modal force grounded against the source: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
