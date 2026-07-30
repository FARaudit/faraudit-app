---
name: routing-v2-predicate-reader-divergence
description: Commercial routing V2 review — safety predicate validated a DIFFERENT map than the reader used (flag-combo hole); V2 anchors re-added the exact vocab the in-file doctrine comment banned
metadata:
  type: project
---

Review of `AUDIT_COMMERCIAL_ROUTING_V2` (panel-adapter.ts / panel-doc-class.ts, 2026-07-21) found the top defect class: a SAFETY PREDICATE must evaluate against the EFFECTIVE config the reader will use, not the intended one. `commercialRoutingSafe` checked `LENS_SECTIONS_COMMERCIAL` unconditionally, but `lensAssignedSections` only serves that map when `AUDIT_LENS_EMISSION_INTEGRITY` is ON — so ROUTING_V2=true + INTEGRITY=off certifies "no lens starved" against a map nobody reads (proposal_compliance reads UCF [H,I], gets zero). Same review: V2 anchors added `\bclin\b`, `line items?\b`, `technically acceptable` — the EXACT examples the in-file doctrine comment beside the V1 anchors bans as mid-content fragmenters.

**Why:** Third confirmed instance of the flag-combo sweep paying off ([[unit6cf-r3-composite-identity]] call-graph scan + truthy-vs-strict: V2 used strict `=== "true"` while every sibling flag uses tolerant `isEnvOn`).

**How to apply:** (1) For any guard/predicate gated separately from the code path it protects, diff the predicate's config source against the protected path's config source under ALL flag combinations. (2) When a diff adds constants NEXT TO a doctrine comment, read the comment — superseding constants that violate the adjacent ban is a recurring failure shape. (3) Anchor-slicing routers: always check the pre-first-anchor HEAD (dropped text) and what the "placed" predicate proves (presence, not fidelity).
