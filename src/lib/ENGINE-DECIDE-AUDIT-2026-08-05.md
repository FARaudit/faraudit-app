# LINE-BY-LINE AUDIT — `audit-gate-v2.ts` + `deriveVerdict`, 2026-08-05

The second half of the engine walk (`ENGINE-WALK-2026-08-05.md`), covering the two files that decide.
**1,417 lines of `audit-gate-v2.ts` and lines 3365–3924 of `audit-decide.ts`, read in full.**

**Method.** Every claim below was **executed**, not reasoned: probes drive the real exported functions with
production flags sourced live from the worker (`railway variables --service audit-worker --kv | grep '=true$'`).
Two probes failed on my own fixtures before they passed — both times the engine was right and the fixture was
wrong. Those are recorded, because a fixture that shares the finding's premise is how a false result gets
published.

Worker sha `12e43884`. All probes $0, no model calls.

---

## THE HEADLINE — all three committal DECLINE poles are unreachable in production

`ENGINE-STAGE-MAP.md` censuses stage 7 as 34 exits, **27 decline : 7 commit**. That count is exactly right as
arithmetic over the source. It is misleading as a description of what the engine can say, because **the three
poles that decline *decisively* cannot fire on the customer path today.**

| pole | exits | reachable in production? | why |
|---|---|---|---|
| `NO_BID` | 2 | **No** | Both suppressed, independently and deliberately |
| `INELIGIBLE` | 1 | **No** | Requires a profile shape no production code builds |
| `NEEDS_HUMAN_REVIEW` | 17 | yes | |
| `INCOMPLETE` | 7 | yes | |
| `BID_WITH_CAUTION` | 5 | yes | |
| `BID` | 2 | yes | |

### `NO_BID` — suppressed twice over, and it is deliberate

**Exit 1 (`audit-decide.ts:3438`) — temporal CLOSED.** Gated on `AUDIT_TEMPORAL_VERDICT`, which is **unset** on
the worker, so `temporal` is `null` and the branch is dead.

**Exit 2 (`:3750`) — a verified universal defect.** Reached only past `:3716`, which suppresses it whenever
`AUDIT_FOURWALLS_NOBID !== "true"` — also **unset**. Executed, with the verifier registered exactly as boot
registers it:

```
A verified universal defect, PROD flags  → NEEDS_HUMAN_REVIEW
   [card275-r4b] 1 verified universalDefect(s) SUPPRESSED to NHR pending four-walls re-enable
A2 same + AUDIT_FOURWALLS_NOBID=true     → NO_BID
```

This is a **ratified posture, not a defect** — card 275 ruling 4b holds that a single J-2 entailment over a
±1 KB window is "one wall, not four." It is recorded here because the census does not convey it: the engine's
answer to *"is this solicitation defective for everyone?"* is **always NEEDS_HUMAN_REVIEW today**.

> **My first two probes reported this same result for the wrong reason** — `VERIFIER_ALLOWLIST` starts empty and
> is populated at boot by `registerJudgmentVerifier()`, which my fixture never called, so the run tripped the
> FORK-5 breach instead of reaching the suppression. Same verdict, different mechanism. Had I stopped there I
> would have published a true conclusion supported by a false trace.

### `INELIGIBLE` — needs a profile shape nothing builds

`:3756` requires `provenFails` non-empty ⇒ `firmStatus(...) === "fails"` ⇒ **`closedWorld: true`**, plus the
requiredAttribute grounded in source (`:3016`, the card-284/I8 anti-fabrication guard).

`grep -rn "closedWorld:\s*true" src/lib src/app agents` excluding tests returns **only comments**, two of which
say so outright: *"that needs `closedWorld:true` — a FUTURE path"* (`audit-decide.ts:2237`, `:2275`).

Executed across three profile shapes at production parity:

```
NEEDS_HUMAN_REVIEW  eligible=null  firmStatus=unknown   closedWorld, no attributes[]
NEEDS_HUMAN_REVIEW  eligible=null  firmStatus=unknown   closedWorld + authoritative record, different program
NEEDS_HUMAN_REVIEW  eligible=null  firmStatus=unknown   open-world, empty
```

**Consequence for the product, stated plainly:** the engine can say *bid*, *bid with caution*, *we could not
read it*, or *a human must look*. It cannot currently say *no*. Every hard decline is routed to human review.
That is coherent with zero-contract-loss doctrine and it is defensible — but it is the answer to "did we fix
the verdict," and the answer is that the decline half of the ladder is dark.

---

## GATE-V2 — DEFECT: the newest two bar recognizers are invisible to one release branch

**`importanceOf` (`:325`) tests the raw `BAR_SIGNAL_RE`; every sibling branch tests `hasBarSignal()`.**

```ts
if (!BAR_SIGNAL_RE.test(ob) && NOOP_REP_FAMILY.some((m) => m.enabled && m.re.test(ob))) return "boilerplate";
```

`hasBarSignal()` (`:420`) is `BAR_SIGNAL_RE` **plus** two arms that the raw regex does not carry:

- `REGISTER_TOKENS_RE` — `AUDIT_BAR_SIGNAL_REGISTER_TOKENS=true` (FCL · DD Form 254 · facility clearance ·
  Part 145 · repair station certificate · airworthiness certificate). Note `BAR_SIGNAL_RE` has
  `\bcertif(?:ied|ication)\b`, which does **not** match "certificate".
- `isPrivateIssuerCredentialBar` — `AUDIT_PRIVATE_ISSUER_CREDENTIAL_BAR=true`, **armed 2026-08-04**.

All five `NOOP_REP_FAMILY` members are armed in production. Executed at parity — **4 of 4 constructed cases are
asymmetric**:

```
⚠ importanceOf=boilerplate  hasBarSignal=true   precedence + airworthiness certificate
⚠ importanceOf=boilerplate  hasBarSignal=true   precedence + DD Form 254
⚠ importanceOf=boilerplate  hasBarSignal=true   protest + authorized distributor for Caterpillar
⚠ importanceOf=boilerplate  hasBarSignal=true   debrief + Part 145 repair station certificate
```

A `"boilerplate"` return is a **full release**: `gradeCoverageV2:1022` drops the obligation (ledger only), so it
never reaches `disqualifierUncovered` and never caps. **The failure direction is FALSE-BID.**

**What is and is not already known.** The register-token half is documented at `:361-363` as a KNOWN LIMITATION
and deliberately left — *"widening it is a behaviour change to a ratified branch and is out of this item's
scope."* The **private-issuer half is not documented anywhere**: it was armed yesterday to add escalation, and at
this one branch it adds none. The arming card reasoned about over-fire risk; this is the opposite failure and it
was not in scope when the note was written.

**Reachability is narrow** and I will not overstate it: it needs a sentence that matches no `DISQUALIFIER_RE`
token, no `BOILERPLATE_RE` verb, a NOOP-REP frame, *and* a register/private-issuer bar with no `BAR_SIGNAL_RE`
token. Realistic, not common. **Fixing it is one token** — `!hasBarSignal(ob)` for `!BAR_SIGNAL_RE.test(ob)` —
and the change is strictly more escalation, the safe direction. It is a **verdict-path change, so arming is the
CEO's**, exactly like `AUDIT_BOILERPLATE_BAR_SIGNAL_GUARD` one branch above.

---

## GATE-V2 — the degenerate case prints all-clear

```
gradeCoverageV2([]) → { unreadable: [], ungroundedRead: [], disqualifierUncovered: [], coverageGrade: 1 }
gateV2Outcome(...)  → { cap: null, reason: "Coverage complete (grade 100%)." }
```

Zero attestations ⇒ `totalWeight === 0` ⇒ `coverageGrade: 1` (`:1091`) ⇒ no cap and the most confident sentence
the module can emit. This is the *"an empty enforcement loop prints all-clear"* shape.

**It matters more than it would have, because of the finding below:** the V1 fallback that used to catch this
(`!inp.coverageComplete`) is not consulted when GATE_V2 is on. What still stands between a zero-attestation
package and a committal verdict is `documentsComplete` (`:3638`) and the findings-derived poles — not coverage.

**Not established here:** whether a real package can produce zero attestations. `buildManifest` was not audited
in this pass, and I am not going to assert reachability I did not measure. It is the first thing to check.

---

## `deriveVerdict` — `coverageComplete` is a dead input under production config

`:3580` / `:3614`:

```ts
if (GATE_V2_ENABLED && inp.coverageV2) { … }      // GATE_V2 armed, coverageV2 always threaded
else if (!inp.coverageComplete) { … INCOMPLETE }  // ← never evaluated in production
```

`grep` over the whole function body confirms `coverageComplete` appears **once**, in that `else if`. The
orchestrator still computes it (`audit-orchestrator.ts:2751`, a four-term conjunction including
`docCoverage.complete` and `!amendmentUnresolved`) and still threads it into `VerdictInputs`, where it is read by
nothing. The file's own comment at `:3621` acknowledges the bypass — *"the coverageComplete veto is bypassed
whenever GATE_V2 + coverageV2 are on"* — so this is known at the seam, but the input is still built and banked as
though it decided something.

---

## What is CORRECT and was checked — recorded so nobody re-chases it

- **`honestFailEligible()` vs `nhrEligible()`** — two helpers, `tristate ? null : false` and `tristate ? null :
  true`. With `AUDIT_ELIGIBLE_TRISTATE=true` (production) they are **identical**. The split only bites flag-OFF.
  Not a live divergence.
- **The 1-PRE hoist (`:3571`) drops the `withCoverageCaution` wrapper that 1b (`:3639`) applies** to the same
  INCOMPLETE message. Traced: 1-PRE is guarded by `!uncoveredDisqualifierPresent`, and `uncoveredCoverageCaution`
  is only ever set when that bucket is non-empty. The two are **mutually exclusive** — the card #687 regression
  fix. No information is lost.
- **`METHODOLOGY_VOCAB` contains `award`, `rejected`, `excluded`** — so a full LPTA consequence sentence passes
  the shape allowlist. The `hasBarSignal` belt at `:286` catches it (`\breject(?:ed|ion|s|ing)?\b` is in
  `BAR_SIGNAL_RE`). Belt holds.
- **`rankTierOf` containment matching (`:1250`)** is display-order only and cannot move a cap. Correctly scoped.
- **`consequenceTailsAfter` swallows a regex-compile failure** (`:762`) and returns `[]`. Fail-open, but the
  release is still ledgered and the pattern is escaped before compiling. Documented in place.
- **`AUDIT_VETO_NARROW_UNIVERSAL` and `AUDIT_RETIRE_VERBATIM_VETO`** are both unset. Both are ⛔ DO-NOT-ARM
  (standing order G4) and the file carries the end-Gauntlet non-green record inline at `:1127`.

## Hygiene

`audit-gate-v2.ts` parses **26 flags with `=== "true"` and 1 with `isEnvOn`**, while importing `isEnvOn` at line
22. Every production value is lowercase `true`/`false`, so nothing is currently mis-parsed — this is the exact
inconsistency **PR #470** exists to close, and that PR touches this file.

---

## Ranked, for the next session

1. **Fix the `:325` asymmetry** — one token, strictly more escalation, needs a CEO arm because it is a
   verdict-path change. It silently negates part of yesterday's arm.
2. **Measure whether zero attestations is reachable** from a real package (`buildManifest` + `completenessOf`).
   If it is, the degenerate all-clear is a live false-BID path.
3. **Decide whether the decline poles should stay dark.** `AUDIT_FOURWALLS_NOBID` is a real product question, not
   a bug: today a solicitation no offeror can satisfy produces "a human must look at this."
4. **Retire or rewire `coverageComplete`** — an input computed, threaded, banked and read by nothing is the
   shape a future session mistakes for a live guard.

**Nothing here was verified by a paid run.** These are source reads and $0 executions of the real functions.
