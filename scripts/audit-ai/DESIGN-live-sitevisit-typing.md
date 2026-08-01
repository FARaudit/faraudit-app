# DESIGN — the live site-visit bar is mis-typed as unmovable

**Status:** DESIGN ONLY. Not built. TIER V by construction (`src/lib/audit-decide.ts` ∩ the finding-typing
path), so the standing battery requires an **expert panel on this design BEFORE any build**. Written
2026-07-31. Verified at $0 against the banked corpus and the emitter source; no paid run.

---

## The finding

`emitNoticeBodyEligibilityBars` (`src/lib/audit-orchestrator.ts:1335–1372`) branches four ways on what the
SAM notice body says, then pushes **one uniform typing for all four**:

```ts
kind: "eligibility_bar",
controllability: "bidder_cannot_move",
curableInWindow: false,
// no requiredAttribute
```

Branch 2 fires when a site visit is stated but **has not concluded** — the notice's own words are
*"attendance gates eligibility to propose; verify and plan to attend."* A site visit that has not happened
yet is attendable: the bidder RSVPs and shows up. It is typed as a bar the bidder **cannot move**.

That contradicts the controllability rule the chief judge is instructed with verbatim: *a requirement the
BIDDER controls is an unmet **gate-to-clear** — enumerate it, but it NEVER downgrades the verdict.*

### Measured, in the banked corpus

| Branch | Findings | Typing emitted | Correct? |
|---|---|---|---|
| 1 · site visit **CONCLUDED** | 9 | `bidder_cannot_move` · `curable=false` · no attr | ✅ **correct** — verified against source: *"You must attend the Initial Site Visit for the project to be considered eligible to propose"* + *"Site Visit was held and concluded on May 28, 2026"*. Whether the firm attended is a genuine unverifiable firm fact. Rule 70 case (c) applies. |
| 2 · site visit **LIVE** | 2 | `bidder_cannot_move` · `curable=false` · no attr | ❌ **mis-typed** — attendable ⇒ bidder-controllable |
| 3 · clearance | 0 | — | not exercised |
| 4 · generic | 10 | mixed (see below) | — |
| 5 · BOA holder-only | 9 | `bidder_cannot_move` · `curable=false` · no attr | ✅ correct class, ⚠️ unreachable (see Unit B) |

Branch 4 already shows **two** typings in the corpus — `bidder_controls · curable=true · attr=sam_registration`
alongside the default. Something downstream is already re-typing this class correctly. That something is the
mechanism this design uses.

---

## Unit A — one row in an existing, ratified table

`applyClauseKeyedTypingFloor` (`audit-decide.ts:3175`) already does exactly this job: for an untyped
disqualifying eligibility bar whose **operative shape** positively matches a ratified self-clearable class, it
stamps `controllability: bidder_controls`, `curableInWindow: true`, and a `requiredAttribute`, so
`disposeFinding` yields a **named gate-to-clear** instead of a mute. It is flag-gated on
`AUDIT_CLAUSE_TYPING_FLOOR`.

Proposed: **one new entry in `RATIFIED_TYPING_CLAUSES`** for the attendable site visit. No new mechanism, no
new flag, no new code path.

The existing safety machinery already covers the ways this could go wrong, which is the reason to reuse it
rather than write something adjacent:

- `if (f.requiredAttribute) return f` — an attribute-bearing bar is **never** floored, so no real
  who-can-win credential can be demoted by this change.
- `hasPreAwardPossession(operative) || hasLongLeadCredential(operative)` — fail-closed override.
- Positive **shape allowlist**, not a vocabulary blocklist, matching standing doctrine.

### The crux, and where this design can fail

The new pattern must match branch 2 and **must not** match branch 1. Getting that wrong in the permissive
direction converts a correct mute into a false BID — the cardinal sin.

Two hazards, both of which have bitten this repo before and must be in the panel's scope:

1. **Do not key on the absence of a concluded-marker.** "Proceed only if `<attendable shape>`" is required;
   "proceed unless `<concluded shapes>`" leaks on the first paraphrase.
2. **Do not key on our own generated requirement prose.** Branches 1 and 2 are trivially separable today
   because *we* wrote both strings — but a lens-emitted site-visit bar arrives in the model's words, not
   ours. The recognizer has to work on the **grounded excerpt**, which is the notice's language.

A `NON-MANDATORY site visit` that nonetheless says *"all companies MUST register"* is a live specimen of the
trap: `AOCSSB26R0023`, adjudicated **BID_WITH_CAUTION**. It is the acceptance case.

---

## Unit B — separable, and it softens nothing

Branches 1 and 5 are correctly muted, but they carry **no `requiredAttribute`**, and `firmStatus` returns
`"unknown"` on its first line for any finding without one:

```ts
if (!profile || !f.requiredAttribute) return "unknown";
```

So no bidder profile — however complete, however authoritatively sourced — can ever clear them. Proven: a
profile asserting attendance and vehicle-holding under seven spellings with `verified_import` provenance
moved **0 of 10** records (`_claim3-falsify.ts`).

Proposed: the emitter stamps a canonical `requiredAttribute` on the branches whose class it already knows —
`sitevisit:attended` (branch 1), `vehicle:holder` (branch 5), `clearance:facility` (branch 3).

This **cannot soften a verdict**: the typing floor explicitly skips attribute-bearing findings, so stamping
an attribute makes a bar *more* protected, not less. Its only effect is to make the bar reachable by a
profile that legitimately answers it. It is independently shippable and does not depend on Unit A.

**Unit B is necessary and not sufficient on its own** — the product must also *ask* the customer the two
questions. That is a form change, not an engine change, and it is worthless until Unit B lands.

---

## What this design does NOT claim

- It does not touch branch 1. The concluded-visit mute is correct and stays.
- It does not change the completeness formula, GATE-V2, or any verdict exit.
- It does not claim a false-decline rate. We still cannot compute one: the gold-set expectations and the
  banked runs overlap on a single specimen, and that one expects a decline.

## Acceptance, before this is called done

1. Panel on this design (TIER V gate 1) — **not yet run**.
2. Certs falsifiable in **both** directions: branch 2 re-typed, branch 1 provably untouched, planted
   positives on each.
3. Gold-set 28/28 in **both** flag states.
4. `AOCSSB26R0023` — the NON-MANDATORY-plus-MUST-register specimen — must not mute.
5. Byte-identity with `AUDIT_CLAUSE_TYPING_FLOOR` off.
