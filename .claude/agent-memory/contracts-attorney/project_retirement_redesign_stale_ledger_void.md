---
name: retirement-redesign-stale-ledger-void
description: Panel-on-design ruling — the "verbatim veto is load-bearing" measurement is VOID (stale pre-#460 coverageV2 ledger); veto quotes disqualifierUncovered[0] unranked; vote = A-minus (hold, strike premise, rank banner, then B)
metadata:
  type: project
---

Ruling written to `ceo/PANEL-REDESIGN-CONTRACTS.md` (2026-07-22). Vote = **named alternative "A-minus"**:
HOLD the veto armed · STRIKE the load-bearing premise · RANK the banner (B3) now · re-parity the ledger (A3)
+ re-adjudicate gold-set labels (A4) · THEN Option B with a §I/52.252-2 by-reference exclusion (B1).
Dissented from Code on Q4: KEEP `AUDIT_RETIRE_VERBATIM_VETO` flag-OFF (it is the instrument, not a guard —
deleting it destroys the only apparatus that can re-measure an OPEN question; cure the "reads as ready"
hazard with a header stamp).

**Why:** *(executed, reproducible)*
- `70B01C 999e909b`'s stored `coverageV2` key set lacks `ungroundedNonBarSignal` ⇒ computed under
  `AUDIT_AMBIGUOUS_SIGNAL_DEMOTION=false`, which is TRUE live. Recompute `gradeCoverageV2` from the record's
  own `result.coverage.attestations` at parity ⇒ `disqualifierUncovered = 0`, `cap = null`, **BWC in BOTH flag
  states**. The "real false-BID" that killed retirement does not exist at live parity.
- Corpus ledger census (44 records): **15 × 4-key · 15 × 5-key · 5 × 7-key · 9 absent** — three unstamped flag
  configurations. A5 fixed live-parity at the DECIDE layer only; the LEDGER is replayed frozen. L40-D3 one
  layer down.
- `gateV2Outcome` picks `cov.disqualifierUncovered[0]` — **document order, unranked**. Full-bucket census:
  `999e909b` 12 entries (0 `disqualifier`, 0 bar-positive); `be69ce16` 62 entries (0 `disqualifier`, **4
  bar-positive**). Banner quoted FAR 52.233-2 protest service, FAR 15.506 debriefing, "shall be no less than
  Arial 12 points" — each labelled "a potential disqualifying requirement" — while the grounded 8(a) bar was
  named only by the RETIRED branch, and on `be69ce16` a 20%-of-proposal **bid guarantee** sat UNQUOTED in the
  same bucket. That is why I vote HOLD, not retire — and it is the strongest argument for B3, since the bucket
  already contained the better answer.
- **BID-GUARANTEE GRADING RULE (learned by getting it wrong first).** FAR **28.101-4 splits on acquisition
  posture**: (a) *"In sealed bidding, noncompliance … requires rejection of the bid"*; (b) *"In negotiation …
  requires rejection of an initial proposal as unacceptable, **if** a determination is made to award … without
  discussion … [otherwise] deficiencies … shall be addressed during discussions and the offeror shall be given
  an opportunity to correct the deficiency."* ⇒ **caveat-grade/BWC in negotiation, protest-grade only in sealed
  bidding or award-on-initials.** Requirement trigger is 28.101-1(a) (bid guarantee required whenever a
  performance/payment bond is required).
- Wrong-bar = **NOT fabrication** (text is verbatim) but a **mischaracterization FAIL** (rubric dim. 4), and at
  protest standard worse than silence: reliance-and-misdirect + calibration collapse. It makes B **urgent** —
  but B alone does not fix it; index-zero selection must be ranked (B3), which is verdict-inert.

**SCOPE LIMIT on the §0c finding:** measured with `AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD` unset (default-OFF,
uncommitted in-tree). That guard ADDS escalation, so arming it could re-populate `disqualifierUncovered` on
records I measured empty, `999e909b` included. "The veto does not fire there" holds *at the declared live flag
set*, not in a guard-armed configuration — which is unmeasured.

**How to apply:** two self-caught discipline failures in this ruling, both worth carrying forward.
(1) Never census a bucket by `.slice(0, N)` and then write "every member" — I sampled 14 of 62 and 4 exceptions
were hiding past the sample. Enumerate the FULL set before any universal claim.
(2) **Never quote a FAR sentence starting after its opening qualifier.** I quoted 28.101-4 from "Noncompliance
…", dropping "**In sealed bidding**, …" — which silently converted a posture-specific rule into a general one
and produced an over-grade. Quote from the first word of the sentence, and check whether the paragraph has a
sibling that covers the other posture (here (b) did, and it inverted the answer). Also: never infer acquisition
posture from an SF-1442/SF-1449 preprinted checkbox label — both options extract (ratified #552 collision).
State corrections in the ruling body rather than patching silently; the panel needs to see the retraction.
Never take a veto/coverage measurement over a STORED
`coverageV2` — always recompute from
attestations and stamp BOTH the ledger and decide flag sets. Treat gold-set `expected` labels as unaudited
instruments: `999e909b` expects NHR on a grounded, offer-time, **self-represented** 8(a) set-aside
(FAR 52.219-18(a)+(b), verified verbatim), which my ratified doctrine caps at BWC — the label manufactures the
false-BID it is cited for. Relates to [[verdict-arc-verbatim-veto-two-functions]] and
[[step4-veto-retirement-registers]].
