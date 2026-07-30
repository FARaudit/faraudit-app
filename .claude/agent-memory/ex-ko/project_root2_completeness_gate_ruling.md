---
name: root2-completeness-gate-ruling
description: KO panel design ruling on card #648 ROOT-2 (stub certified complete) — single placement at assembly, no 5th deriveVerdict gate
metadata:
  type: project
---

Card #648 ROOT-2 design ruling (2026-07-21): REJECTED dual placement (assembly + new deriveVerdict gate); ruled SINGLE placement at assembly so the existing `documentsComplete===false` cap (audit-decide.ts:3255) fires unchanged.

**Why:** C-1 "ONE completeness computation" doctrine (audit-executor-v3.ts:672-677) exists because the independent `docsIncomplete` recompute drifted before; `agenticManifestComplete` is the single truth feeding BOTH persisted `documents_complete` AND VerdictInputs. A 5th deriveVerdict gate would also need mirroring in `deriveShadowVerdict` (line ~3150 asymmetry cap) before the Phase-2 pole flip — two more drift surfaces.

**How to apply:** Key holes found (re-check if design resurfaces): (a) `files_total = plan.length - nearDupCount` — comparing resourceLinks.length against the DEDUPED total false-INCOMPLETEs every near-dup package; compare against raw plan.length. (b) expectedDocs must be pinned at ENQUEUE time (worker retrieval was the degraded surface in #648 — max() of two worker-degraded surfaces can still be 1). (c) Stub char-floor belongs in the `bindingContentLossDocs` family, scoped to the SAM arm anchored to manifest sizeBytes — an absolute floor on uploads false-INCOMPLETEs legit tiny docs (user-supplied = authoritative per line 79 doctrine). (d) INCOMPLETE (not NHR) is the correct pole — "unfetched" is literally enumerated in the 1b gate comment; #648's NHR was a downstream accident, not precedent. Overflow stays its own reason string; fire the defect reason only when expectedDocs > plan.length.
