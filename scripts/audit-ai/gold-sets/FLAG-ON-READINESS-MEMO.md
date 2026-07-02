# FLAG-ON READINESS MEMO — Part-12 / eligibility engine flags (Card 211, $0 recon)

Readiness reference for the FUTURE CEO flip-to-prod checkpoint. **No flips executed here — memo only.** All four flags are built, merged, and default-OFF in prod (byte-identical). The live validation (card 210) exercised all four together over SP3300 → BID_WITH_CAUTION · eligible=null · billable=true.

## THE FOUR FLAGS
| Flag | Card | What ON does |
|---|---|---|
| `AUDIT_PROCUREMENT_TYPE_SECTIONS` | 197 | `detectSections` emits `combined-synopsis` for a bare FAR 12.603 notice; commercial coreMissing honest-fail fires (INCOMPLETE) only when BOTH 52.212-1≡§L AND 52.212-2≡§M are absent. |
| `AUDIT_SETASIDE_OVERTYPE_GUARD` | 187 | A mis-typed `no_one_can_move` socioeconomic set-aside → NHR disposition (never a false INELIGIBLE). |
| `AUDIT_ELIGIBLE_TRISTATE` | 206-A | (a) null-profile `already_satisfied` set-aside → firm-status verify-caution; (b) `eligible` tristate (null on honest-fail OR committal-with-unverified-gate; true only all-verified; false unchanged); (c) mandatory verify-caution. |
| `AUDIT_PROCEDURAL_COVERAGE_LENS` | 208-B | On part12 docs, grounds §L/§M procedural obligations → coverage completes → commercial docs reach a committal instead of INCOMPLETE. |

## EXACT PROD ENV CHANGES (per surface — Rule 17 parity)
Both surfaces run the same engine; set each flag on BOTH, identically:
- **Vercel `faraudit-app`** (customer sync route + report route): add env var `<FLAG>=true`, target `production`, then redeploy (env change needs a new deployment to take).
- **Railway `audit-worker`** (async multi-doc worker): add `<FLAG>=true`; Railway restarts the service on var change.
- Verify post-set: the Vercel-token env scan (all four → SET on production) + `railway variables --service audit-worker --kv` (redacted). NO local `.env.local` flip needed for prod behavior.

## VERDICT-WORD EFFECTS (Rule-61 rider — state before flipping)
- `AUDIT_PROCUREMENT_TYPE_SECTIONS`: adds honest-fails only — a bare combined-synopsis classifies part12; a commercial doc missing BOTH §L+§M cores → INCOMPLETE. Never turns a bar into a non-bar. Low risk.
- `AUDIT_SETASIDE_OVERTYPE_GUARD`: a mis-typed universal set-aside → NHR instead of INELIGIBLE (strictly safer).
- `AUDIT_ELIGIBLE_TRISTATE` — TWO verdict-word effects (the material ones):
  1. A null-profile `already_satisfied` set-aside → BID_WITH_CAUTION (was BID) + eligible=null.
  2. **A CLOSED-WORLD profile that PROVES it FAILS a set-aside → INELIGIBLE** (the firm-status gate's proven-fail arm, now enabled by this flag). Doctrinally correct (a proven-fail set-aside IS ineligible), but it is a verdict-word change for trusted/gold closed-world profiles — call it out to the CEO.
  3. eligible becomes null on honest-fail (was false) and on any committal with an unverified eligibility gate.
- `AUDIT_PROCEDURAL_COVERAGE_LENS`: flips commercial §L/§M-incomplete docs from INCOMPLETE → a committal (BID/BID_WITH_CAUTION). **DEPENDENCY:** must be ON only WITH `AUDIT_ELIGIBLE_TRISTATE` — otherwise a null-profile commercial committal returns eligible=true (the card-205 zero-loss exposure). Do NOT flip procedural without tristate.

## FROZEN-ANCHOR FLAG-SCOPING / WHAT MUST BE GREEN
- `verify:gold-integrity` is **flag-INDEPENDENT** (source/key/retired SHA checks) — must stay ALL-PASS before and after any flip; it does NOT re-grade verdicts.
- The gold ANCHOR expected-verdicts in `gold-set-registry.json` were authored under DEFAULT flags (OFF). The decide test suites already prove both states: flag-OFF byte-identity AND the flag-ON behavior — `test-eligible-tristate` 30/30, `test-procedural-coverage` 20/20, `test-procurement-sections` 18/18, `test-combined-synopsis-emit` 11/11, plus `test-replay-harness` 15/15 and `test-precondition-overtype-floor`. Prod flipping does NOT require re-authoring anchors (they are dev fixtures graded flag-OFF in CI). If anchors are ever graded under flags-ON, their committal/eligible expectations must be re-authored flag-scoped.
- Pre-flip gate to run: `tsc` clean · all six decide/detection gates green · `verify:gold-integrity` ALL-PASS.

## RECOMMENDED FLIP ORDER / GROUPING
The card-210 live validation proved the **all-four-together** set on SP3300. Two viable paths:
1. **All-four-together (validated)** — matches exactly what card 210 proved live; one CEO checkpoint. Simplest, and the only combination with a live proof.
2. **Incremental (more conservative)** — Group A `AUDIT_PROCUREMENT_TYPE_SECTIONS` + `AUDIT_SETASIDE_OVERTYPE_GUARD` (adds honest-fails / safer set-aside typing, no committal change) → verify → Group B `AUDIT_ELIGIBLE_TRISTATE` (eligibility guarantee) → verify → Group C `AUDIT_PROCEDURAL_COVERAGE_LENS` (LAST — it depends on tristate; never before it).
- **Hard rule regardless of path:** `AUDIT_PROCEDURAL_COVERAGE_LENS` must never be ON without `AUDIT_ELIGIBLE_TRISTATE`.
- Recommendation: **path 1 (all-four)** since it is the only live-validated combination and rollback is trivial; fall back to path 2 if the CEO wants staged prod observation.

## ROLLBACK
`unset <FLAG>` on each surface → default-OFF → byte-identical to pre-flip. **No migration coupling:** none of the four flags gate a DB write, schema, or migration — all are pure in-engine logic (confirmed: no `supabase`/SQL path keys on any of them). Rollback is instantaneous and lossless; no data cleanup required.
