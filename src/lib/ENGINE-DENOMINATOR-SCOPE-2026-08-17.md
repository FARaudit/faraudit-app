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

### Step 0 — DONE 2026-08-17. Measured $0 against the production sweep.

Ran `sweepConstructionManifest` + `constructionRequired` + `constructionCoreMissing` — the production
functions, nothing reimplemented — over the 50 banked records carrying `input.fullSource`.

**Fidelity boundary, because it decides which numbers are quotable.** The records bank the ASSEMBLED
`fullSource`, never a per-document `{name,text}` array (**0 of 52**). So the sweep was fed one
pseudo-document:

- **FAITHFUL — `isConstruction` via the NAICS arm.** `input.naics` is banked and `/^23\d{4}$/` fires
  alone as authoritative SAM metadata (sweep :119–124).
- **FAITHFUL — element PRESENCE.** Production loops `for (const d of docs)`, so scanning the
  concatenation finds the identical element set. Only `sourceDoc`/`anchor` attribution differs, and
  none is reported here.
- **NOT ANSWERABLE — `docAttestations` (`hasText`, `groundableObligations`).** One pseudo-doc instead
  of ~45. **This is the layer the arm actually turns on, and it needs a re-ingest to measure.**

#### What it found

| question | answer |
|---|---|
| construction-positive, **by solicitation** | **4 of 17 (24%)** — all via the NAICS arm; the header arm fired **0** |
| construction-positive, by *record* | 20 of 50 (40%) — **inflated**: `FA813726R0033` alone is 16 records |
| `required` on those packages | **1 → a median of 5** (16 of 20 get the full carrier set) |
| core gate (`bonding · wage_determination · submission`) | would cap **4 of 20 records** to INCOMPLETE |
| layer B, measurable offline | **no** — only 2 of 50 records bank a `docCoverage` result at all |

#### The finding that was not on the list — `required` VARIES ON THE SAME SOLICITATION

`FA813726R0033` produced **three different `required` sets across 16 runs**, and it tracks the size of
what ingest happened to pull:

```
172,224 chars → [bonding, scope]                                    ← core MISSING ⇒ INCOMPLETE
250,437 chars → [bonding, scope, set_aside, submission]             ← core MISSING ⇒ INCOMPLETE
275–277k      → [bonding, scope, set_aside, submission, wage_determination]   ← complete
```

**The denominator is a function of what ingest pulled, not of what the solicitation contains.** The
carrier does not fix ingest variance — it *inherits* it.

Read the right way round, this is an argument **for** the arm and a warning about the optics: today
the short-ingest run sails through on a thin section list; armed, it correctly reports its core
elements missing and returns INCOMPLETE. **The gate catching a truncated ingest is the gate working.**
It is also precisely the trade in ruling 2 below — arming converts silent ingest shortfalls into
visible honest failures, and there are more of them than the demo would like.

#### What step 0 does NOT license
It does not license arming. It measures the *element* layer, which is the smaller half. The per-document
attestation layer — the one that turns 44 named uncovered documents into a real denominator — remains
unmeasured offline, and `AUDIT_CONSTRUCTION_DECIDED`'s OOS cap is still unruled. **A G1 arm request
should wait for a re-ingest measurement of `docAttestations` on at least the 4 construction
solicitations.**

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
