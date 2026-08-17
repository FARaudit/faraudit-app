# The coverage denominator — what it actually is, and what fixing it costs

**2026-08-17. Measured at $0 from source, the banked run-records, and the live Railway `audit-worker`
flag state. No paid run was fired.** Companion to `ENGINE-STAGE-06-07-PLAN-2026-08-17.md`, which
named this as plan step 2 and deferred it as "months". This document is the scope behind that word.

---

## "The denominator" is three different things

The plan's `1.7%` collapses three independent layers into one number. They have different causes,
different fixes and different costs, and only one of them is a rebuild.

| layer | what it counts | measured state | where |
|---|---|---|---|
| **A · sections** | which sections must be covered | `required = ["L"]` — 1 of 53 | `buildManifest`, `audit-orchestrator.ts:241` |
| **B · documents** | which posted binding docs must be covered | computed, then discarded | `documentsCovered` :797 → `gradeCoverageV2` :1024 |
| **C · obligations** | which binding duties must be covered | 48 graded of 2,879 enumerable | `gradeCoverageV2` |

### Layer A — `required` is what a regex FOUND, not what the package HAS

```ts
export function buildManifest(ctx: AuditToolContext): string[] {
  if (procurementPart(ctx) === "part36-construction" && ctx.constructionManifest) return constructionRequired(ctx.constructionManifest);
  return BINDING_SECTIONS.filter((k) => readSection(ctx, k).present);   // ← the live path
}
```

A section the header regex did not locate is not "uncovered" — it is **not required**. So the gate
cannot fail on it. On the measured package that yields `required = ["L"]` against 53 regions.

### Layer B — the document proof runs, and the gate structurally cannot read it

`documentsCovered` (`audit-orchestrator.ts:797`) does the real work and names all 44 uncovered
documents. `gradeCoverageV2` (`audit-gate-v2.ts:1024`) takes:

```ts
gradeCoverageV2(attestations: SectionAttestation[], opts?: { locate?, verifyRecitalPresence?, consequenceTails? })
```

**No document parameter, and none of the three opts carries one.** The document result reaches the
verdict compressed to a boolean. This is not a tuning gap; the argument does not exist.

### Layer C — the obligation ceiling

The segmenter reaches 99.9% of package characters and enumerates **2,879** obligations (a floor — 6
regions hit a 200-obligation cap). The completeness proof grades **48**. This is the layer that
needs the rebuild, and it is the only one that does.

---

## ⚠ THE FINDING THAT CHANGES THE SEQUENCING — layers A and B are BUILT, and DARK

Rule 69's machinery — compression-stable anchors, per-document sealed attestation, the
survived-vs-analyzed join — **exists, is tested, and is not running in production.**

`src/lib/audit-construction-manifest.ts` (232 lines) implements exactly the design Rule 69
describes: every binding element sealed with a compression-stable anchor + source doc + sha256 of
the grounded region and of the whole document; `constructionCoverage` marks an element covered iff
its anchor **survived** into the read source **and** a grounded finding **analyzed** it; and
`DocAttestation` carries the per-document condition — *"an UNREAD / no-text attachment (hasText=false)
can NEVER be attested → INCOMPLETE"*. That is layer B, correctly built, on the honest side.

It is reached only through `procurementPart(ctx) === "part36-construction"`, which requires **two
flags**:

```ts
if (process.env.AUDIT_FORMAT_PART36 === "true" && ctx.constructionManifest?.isConstruction) return "part36-construction";
```
```ts
const constructionManifest = process.env.AUDIT_CONSTRUCTION_SWEEP === "true" ? sweepConstructionManifest(...) : undefined;
```

**Read from the live Railway `audit-worker` on 2026-08-17: `AUDIT_FORMAT_PART36` and
`AUDIT_CONSTRUCTION_SWEEP` are ABSENT from the environment entirely** — not false, not present:
absent. 135 boolean `AUDIT_*` flags are set on that service and neither of these is among them.

So on every package, production takes the thin `BINDING_SECTIONS.filter(present)` branch, and the
anchor machinery, the per-doc attestation and `constructionCoreMissing` never execute.

**What this does NOT mean.** It does not mean two flags fix the denominator:

- The carrier is **construction-scoped**. Rough upper bound on the banked corpus: 16 of 52 records
  (~31%) carry a construction signal — and that is a naive string/NAICS match, deliberately looser
  than production's primary-region-scoped `isConstruction`, so the true share is lower.
- The construction carrier has **five** element keys (`bonding · wage_determination · submission ·
  scope · set_aside`) plus per-doc attestation. That is a far better denominator than `["L"]`. It is
  not 2,879 obligations. **Arming it addresses layers A and B for construction. It does not touch
  layer C for anyone.**
- Arming plausibly **raises the INCOMPLETE rate** — the same direction measured for
  `AUDIT_ATTACHMENT_COVERAGE`, and for the same reason: an unreadable or truncated document that is
  currently invisible becomes a named, uncovered, honest failure. **That is the gate working.** It
  is also the opposite of what the demo wants, and the CEO should decide that trade knowingly rather
  than discover it in front of a prospect.
- There is an **open CEO ruling attached** — the construction OOS doctrine collision on
  `FA667024R0001`. `AUDIT_CONSTRUCTION_DECIDED` gates a narrowed OUT_OF_SCOPE honest-fail on
  design-heavy packages. Arming the sweep without settling that puts an unruled cap in the live path.

---

## The work, in the order it should happen

### Step 0 — measure the arm before proposing it ($0, no flag, no CEO gate)
Replay `sweepConstructionManifest` + `constructionCoverage` over the banked corpus **offline** and
report: how many packages classify `isConstruction` under the *production* detector (not my string
match); for those, how `required` changes; how many documents fail `hasText` and would become named
uncovered; and the resulting verdict distribution vs today. **Until this exists, "arm the two flags"
is a proposal with no measured blast radius** — and this repo has been burned by exactly that shape
before. Cheap, and it is the precondition for any G1 request.

### Step 1 — give the gate a document argument (layer B, general path)
Add a document parameter to `gradeCoverageV2` and thread `documentsCovered`'s real result through
instead of a boolean. Flag-gated, default-OFF, byte-identical off, with the corpus replay showing
the verdict delta both ways. This is the change that makes layer B real for the **69% of packages
the construction carrier will never reach**, and it is the one structural edit the plan's step 2
actually names. Medium: one new argument, one call site, one gate, one corpus replay.

### Step 2 — make `required` what the package CONTAINS (layer A, general path)
Only meaningful after step 1, because a wider `required` with no document channel just produces more
uncovered sections with the same blind spot. Depends on a ruling: see below.

### Step 3 — layer C, the obligation rebuild
The plan already costed the replacement: deterministic per-document extraction + schema-constrained
model adjudication, **batched — ~$1.46 Haiku / ~$4.37 Sonnet against today's $11.96**, for coverage
going 3.5% → ~100%. Retrieval and a bigger context window were both examined and rejected on
published evidence. This is the "months" item and nothing above blocks on it.

**Deliberately NOT sequenced here:** lens routing (M2). One lens receiving 2,098,225 characters is
real and it is orthogonal — it starves the analysis, it does not shrink the denominator. Fixing the
denominator first makes routing's failure *visible* rather than hidden behind a gate that never
asked.

---

## The rulings this needs before step 2

1. **How wide should `required` go?** Every region the segmenter sees is 53 sections and 2,879
   obligations. Requiring all of them makes almost every package INCOMPLETE until layer C lands.
   Requiring what a regex found is today's 1.7%. **The honest intermediate is per-document
   attestation (layer B) with sections left as they are** — that is what step 1 delivers, and it is
   why step 1 comes first.
2. **Is a raised INCOMPLETE rate acceptable while layer C is built?** Every step above is honest-net
   *tightening*. It moves packages toward "we could not read this", which is true and unsellable.
   The demo pressure runs the other way. This is a business call, not an engineering one.
3. **The construction OOS collision** (`FA667024R0001`) — already owed, and it gates step 0's arm.

## What is NOT in scope, and why

Two of the plan's three "fastest demo-visible wins" were measured this session and **neither buys a
prospect-visible verdict**: the bond-token mute flips 2 of 50 records and lands them on INCOMPLETE
(PR #718), and the untyped-bar leak fires on **0 of 50** — branch 5a is never reached. The
denominator is where the customer-visible behaviour actually lives, which is the argument for doing
it and the reason it cannot be made to pay off inside a month.
