// Independent reproduction of /code-review high finding #1 on PR #292.
// Claim: the backward walk climbs an ALL-CAPS heading >40 chars, flipping isPositiveSetAside false→true.
//
// TWO SELF-INFLICTED ERRORS ON THE WAY TO THIS, both of which "disproved" the finding:
//   1. isHeadClippedExcerpt/findHeadRepairSpan are (source, excerpt) — first attempt passed them reversed.
//   2. isPositiveSetAside takes a TypedFinding and builds its hay from requirement+excerpt+requiredAttribute
//      — first attempt passed a bare string, so the hay was empty and the answer was trivially false.
import { isHeadClippedExcerpt, findHeadRepairSpan } from "../../src/lib/audit-excerpt-repair";
import { isPositiveSetAside } from "../../src/lib/audit-decide";
import type { TypedFinding } from "../../src/lib/audit-findings";

const SRC = "SECTION K - REPRESENTATIONS AND CERTIFICATIONS, TOTAL SMALL BUSINESS SET-ASIDE\n"
  + "The Offeror shall submit all questions in writing no later than five\n"
  + "business days prior to the closing date and time of this solicitation\n";
const EX = "business days prior to the closing date and time of this solicitation";

console.log("isHeadClippedExcerpt(SRC, EX):", isHeadClippedExcerpt(SRC, EX));
const span = findHeadRepairSpan(SRC, EX);
console.log("span crosses newlines        :", span ? (span.match(/\n/g) ?? []).length : "n/a");
console.log("span                         :", JSON.stringify(span));

// A questions-deadline finding — the shape the review describes.
const base = { requirement: "Questions must be submitted in writing no later than five business days prior to closing.", citation: "Section L", kind: "submission_mechanic", controllability: "bidder_controls", grounded: true, lens: "proposal_manager" } as unknown as TypedFinding;
const before = { ...base, excerpt: EX } as TypedFinding;
const after = { ...base, excerpt: span ?? EX } as TypedFinding;

console.log("\nisPositiveSetAside BEFORE:", isPositiveSetAside(before));
console.log("isPositiveSetAside AFTER :", isPositiveSetAside(after));
console.log(isPositiveSetAside(before) === false && isPositiveSetAside(after) === true
  ? "\n❌ FINDING #1 CONFIRMED — widening flips set-aside classification false→true"
  : "\n✅ no flip on this input");
