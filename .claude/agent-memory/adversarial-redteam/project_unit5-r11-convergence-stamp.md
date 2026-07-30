---
name: unit5-r11-convergence-stamp
description: Unit5 Gauntlet R11 CONVERGENCE — grade A; R10 second-subject fix closes the REALISTIC over-fire space; sole residual is a CONTRIVED elided-that+uninflected P3; dedup-toward-committal + real corpus clean
metadata:
  type: project
---

Unit 5 QUANTITY-AMBIGUITY FIDELITY GATE, Gauntlet R11 (GENERATOR) @ `a6e6431`. Report `ceo/redteam-unit5-r11.md`.

**GRADE A / CONVERGENCE — the realistic over-fire space is CLOSED.** Terminal state of the r6–r11 embedded-declarative-clarity-question arc.

**What R10 fixed (@a6e6431, one commit past r10 finding):** the noun-headed content-clause frame ([[unit5-r10-frame-enumeration-seam]]) is closed by POSITIONAL second-subject detection in `qaEnclosingQuestion` (`audit-decide.ts:1649-1650`): `QA_SUBJ_PRONOUN_RE` rejects a subject-pronoun-with-content; `(subjTrim.match(QA_DETERMINER_G_RE)??[]).length >= 2` rejects a 2nd determiner-headed NP. Plus the pre-colon widening now requires the wh-word's OWN copula predicate (no do-support/pronoun/2nd-determiner in `preColonBody`).

**The ONE surviving seam (R11-1, P3 SANCTIONED — NOT a grade-dropper):** an embedded 2nd subject that is NEITHER a pronoun NOR determiner-headed — a bare non-`-s` noun / noncount / possessive-headed NP (`your/our/their` ∉ both sets) / proper noun — with a base/irregular embedded verb, no complementizer `that`, terminal pair. E.g. "Is the assumption staff bill 520 hours or 1,040 hours?" 9/11 benign probes over-fire (the 2 quiet only because 2nd subj ends `-s` → morphology catch = SAFE under-fire); BID→BWC flip CONFIRMED live (eligible:true preserved). **But it is CONTRIVED, not realistic:** the 3 NATURAL forms of the same clarity concern are ALL safely handled — (B) add `that`→`QA_AUX_RE` catch; (C) inflect verb (`bills`/`reflected`)→`QA_FINITE_MORPH_RE` catch; (A) genuine "Is the estimate 520 or 1,040 hours?" fires correctly. The survivor requires the unnatural intersection elided-`that` ∧ uninflected-verb ∧ non-`-s`-2nd-subject that no real SAM sol/Q&A contains. Same family as r8/r9/r10, one step more contrived each round.

**Everything else CLEAN (all EXECUTED):** dedup dangerous direction 0 false-suppressions/7 cases (R4 delimited-hasNum lock holds — 52.219-1040/5W520 embedded digits still emit; genuine dups suppress). Real corpus seq1=0, seq2=1 on the genuine "Is the total requirement 520 hours\nor 1,040 hours?" (read `rec.input.fullSource` len 149035). 3 realistic SAM Q&A paragraphs: genuine fires 1, all-declarative+directive fires 0. ReDoS 0-1ms on 16K-39K adversarial. Flag-OFF byte-ident (same ref). Idempotent. R1-R10 locks 0 regressions, 4/4 genuine controls fire. Suite ALL GREEN, reprove GREEN.

**Doctrine:** genuine convergence — r8→r11 migrated correctly to verb-vocab-INDEPENDENT positive-shape (morphology→frame→positional 2nd-subject), the no-blocklist doctrine. Terminal fix if pursued = reject ANY 2nd predication by requiring the subject region reach the pair with NO 2nd finite-verb-position token regardless of 2nd-subject POS — NOT required to ship (P3 sanctioned). Probes `scripts/audit-ai/_rt-unit5-r11-*.ts`. Supersedes [[unit5-r10-frame-enumeration-seam]].
