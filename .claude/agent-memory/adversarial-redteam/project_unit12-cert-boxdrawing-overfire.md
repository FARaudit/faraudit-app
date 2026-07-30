---
name: unit12-cert-boxdrawing-overfire
description: Unit12 FINAL CERT = DISSENT grade C; arm-B floors clean box-drawing/dot-leader table sections
metadata:
  type: project
---

Unit #12 obligation garble floor (`AUDIT_OBLIGATION_GARBLE_FLOOR`, default-OFF) FINAL DRY CERT = **DISSENT grade C** (NOT DRY).

**Break — NEW class R1/R2 never probed:** `looksMojibake` arm B (non-ASCII non-LETTER symbol density ≥25%) floors clean, readable, correctly-covered sections rendered with **Unicode box-drawing glyphs** (U+2500 block `│ ─ ┼ ═ ║`) or **middle-dot dot-leaders** (U+00B7 `·`, Word leader-tab glyph). These are punctuation not `\p{L}` so R2's letter-exclusion doesn't rescue them.

**Why:** R1 probed ASCII tables; R2 probed foreign LETTERS + non-letter *salad*. Neither tested the structural-glyph class a real pdftotext extraction of a ruled table / dot-leader ToC produces.

**PROVEN end-to-end** (real completenessOf→coverageComplete→deriveVerdict, obligation-verb-free = on valve): org/staffing ruled table (55% sym), dot-leader ToC U+00B7 (47%), CLIN price grid (67%) ALL flip floor-OFF `read_no_obligation`/missing=0 → floor-ON `obligations_ungrounded`/missing=1/**INCOMPLETE**. Pole-flip harness: covered=[M,J]→covered=[M]/missing=[J].

**Realism ~4-5/10 (→ C not F):** dot-leader ToC floors when dot-run≥~30ch vs title (short-title+long-leader = common shape). BUT dominant real case uses ASCII `.` leaders → sym=0 → correctly no floor; over-fire needs genuine U+00B7 glyph or box-chars-as-text-glyphs (most borders are vector graphics pdftotext drops). Real+reachable, narrower than R1's common-case tables. Cardinal-sin direction (crying-wolf → covered section to human review) → blocks DRY.

**Fix direction:** exclude structural/layout glyphs from symGarble count (Box Drawing U+2500-257F, Block Elements, U+00B7/2022/2026), OR gate arm B on symbol-VARIETY/entropy (true mojibake = many distinct symbols `¬þÆ¢Ø¡™`; a border = ONE glyph repeated `│││││`). SHAPE/allowlist, fail-toward-covered.

**R1+R2+boundary+determinism+flag-OFF ALL HOLD:** wage/CLIN/clause/acronym no-floor; CJK/Vietnamese/Cyrillic/Greek coherent letters no-floor; arm-A BOM<2% no-fire, FFFD/C1@3% fire; 300/75-of-300(25%)/6-of-300(2%) exact `>=`; pure+deterministic; flag-OFF valve byte-identical. R2 salad + homoglyph-underfire residual correct.

Probes: `scripts/audit-ai/_cert-unit12-{discriminator,boxdrawing,prodpath,poleflip,closed-boundary,realism-ceiling}.ts`. Verdict: ceo/redteam-unit12-cert.md. Supersedes prior R1(F)/R2(C) — this is the independent 3rd-round cert.
