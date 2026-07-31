// CERT — the honest concluded-visit literal. The load-bearing risk is NOT the prose: it is that the promotion
// guard downstream keys on a SITE_VISIT_CONCLUDED_RE-matchable frame in this very string. A "more honest"
// sentence that stops matching would silently drop the finding out of its band. Assert the frame FIRST.
export {};
import { SITE_VISIT_CONCLUDED_RE, SITE_VISIT_MANDATORY_ATTENDANCE_RE } from "../../src/lib/audit-site-visit-patterns";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { c ? (pass++, console.log(`  ✓ ${l}`)) : (fail++, console.log(`  ✗ ${l}`)); };

// Reproduce both literals exactly as the orchestrator builds them.
const concluded = "Site Visit was held and concluded on May 28, 2026";
const eventDate = "may 28, 2026";
const legacy = `Mandatory site visit stated in the SAM notice body was held/concluded ${eventDate}; attendance is non-retroactive — this BARS AWARD unless the firm's attendance at the concluded site visit is confirmed (conditional-concluded, not a live gate): "${concluded}"`;
const build = (mandatoryGrounded: boolean, rosterPosted: boolean) =>
  `${mandatoryGrounded ? "Mandatory site visit" : "Site visit"} stated in the SAM notice body was held/concluded ${eventDate}. `
  + `${mandatoryGrounded ? "The notice states attendance conditions eligibility, but whether a non-attendee is excluded is the Contracting Officer's call, not a rule the notice establishes. " : "The notice does not state that attendance conditions eligibility. "}`
  + `Confirm with the Contracting Officer whether your firm attended${rosterPosted ? ", against the site-visit attendance record the notice lists among the posted attachments" : " and ask for the site-visit attendance record"}. `
  + `Raise it before the proposal due date — a challenge to a solicitation term is untimely once the closing time passes. `
  + `Quoted: "${concluded}"`;

const frame = (s: string) => new RegExp(SITE_VISIT_CONCLUDED_RE.source, "i").test(s);
ok("legacy literal matches the CONCLUDED frame (baseline)", frame(legacy));
for (const [m, r] of [[true, true], [true, false], [false, true], [false, false]] as Array<[boolean, boolean]>)
  ok(`new literal keeps the CONCLUDED frame (mandatory=${m}, roster=${r})`, frame(build(m, r)));

// The fabrications must be GONE in every variant.
for (const bad of ["BARS AWARD", "non-retroactive"])
  ok(`"${bad}" absent from every new variant`, [[true, true], [true, false], [false, true], [false, false]]
    .every(([m, r]) => !build(m as boolean, r as boolean).includes(bad)));
ok(`"BARS AWARD" IS present in the legacy literal (proves the cert can see it)`, legacy.includes("BARS AWARD"));

// "Mandatory" only when grounded — and the grounding predicate must actually discriminate.
ok(`ungrounded variant does NOT open with "Mandatory"`, build(false, true).startsWith("Site visit"));
ok(`grounded variant DOES open with "Mandatory"`, build(true, true).startsWith("Mandatory site visit"));
const mre = new RegExp(SITE_VISIT_MANDATORY_ATTENDANCE_RE.source, "i");
ok(`grounding predicate: FA813726R0033 attendance sentence is grounded`, mre.test("You must attend the Initial Site Visit for the project to be considered eligible to propose."));
ok(`grounding predicate: a bare concluded recital is NOT grounded`, !mre.test(concluded));

// The roster clause may only claim a posted record when the notice says one exists.
ok(`roster clause names the attachment only when posted`, build(true, true).includes("among the posted attachments") && !build(true, false).includes("among the posted attachments"));
ok(`without a posted roster it ASKS for the record instead of asserting one`, build(true, false).includes("ask for the site-visit attendance record"));

console.log(`\nCERT SITEVISIT LITERAL: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
