# Gauntlet Bench Protocol — bench-maximization (Code infra, ratified 2026-07-17, +2 Brain amendments)

**Scope: HOW a Gauntlet red-team round is *launched and run*. BENCH-ONLY — this file touches ZERO production
engine config. It governs the prompt Code composes for the `adversarial-redteam` subagent and the deterministic
replay of banked probes. Nothing here changes `src/lib/**` runtime behavior.**

Applies from the NEXT Gauntlet launch (a round already in flight finishes under its own rules — the R10 stamp
that ratified this protocol was NOT retro-changed). A NEW break found under this protocol extends the round count
exactly as before (Brain amendment: deterministic evidence body ≠ a free pass; a fresh break still costs a round).

---

## B1 — THINKING BUDGETS (two tiers)

| Round type | Budget keyword | Rationale |
|------------|----------------|-----------|
| **FINDING** round (attack the build, hunt new breaks) | `ultrathink` (max) | Novel-break discovery is the hardest reasoning in the arc — buy the whole budget. |
| **FORENSIC** pass (root-cause a live failure, e.g. the card #549 no-op) | `ultrathink` (max) | Root attribution is finding-class reasoning. |
| **STAMP / verification** round (re-fire the banked set, rule DRY) | `think hard` | Deterministic evidence review over a frozen regression set does not need max budget. |

**Physical homes of the B1 directive (both, by design):**
1. **DOCTRINE home** — `adversarial-redteam.md` frontmatter comment (`# thinking-budget:`) + the body's
   `## Thinking budget (Gauntlet Bench Protocol B1)` block. The agent *definition* cannot itself trigger a
   thinking budget (the harness reads the keyword from the *invocation prompt*, not the agent file), so the
   agent file is the WHY/WHEN home only.
2. **OPERATIVE home** — the `{{BUDGET}}` slot of the launcher skeleton below, which Code fills per round type and
   physically writes into the Agent-tool `prompt` string. That literal keyword in the composed prompt is the
   thing the harness acts on. (Panel core agents run a single /panel FINDING round → always `ultrathink`.)

---

## B2 — ROUND TEMPLATE (taxonomy-first, coverage-floor form)

Every round the composed prompt MUST carry these three, in this order, as its fixed spine:

1. **ENUMERATE ATTACK FAMILIES FIRST** — before probing, list the attack families for this target,
   regulation-grounded where the domain allows it (the R10 lesson: enumerate from the regulation/spec, not from
   imagination). The family list is the coverage contract.
2. **MINIMUM coverage per family, NO maximum / NO quota** — hit each family at least once; keep going while a
   family is still yielding. Family richness varies wildly (the arc's evidence: some families gave 3 probes,
   some gave 31) — a quota would either starve a rich family or pad a thin one. Floor, never ceiling.
3. **SELF-ATTACK OWN FINDINGS BEFORE REPORTING** — every candidate finding gets the refute-it-yourself pass
   (archaeology at the prior HEAD, direction check, realism check) before it enters the report. A finding that
   dies to its own author never reaches the ledger.

---

## B3 — GENERATOR / JUDGE SPLIT (codified trigger, not per-round judgment)

**MANDATORY** when the round attacks a **verdict-path boundary surface** — any of:
`classifier` · `gate` · `matcher` · `typing-map`. (These are the surfaces where a single mis-ruling flips a
customer verdict; an independent judge that did not author the generator's probes is required.)

**OPTIONAL** elsewhere (pure ingest/rescue/perf/cosmetic surfaces) at Code's discretion — a single agent may
both generate and adjudicate.

The trigger is evaluated from the round's `{{TARGET}}` / `{{SURFACE_CLASS}}` slots, NOT decided ad hoc.

---

## B4 — BENCH ROUTING TABLE (what runs on what, and why)

| Work | Runs on | Model tokens? | Why |
|------|---------|---------------|-----|
| **Probe REPLAY** (re-fire the banked regression set each round) | `_gauntlet-replay.sh` — `npx tsx` script execution | **NONE** | Deterministic assertions; a model re-reading probe output is waste and a non-determinism risk. The agent READS the harness's consolidated report, it does not re-run the probes itself. |
| **Forensic analysis pass** (root-cause a live failure) | `adversarial-redteam` @ **`ultrathink`** (B1 forensic tier) | Yes (max) | Root attribution is finding-class reasoning. |
| **Finding round** (hunt new breaks) | `adversarial-redteam` @ **`ultrathink`** (+ split per B3) | Yes (max) | The hardest reasoning in the arc. |
| **Stamp / verification round** (rule DRY) | `adversarial-redteam` @ **`think hard`** | Yes (reduced) | Frozen evidence review. |
| **Suite / reprove authoring + fixes** | Code main loop (session model) | Yes | The build itself. |

Doctrine: probe replay is SCRIPT, not model. Forensic and finding reasoning buy the max budget. Stamp buys less.

---

## THE LAUNCHER SKELETON

Code fills the `{{SLOTS}}` and passes the result as the `adversarial-redteam` Agent-tool `prompt`. The composer
`scripts/audit-ai/_gauntlet-compose.mjs` renders this deterministically (used by the dry-run proof).

<!-- SKELETON:BEGIN -->
GAUNTLET ROUND {{ROUND_N}} ({{ROUND_TYPE}}) — {{TARGET_TITLE}}. Branch `{{BRANCH}}` @ {{HEAD}}.
{{BUDGET}} — this is a {{ROUND_TYPE}} round (Gauntlet Bench Protocol B1: FINDING/FORENSIC=ultrathink, STAMP=think hard).
WRITE FINDINGS TO {{REPORT_PATH}}; return grade + ruling. Prior rounds: {{PRIOR_ROUNDS}}.

TARGET UNDER ATTACK: {{TARGET_DETAIL}}
SURFACE CLASS: {{SURFACE_CLASS}}  →  GENERATOR/JUDGE SPLIT: {{SPLIT_DIRECTIVE}}   (Bench Protocol B3)

ROUND SPINE (Bench Protocol B2 — fixed order):
1. ENUMERATE ATTACK FAMILIES FIRST for this target — regulation/spec-grounded where the domain allows (the
   families ARE the coverage contract; list them before you probe).
2. MINIMUM one executed probe per family, NO maximum — keep probing a family while it still yields; family
   richness varies (do not pad a thin family or starve a rich one).
3. SELF-ATTACK every candidate finding before it enters the report — archaeology at the prior HEAD, direction
   (safe/unsafe), realism. A finding that dies to your own refutation never reaches the ledger.

REGRESSION REPLAY (Bench Protocol B4a — SCRIPT, not model): the banked set is re-fired by
`bash scripts/audit-ai/_gauntlet-replay.sh` — READ its consolidated report at {{REPLAY_REPORT}}; do NOT re-run
the probes yourself. Confirm every prior round is dead-or-sanctioned. Sanctioned ledger: {{SANCTIONED_LEDGER}}.

DELIVER: {{DELIVERABLE}}. A NEW break extends the round count (deterministic evidence ≠ a free pass).
<!-- SKELETON:END -->

---

## B6 — EXECUTED-REPRODUCTION RULE (ratified Brain 2026-07-22, RULING 7)

**No engineering finding is EXECUTED on without an executed reproduction or a Code verification pass.**

Brain-side findings arrive as **HYPOTHESES**, not work orders. Code verifies BEFORE building. This is the B2.3
self-attack rule ("a finding that dies to its own author never reaches the ledger") applied one level up — to
findings entering from outside the bench.

**Procedure:** on receiving any finding/directive that prescribes a code change, first reproduce it — run the probe,
grep the symbol, read the call sites. If it does not reproduce, do NOT build; report the disproof with the evidence
and hold. A directive that cites a ratified ruling must be checked AGAINST that ruling's text, not accepted on the
citation.

**Why (the 2026-07-22 evidence that produced this rule).** Four directives arrived in one window; **three failed
verification**, and two of those would have re-opened false-BID paths in the arc built to close them:
| Directive | Verified state |
|---|---|
| P1-1 "collapse dual temporal derivation" | Already single-derivation — `deriveTemporalDisposition` called once. **No-op.** |
| P2 "remove dead RE_114" | `STRUCTURAL_BAR_RE_114` **live at 2 call sites**, a keep-the-bar false-BID veto whose own comment records that narrowing it caused "residual false-BID". **Would have deleted a backstop.** |
| SEC-P1 "add 52.204-23 to the §889 family" | No such family exists; the cited ruling **EXCLUDES** §889, and the design doc names the change as "the exact product-killing failure the arc exists to end". |
| "temporalClosed render shipped in PR #279" | PR #279 is an **email** commit; `git log --all -S temporalClosed` = **zero commits**. |

Meanwhile a genuine P1 (the live-deadline CLOSED branch dead on real SAM data) sat undetected in the same subsystem
until an agent **with execution access** went looking.

**The generalisation: findings asserted from READING fail; findings proven by EXECUTION hold.** Applies to Brain,
to Code, and to subagents equally — a subagent's confident ledger entry is a hypothesis until re-executed (the R1
judge refuted the generator's coupled-hazard note on exactly this basis).

**Corollary — GREEN GATES ARE NOT CORRECTNESS.** Both 2026-07-22 ultra findings were invisible to a full green
battery (gold-set 28/28, shadow corpus 0 deltas) because the FIXTURES were wrong: every temporal fixture used a
date-only deadline, a format SAM never emits. Green means "no regression against the fixtures I have". When a fixture
world can be wrong, say so rather than reporting green as proof.
