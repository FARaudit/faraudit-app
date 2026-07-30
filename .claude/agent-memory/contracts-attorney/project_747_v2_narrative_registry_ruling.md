---
name: 747-v2-narrative-registry-ruling
description: ARC #747 V2 narrative design — R1 graded D, R2 graded F; provenance invariant PASSES the founding defect, partition still misses negative/external/structured kinds, and the capability-statement remedy is track- AND edition-conditional
metadata:
  type: project
---

Two rounds on `ceo/DESIGN-747-V2-NARRATIVE-CLAUSE-REGISTRY.md`. **R1 = D** (GENERIC/GROUNDED/COMPOSED could
not hold authority-class, negative, or structured assertions). **R2 = F**, on four independent FAILs.

**The R2 killer — the invariant passes the defect it was built to catch.** §3's rule is sentence-scoped:
"CONSTRUCTED from record-grounded fields" vs "LITERAL." At `src/lib/audit-decide.ts:3697-3702` the whole
`reason` is one template literal interpolating `${lock.vendor}`, and `lock.excerpt` is `grounded: true`
(:3679-3688). So the distributor fabrication declares DERIVED, satisfies "name the span and render it," and
ships **with corroboration underneath** — §4's manufactured-corroboration failure, reproduced by the fix.
§5 cures it only by hand-decomposing the sentence; nothing in the invariant requires that.
**Provenance granularity (string) < fabrication granularity (clause).** The gate-1 evidence proves the same
point: `NARRATIVE-SITE-INVENTORY-747-V2.txt:76-78` tags `:3700` `[lit]` and `:3701` `[tpl]` — one expression,
two kinds, decided by where the `+` concatenation happens to fall.

**Kinds still missing after AUTHORITY was added (answer to their Q1: yes, at least three).**
1. **NEGATIVE / record-absence** — `audit-engine.ts:3491,3498` `status:"not_required"` from clause absence;
   `_view-model.ts:3650` "Incumbent not identified." You cannot excerpt an absence. The arc file's own
   E3 demands an "honest-negative stamp" (ARC:76-77) — and E3 ships LAST.
2. **EXTERNAL-RECORD** — truth-maker is FPDS/SAM award history, not a solicitation span.
   `_view-model.ts:3294-3300` (recompete narrative, superlative at `:3297`) is pulled IN scope by §7 while
   §3 gives it an unsatisfiable obligation.
3. **STRUCTURED** — still open from R1. `audit-engine.ts:2574-2581` `GATE_CITATIONS` is a hardcoded
   citation map, customer-facing via `projectGateConditions` → persisted `complianceJson.gate_conditions`.
   It contains **JCP_CERTIFICATION_REQUIRED → "DD Form 2345 / 252.227-7025"**, and DFARS 252.227-7025 is
   *Limitations on the Use or Disclosure of GFI Marked with Restrictive Legends* (prescribed 227.7103-6(c)) —
   nothing to do with JCP. Two other values ("AFTO / TO library", "Section L / specialized test") are not
   citations at all. None appear in the census, because a map value is not "sentence-like."

**VERIFIED PRIMARY SOURCE (acquisition.gov, FAC 2026-01, eff. 03/13/2026) — reusable:**
- `5.207(c)(16)(ii)`: "When using the sole source authority at 6.302-1, insert a statement that all responsible
  sources may submit a capability statement, proposal, or quotation, which shall be considered by the agency."
  (i) is the non-6.302-1 default. So the capability-statement door is **6.302-1-only**, not "every sole source."
- `6.302-1(d)(2)`: "the notices required by 5.201 shall have been published and any bids, proposals, quotations,
  or capability statements must have been considered."
- `6.001(a)` — Part 6 does **not** apply to SAP acquisitions; (d) requirements/definite-quantity orders;
  (e) IDIQ orders; (f) 16.5 task/delivery orders. `13.501(a)(1)`: "Sole source (including brand name)
  acquisitions conducted under simplified acquisition procedures are **exempt from the requirements in part 6**."
- `5.201(b)`/`5.101(a)(1)` $25,000 synopsis threshold; `5.202(a)(2)` no synopsis at all for 6.302-2 urgency.
- `4.1102(a)` has **SEVEN** exceptions, (a)(1)–(a)(7) — not eight (design:95), not nine (my R1). Third wrong
  count in three rounds; the count is the trap, the substance is fine.
- **RFO model deviation text renumbers the authority**: 6.302-1 → **6.103-1**, heading *"Only one responsible
  source and no other supplies or services will satisfy agency requirements"* (reproduced on two fetches). That
  alone gives an AUTHORITY cite an **edition/deviation condition** on top of the track condition.
  **WITHDRAWN — did NOT reproduce:** that the consideration duty lands at "6.103(d)". Fetch 1 quoted it;
  fetch 2 of the same page denied an explicit publication requirement and pointed to 6.104-1(a)(6)
  (justification content) instead. Treat RFO paragraph-level designators — incl. Part 5's "5.101(c)(4)(vi)"
  (single fetch) — as UNVERIFIED; cite only the section-level renumbering. **NOT verified: whether any agency
  (incl. DoD/DLA) has adopted RFO Parts 5/6 by class deviation** — the RFO pages carry model text only, no
  adoption roster. State the risk conditionally; never assert adoption.
- `52.214-34` / `52.214-35` (English language / U.S. currency) — **the prescription is trigger-conditioned, not
  merely sealed-bid**: 14.201-6(w)/(x) say insert them *"in solicitations that include any of the clauses
  prescribed in 25.1101 or 25.1102"* (Part 25 foreign-acquisition), with discretionary use elsewhere ("may also
  include … when deemed necessary"); (x) is displaced when 52.225-17 is used. So `status:"not_required"` from
  their absence is a non-sequitur on **every** track, not just negotiated ones — absence means "no Part 25
  trigger clauses, or the CO declined a discretionary provision," never "English/USD not required." My earlier
  "Part 14 sealed-bidding, therefore meaningless on an RFP" reached the right result by the wrong mechanism.

**RETRACTION of my own R1 line.** I wrote that a firm submitting nothing "is not an interested party under
4 CFR 21.0(a)(1)" and that "silence destroys the remedy." That overstates: prospective-offeror standing to
protest a sole source does not depend on having filed a capability statement. The design did not import it —
keep it out.

**How to apply:** on any narrative/provenance work, test the invariant against the arc's founding defect
BEFORE grading the design; if the defect passes, nothing else matters. And for any regulatory entitlement,
demand four conditions, not one: authority (which 6.302-x) · track (Part 6 vs 13 vs 8.4 vs 16.5) · notice
(threshold + 5.202 exceptions + response date) · edition (codified FAR vs agency RFO class deviation).

Related: [[lesson_verify_paraphrase_not_just_memory]] · [[feedback_render_cause_must_derive_from_engine]] ·
[[feedback_uncomputed_default_class]] · [[feedback_excerpt_start_truncation_fakes_corroboration]] ·
[[feedback_no_blocklist_shape_allowlist_doctrine]]
