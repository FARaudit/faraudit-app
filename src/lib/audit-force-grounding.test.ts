// REPORT-TRUTH #8 — fabricated modal qualifier. Pure fixtures, no database, no network.
//
// The MUST-NOT set carries the weight. Stripping force from a real obligation softens a live requirement and
// under-warns the bidder; failing to strip a fabricated one merely leaves today's behaviour in place. So the
// negatives are exhaustive and the positives are few.
import { groundModalForce, FORCE_CORRECTED_PREFIX, FORCE_GROUNDING_INTERNALS_FOR_TEST as I } from "./audit-force-grounding";

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
// SCOPE LOCK on the qualifier set. Every other condition is satisfied here — the subject reads cleanly, the excerpt
// carries no obligation, and "required" appears nowhere in the source — so the ONLY thing keeping the gate off is
// that "required" is not in FORCE_QUALIFIER. This is not a correctness claim ("required" can be as fabricated as
// "mandatory"); it is a deliberate v1 blast-radius decision. "Required" is an ordinary paraphrase of "shall" and
// appears in legitimately grounded findings constantly, so admitting it puts this gate in the path of far more
// real obligations, each one a chance to soften something true. Widening the set is a decision to take on purpose,
// with its own negatives — not a drive-by regex edit. Mutation-checked: adding "required" must turn this red.
ok("'required' is out of scope for v1 even when every other condition is met",
   !fires({ id: "i2", requirement: "Required site visit on 13 August 2026.", excerpt: "Site visit will be held on 13 August 2026." },
          "Site visit will be held on 13 August 2026 at the Valley Resident Office."));

// ISOLATES THE EXCERPT CHECK. The excerpt obligates ("shall attend") but names no subject, so the subject-scoped
// sentence scan sees only the non-obligating scheduling sentence and would fire. Only the finding's own grounding
// prevents it. This is the real shape of a repaired/trimmed excerpt. Mutation-checked.
ok("the finding's own excerpt alone can stand the gate down",
   !fires({ id: "j", requirement: "Mandatory site visit on 13 August.", excerpt: "Offerors shall attend." },
          "Site visit will be held on 13 August 2026 at the Valley Resident Office."));

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

console.log("-- code-review regressions (5 findings, 2026-07-31) --");
{ // predicative form must not leave a dangling copula
  const r = run({ id: "p", requirement: "The site visit is optional. Separate registration is mandatory.", excerpt: "Site visit will be held 13 Aug." },
                "Site visit will be held 13 Aug. Separate registration opens in July.");
  const t = String(r.findings[0].requirement ?? "");
  ok("predicative strip leaves no dangling copula", r.corrected.length === 1 && !/\bis\s*\./.test(t));
  ok("subject reads naturally mid-sentence", !/this Separate/.test(t));
}
ok("sentencesNaming anchors on word boundaries (bond ≠ Bonding)", I.sentencesNaming("Bonding is waived for this acquisition.", "bond").length === 0);
ok("sentencesNaming anchors on word boundaries (visit ≠ revisit)", I.sentencesNaming("The revisit was cancelled.", "visit").length === 0);
ok("longer noun phrase keeps its head noun", I.qualifiedSubject("Mandatory attendance at the site visit on 13 Aug.", 0, "Mandatory") === "attendance site visit");
{ // every emitted correction must fit the renderer's own budget
  const r = run({ id: "b", requirement: "A mandatory site visit is scheduled at US Army Corps of Engineers-Valley Resident Office, 1810 Jefferson Blvd, Old West Sacramento, CA on 13 August 2026 at 11:00am PDT. FAR 52.237-1 (Site Visit) is incorporated by reference in Section L.", excerpt: SPEC_EXCERPT }, SPEC_SOURCE);
  ok("correction fits the 400-char render budget", String(r.findings[0].requirement ?? "").length <= 400);
  ok("correction survives ahead of the expendable tail", /does not state that this site visit is mandatory/.test(String(r.findings[0].requirement ?? "")));
}

console.log("-- adversarial P0 regressions (2026-07-31) --");
// P0-B: a heading and the line it introduces are split by PDF extraction, so the obligating line never lexically
// named the subject and the gate softened a REAL attendance requirement. Dangerous direction.
ok("line-broken heading + obligation stands the gate down",
   !fires({ id: "lb", requirement: "Mandatory site visit on 13 August 2026.", excerpt: "SITE VISIT" },
          "SITE VISIT\nOfferors must attend on 13 August 2026.\nSubmit offers by 20 August."));
ok("heading is merged into the line it introduces",
   I.sentencesNaming("SITE VISIT\nOfferors must attend on 13 August 2026.", "site visit")
     .some((s) => /must attend/.test(s)));
// ...without making the gate inert: a terminated clause-table row is NOT a heading and must not absorb its neighbour.
ok("a terminated clause row is not treated as a heading",
   I.sentencesNaming("52.237-1 Site Visit.\n52.203-18 Prohibition on Contracting with Entities that Require Certain Agreements.", "site visit")
     .every((s) => !/Require/.test(s)));
// A function word can never be the thing a qualifier is asserted of.
{ // A function word can never be the thing a qualifier is asserted of. Before this, the attributive read returned
  // the connective itself as the subject ("but"), and the gate fired on it — standing down later only by the luck
  // of which segment happened to contain that word.
  const T = "Attendance mandatory but not the";
  ok("a connective is rejected as a subject", I.qualifiedSubject(T, T.indexOf("mandatory"), "mandatory") === "");
}

console.log(`\nREPORT-TRUTH #8 · modal force grounded against the source: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
