---
name: gauntlet-rt8-round2-p0s-not-closed
description: RT8 round-2 review of claude/rt8-code-review-fixes (HEAD 0dfbcdd) — both "closed" P0s reopen on trivial surface variants; grade F; the supplied diff was STALE by one revision
metadata:
  type: project
---

Round-2 adversarial review of `src/lib/audit-force-grounding.ts` + `src/lib/audit-absence-reconcile.ts`
on branch `claude/rt8-code-review-fixes` @ 0dfbcdd. Both flags DISARMED. Verdict: **F — do not arm.**

**Why:** both P0 fixes are pinned to the exact string the previous round used, and reopen on paraphrase.

- **P0-A (`assertsDocAbsent`).** `MODIFIER_OBJECT` only inspects text BEFORE the token, so it misses every
  case where the matched doc is a LEFT modifier: `The PWS's appendix is not attached`, `PWS Appendix B is
  not attached`, `The PWS-referenced drawing package is not provided` — all still refute and delete a true
  warning. `COORDINATED_SUBJECT` tests only the span between the token and the copula, so it protects every
  list item EXCEPT the last: `The drawings and the QASP are not provided` refutes off the present QASP and
  deletes the true drawings warning. The shipped test passes only because its fixture has no region for the
  final conjunct.
- **P0-B (`isHeadingLike`/`sourceSegments`).** Merge requires ≤6 words AND no terminal `.!?`. 5 of 6
  realistic line-broken shapes still fire and soften a REAL obligation: heading with a period (the live
  61aaaa95 source's own clause row is `52.237-1 Site Visit.`), heading >6 words, obligation two lines down,
  next-sentence pronoun subject, reversed word order. Conversely on an UNTERMINATED clause table the merge
  chain swallows `Require` from the adjacent clause title — reproducing the very ±250-window failure the
  comment says it avoids. The `_rt8-window-probe.ts` reasoning is selectively read: ±80 and ±150 are clean
  on the real source; only ±250 fails.

**Method notes worth reusing.**
- **The supplied diff was STALE by one revision** — it omitted the `sentencesNaming(source, subject, merge)`
  split and the `quotable`/`pool` quote selection that are in HEAD. Symptom: a hand-trace disagreed with the
  executed output. Always `git diff main...HEAD` yourself and md5 the file against HEAD before tracing.
- Executing beats tracing here: a 40-line probe over the SHIPPED exports found 8 dangerous-direction
  refutations that the 34-test suite was green on.
- Real source is reachable $0: `audits.raw_pdf_text` for `61aaaa95-b205-43b0-bf41-0a25fdd9265e`
  (135,074 chars, "mandatory" absent). Run probes with
  `NODE_PATH=/Users/josearodriguezjr./faraudit-app/node_modules npx tsx <scratchpad>.ts`.

**Secondary (real, lower rank).** The `"What the source says is: …"` quote is `best.slice(0,140)` with a
closing quote and no ellipsis — a mid-word cut published as verbatim source. `SUBJECT_STOP` adding
`and`/`or` plus the `{0,3}→{0,6}` widening plus the new `subjectInline` lowercase produce customer-facing
garble: `this terms Conditions acknowledgement is mandatory`. `fitToRender` splits a surrogate pair at
budget-1. The `persisted == rendered` claim is TRUE (fitToRender ≤400 ⇒ `truncateOnWord(...,400)` is a
no-op), but on the #7 unanalyzed branch 236 chars of fixed boilerplate leave the risk sentence severed.

Related: [[gauntlet_rt8_absence_force_grounding]] (round 1), [[feedback_write_the_falsification_probe_first]],
[[feedback_grounding_checks_excerpt_not_claim]].
