// ── CONSTRUCTION RECOGNIZERS — the one home ───────────────────────────────────────────────────────────────────────
// A LEAF module by design: it imports nothing, so either consumer can import it without a cycle. That is the whole
// reason it exists as its own file rather than living in one of them.
//
// FOUND BY the engine line-by-line audit (CEO queue #4), pass 2. These three were declared TWICE — in
// `section-boundary-detector.ts` and `audit-construction-manifest.ts` — byte-identical, with mirrored explanatory
// comments, and two of them under the SAME constant name (`SF1442_HEADER_RE`). That is a copy-paste, not a
// coincidence, and the two copies answer questions with different consequences:
//
//   section-boundary-detector → detectConstructionOutOfScope() → OUT_OF_SCOPE, tier "hard". A verdict.
//   audit-construction-manifest → the Rule 69 part-36 completeness carrier. Whether the package can be decided at all.
//
// So a drift between them does not produce a small inconsistency: it produces a package that one half of the engine
// refuses as out of scope while the other half runs the construction completeness gate over it, or the reverse. They
// were still identical when consolidated — this closes the surface before it costs anything, which is the opposite of
// how the deadline family was handled (there, DEADLINE_DEAD_DATE_RE had already drifted in both directions before
// anyone looked).

/** SF-1442 construction solicitation form identity — the header that names a package as construction. */
export const SF1442_HEADER_RE = /\bSF[-\s]?1442\b|STANDARD\s+FORM\s+1442|SOLICITATION[\/,\s]+OFFER[\/,\s]+(?:AND\s+)?AWARD\s*\(?\s*CONSTRUCTION/i;

/** Davis-Bacon CONSTRUCTION wage standard (FAR 52.222-6 family).
 *
 *  DELIBERATELY NOT matching SCA service wages (52.222-41), which are the in-scope-services case — both files
 *  carried that caveat in their own words, which is precisely the kind of hard-won narrowing that survives in one
 *  copy and gets widened in the other. The generic "wage determination" / "WD NN-NNNN" alternates were removed for
 *  the same reason (adversarial-review finding): they match SCA service determinations and would false-satisfy the
 *  construction core off service boilerplate. */
export const DAVIS_BACON_RE = /\b52\.222-6\b|davis[\s-]?bacon|construction\s+wage\s+rate/i;

/** Construction offer/bid structure — the bid-schedule and offer-receipt vocabulary of a sealed-bid package. */
export const OFFER_STRUCTURE_RE = /bid\s+schedule|offers?\s+(?:are\s+)?due|offer\s+due\s+date|receipt\s+of\s+offers|bid\s+opening/i;
