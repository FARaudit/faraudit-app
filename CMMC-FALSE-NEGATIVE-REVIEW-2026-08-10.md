# CMMC false negatives — unstable v3 finding selection

Review 2026-08-10. **$0 — no paid runs.** No engine behaviour changed. Every number below is
reproduced by a re-runnable read-only probe (`scripts/audit-ai/_cmmc-flap-probe*.ts`, 1–7).

Corpus: 116 audit runs · 35 solicitations · 76 of the runs are `engine:"agentic_v3"` · 4,239
persisted v3 findings. (Matches the numbers in the brief.)

---

## 1. Why a clause_flowdown finding present in one run is absent from the next

**It is not a cap, not a filter, and not the verifier. The finding was never proposed.**

Four candidate causes were tested and three are refuted by direct evidence:

| Candidate | Verdict | Evidence |
|---|---|---|
| Top-N cut before persistence | **REFUTED** | `buildV3Payload` (`src/lib/audit-v3-report.ts:150`) is `findings: rawFindings.map(lite)` — no slice, no rank, no filter. Corpus confirms: findings-per-row runs continuously from 9 to 124 with no pile-up at any value. A cap of N would show a spike at N. |
| Adversarial verifier dropped it | **REFUTED** | `verifier_drops` has persisted since 2026-07-05 (`3a817318`), before every run in question, and is non-empty on 1 of 76 rows — so the field works. It is **empty on all 19 runs of both solicitations**. |
| The input differed between runs | **REFUTED** | `source_chars` and `doc_count` are identical across all runs of each solicitation — 61,282 / 5 docs (FA303026Q0020) and 147,894 / 10 docs (FA442726Q1068). |
| The lens layer did not emit it | **CONFIRMED** | See below. |

The engine already names this root in its own code. `src/lib/audit-expert.ts:410`:

> *"DETERMINISM (card #596 root — the finding layer is the run-to-run variance root: 86 vs 89
> findings across two runs of the same solicitation)."*

That comment sits on the `temperature: 0` pin — **which landed 2026-07-20 (`f1aed329`), after every
run in both defect cases.** The July 8–16 runs sampled at the API default. That is the proximate
cause, and it is already fixed in code.

**It is not fully fixed.** Splitting all multi-run solicitations at the pin date:

- pre-pin: **5 of 12** multi-run solicitations disagree on level
- post-pin: **2 of 6** still disagree (`W911SG27BA002` 2026-08-05/06, `N0016726Q1089` 2026-07-21)

Post-pin sample is small (6 solicitations) and in both post-pin cases the newest run is the *higher*
level, so no live false negative comes from them — but the instability is not gone. Temperature was
one sampling source; path-dependent agentic trajectories remain, exactly as the comment says.

### Per-run detail

**FA303026Q0020** — 10 v3 runs, 2026-07-14 → 2026-07-16 (36.6h). **3 of 10 detect.**
Levels newest→oldest: `0,0,0,0,2,0,2,0,2,0`.
Detecting runs: `df202699`, `56ef9717`, `8dfd0c9a` — all typed `clause_flowdown`, all citing
Section L's DFARS incorporation-by-reference list.

**FA442726Q1068** — 9 rows, of which **7 are v3** (2 are pre-v3 rows carrying no compliance payload;
the brief's "7 runs" is the v3 count). **4 of 7 detect.**
Detecting runs: `8b03b538`, `5250f4c2`, `a80a9a13`, `8eab14c2` — typed `eligibility_bar` twice and
`clause_flowdown` twice, for the same clause.

**The finding *kind* is unstable too.** Corpus-wide, the CMMC signal is carried by
`clause_flowdown` 48×, `eligibility_bar` 24×, `submission` 12×, `other` 7×. Any fix scoped to one
kind would miss half the detections.

### Wider than reported

8 of 20 re-audited solicitations disagree on level across runs. In **4** of them the newest run
understates — two more than the brief names:

- `70B01C26R00000080` (DHS) — newest L1, prior L2
- `N0016726Q1089` (DoD) — newest L2, prior L3

---

## 2. Should `inferLevel` read the persisted findings array for the clause question?

**On a v3 row that array is the only signal there is.** Measured: **0 of 76** v3 rows carry
`dfars_flags` or `dfars_clauses` (29 of 40 v2 rows do). The flag-gating work described in
`cmmc-levels.ts` — the 258-of-377 `detected:false` correction — operates on a field the current
engine no longer writes. For every v3 audit, the CMMC page's entire answer rests on a
non-deterministic model output.

So yes, a deterministic clause extraction should own the clause question. **But not the naive
version, and the corpus proves it.**

A whole-source `LEVEL_TRIGGERS` scan was measured against today's behaviour on the 17 v3 rows whose
assembled source survived (`raw_pdf_text` persists only from 2026-07-23, `44475348` — which is why
it is NULL on all 19 defect-case rows; that is expected, not a bug):

- 12 of 17 agree
- 5 disagree, **all one solicitation**: `36C25626Q1137`, a **VA window-washing** buy, which the
  source scan promotes to L2 on "controlled unclassified information"

That match is a single hit, and it is inside the FAR 52.204-25 definition of *information
technology* — `"...subject to the requirements of the Controlled Unclassified Information program
(see 32 CFR part 2002)..."`. A definitional cross-reference in boilerplate, on a non-DoD
solicitation. **The engine's L0 was right and the source scan is wrong.** A naive scan trades two
false negatives for a false positive that tells a window-washing contractor to build an SSP and
post an SPRS score.

**Split the trigger table by evidence class.** A clause or standard *number* in a solicitation is a
fact about the solicitation. A prose phrase is an inference:

- **FACT** — `252.204-7012/7019/7020/7021`, `NIST SP 800-171/172`, an explicit "CMMC Level N",
  `FAR 52.204-21`
- **PROSE** — `CUI`, `FCI`, "controlled unclassified information", "federal contract information"

A FACT-only source scan measured against today: **17 of 17 agree. 0 recovered, 0 regressed.**

Read that honestly: it is a null result, not a win. The scan is safe to add — but **the corpus
cannot demonstrate it recovers the two defect cases, because those rows' source was not persisted.**
The argument that it would is indirect and rests on grounding: `isGrounded`
(`audit-expert.ts:36`) is a deterministic substring check, and an ungrounded finding is dropped
before persistence — so the verbatim excerpt `"252.204-7012 Safeguarding Covered Defense
Information..."` **was literally in that run's source**, and `source_chars` proves every other run
read the same bytes.

The scan also does nothing for the 59 v3 rows with no surviving source, which includes both defect
cases. It fixes future runs, not the page today.

---

## 3. Should the page show a "runs disagree" state?

**Not as the refuted flag, and after the fix below it should not need one.**

The refutation in `src/app/api/cmmc-readiness/route.ts:80-90` stands and is not being reopened: with
no amendment or version identifier on the audit row, "the level changed" cannot be told from "the
engine ran again", and all 18 level-changing pairs were under 24h apart. Presenting run-to-run
variance as a *compliance event* remains wrong.

But the framing question the brief raises has a better answer than a confidence badge: **resolve the
disagreement instead of displaying it.**

The engine's own doctrine settles the direction. `applyNonPresenceHonesty` wraps asserted absence as
UNVERIFIED because *"absence is ungroundable (Rule 64)"*. A run that is silent about 252.204-7012
has not found the clause absent — it has found nothing. So taking the **maximum** level across runs
of the **same document set** is not cherry-picking the answer we prefer; it is the only reading
consistent with a rule the engine already enforces. And `max()` is monotonic — it can only raise or
hold, never lower, so it cannot manufacture a *lower* obligation.

**Guard: union only runs whose input is provably identical** — same `source_chars` **and** same
`doc_count`. A re-run over an amended package has different bytes, never unions with the old one,
and an amendment can still lower the level.

Measured over all 35 solicitations / 116 runs:

| policy | solicitations whose displayed level changes |
|---|---|
| max across all runs (unguarded) | 4 of 35 |
| **max across same-input runs (guarded)** | **3 of 35** |

The three: `FA303026Q0020` L0→**L2**, `FA442726Q1068` L0→**L2**, `N0016726Q1089` L2→**L3**.

The guard is doing real work: it declines to union `70B01C26R00000080` (DHS), whose two runs carry
no comparable input fingerprint, leaving it at L1 rather than promoting it on unverified grounds.

If a disclosure line is still wanted, the honest one is a statement about our own measurement, not
about the solicitation: *"252.204-7012 — found in 3 of 10 runs of the identical 5-document
package."* That is verifiable and does not tell a customer their obligation changed.

---

## Recommendation

**Do the read-side fix first.** Guarded max-across-same-input-runs in
`src/app/api/cmmc-readiness/route.ts`. It closes all three live false negatives today, needs no
engine change, no re-run, no source backfill, and no paid spend. Effect is fully measured: 3 of 35
solicitations, all upward, monotonic by construction.

**Then arm the deterministic FACT-only clause scan** at run time in the executor, where `fullSource`
is in hand — not over `raw_pdf_text`, which is NULL for 59 of 76 v3 rows. Keep the PROSE triggers on
the findings path where the model's judgment supplies the context a regex cannot: `36C25626Q1137` is
the standing counter-example to running them over raw text.

**Do not scope any fix to `kind === "clause_flowdown"`** — the same clause is typed
`eligibility_bar` almost as often.

Both are behaviour changes and neither is armed here. `AUDIT_*` flag arming is a CEO gate (G1).

---

## Probes (read-only, $0, re-runnable)

```
npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_cmmc-flap-probe.ts    # per-run detail + cap test
npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_cmmc-flap-probe2.ts   # corpus agreement + drop check
npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_cmmc-flap-probe3.ts   # pre/post temperature-pin split
npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_cmmc-flap-probe4.ts   # whole-source scan vs today
npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_cmmc-flap-probe5.ts   # what actually matched
npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_cmmc-flap-probe6.ts   # FACT-only scan vs today
npx dotenv -e .env.local -- npx tsx scripts/audit-ai/_cmmc-flap-probe7.ts   # read-side policy effect
```
