---
name: design-271-effective-map-review
description: "#271 effective-map DESIGN review — predicate coupling is sound but the REMEDY isn't: FALLBACK_BUNDLE_KEYS [B,C,L,M] itself starves proposal_compliance under INTEGRITY=off (armed combo), so the honest predicate triggers a fallback that re-opens the same lens-dark hole"
metadata:
  type: project
---

Design review (2026-07-21) of `ceo/271-EFFECTIVE-MAP-DESIGN.md` before build. The core pivot (predicate calls `lensAssignedSections(l,"commercial")` = the reader's own function, single reader site verified: agentic-panel-runner.ts:429/441 → agentic-sections.ts:267) IS sound. But the design's safety conclusion is refuted:

1. **P0 — the fallback is not fail-toward-safe.** `FALLBACK_BUNDLE_KEYS=["B","C","L","M"]` (panel-doc-class.ts:126). Under INTEGRITY=off (the LIVE armed combo) proposal_compliance's effective map is UCF `[H,I]` — intersection with the fallback bundle is EMPTY. assembleLensPasses → both keys blank → the lens is called on the "(none of this lens's assigned sections were found)" placeholder (runner:435). So detect-starved → fallback → STILL 0 chars. The fix makes the LOG honest and inflates cost; the lens-dark outcome survives. Remedy shape: derive the fallback keys from the UNION of effective assignments (seenRaw dedupe in assembleLensPasses makes full-src-under-every-owned-key safe, one read per lens).
2. **P1 — overlay shrinks the "whole-source" fallback.** panel-adapter.ts:117 `{...base, ...ucfSectionText}`: lenient-detector mixed-case §L/§M slices OVERWRITE full-src entries on the fallback path — a [L,M] lens can read two junk slices while the log prints WHOLE-SOURCE.
3. **P1 — `.some()` starvation is too weak + §L tightening makes V2 weaker than legacy.** A [L,M] lens fed only M is "safe"; a real-but-unanchored §L lands inside the §C slice and the source-selection lens never sees the submission instructions (legacy `L&&M` predicate would have forced fallback). Under-routing ≠ cost-only.
4. **P1 — `^`-anchor trap:** routeCommercialSections rebuilds every anchor with hardcoded flags `"ig"` (panel-doc-class.ts:107) — a line-start-anchored arm silently no-ops without `m`.
5. **P2 — phantom `PANEL_LENS_KEYS`** (doesn't exist anywhere); **P2 — `PRODUCIBLE_COMMERCIAL_KEYS` is a second hardcoded predicate constant** that must mirror the router's anchor keys (same defect class the design fixes).

**Why:** the reconstruction-treadmill tell again — coupling the predicate fixed the DETECTOR but nobody re-derived the REMEDY against the same effective map; fifth payoff of the flag-combo/effective-config sweep.
**How to apply:** when a design says "fail-toward-safe fallback", trace the fallback path for the EXACT lens the predicate just declared starved, under the ARMED flag combo — a fallback keyed on a hardcoded key-set is itself a predicate/reader divergence. Also check spread-overlay order on any "higher-quality slice" merge.
