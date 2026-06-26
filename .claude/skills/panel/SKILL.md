---
name: panel
description: Run the best-in-class expert panel on a completed audit — 9 subject-matter experts, code-by-code / row-by-row vs the real SAM source, under a HARD scored rubric + adversarial "try to break it" protocol. Usage: /panel <audit-id-or-sol#>
argument-hint: <audit-id or solicitation number>
---
Run the standing multi-lens audit review on the audit identified by $ARGUMENTS (an audit id or solicitation number). Every expert obeys `.claude/agents/authorities/PANEL-METHOD.md` (hard rubric + auto-F gates + adversarial protocol) and reads its verified authority pack. From `~/faraudit-app`:

## 1. Resolve + render
Look up the audit (DB by id or solicitation_number → its id + notice_id) and render the export: `npx tsx scripts/audit-ai/render-audit.ts <id>`. Note the agency / contract type / set-aside / CUI signals — they decide which specialists fire.

## 2. Fan out the panel IN PARALLEL
Each agent re-fetches the real SAM source by notice_id and reviews row-by-row.

**CORE (always run):**
- @agent-ex-ko · @agent-contracts-attorney · @agent-capture-manager · @agent-pricing-analyst · @agent-proposal-manager

**SPECIALISTS (fire only when relevant — state in the synthesis which fired and why):**
- @agent-small-business-eligibility — if ANY set-aside or small-business consideration is present.
- @agent-cyber-cmmc — if DoD + CUI/CDI or any DFARS 7012/7019/7020/7021 clause is present.
- @agent-source-selection-evaluator — if it's a competitive negotiated procurement (FAR 15) with §M factors.

**ADJUDICATOR (always runs LAST, after the others return):**
- @agent-adversarial-redteam — receives the audit AND the panel's findings; tries to break both; kills any unsupported finding; sets the calibration floor.

## 3. Synthesize (one verdict)
Build a single grid: per-expert grade (A–F) + which specialists fired. Consolidate findings, adversarially de-duped. Apply the red-team's kill-list — drop any finding without a source citation. Surface DISAGREEMENT between experts rather than averaging it away. Output:
- Per-lens grade table.
- Confirmed bug/gap list (survived the source test), each with a source citation.
- AUTO-F triggers, if any.
- One overall A–F + a stamp / no-stamp recommendation with the named reason.

Reviews are free (flat-rate); only the audit RUN costs Opus. Verify on the real export vs source — never a DB proxy. Read-only.
