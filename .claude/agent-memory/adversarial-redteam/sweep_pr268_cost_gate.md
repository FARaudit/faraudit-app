---
name: sweep-pr268-cost-gate
description: Retro adversarial sweep of PR #268 cost pre-screen (AUDIT_COST_PRESCREEN, flag-OFF) — refuse-path holds, ADMIT paths dodgeable (incomplete-bypass, upload ≤1MB classifier gap, token-density)
metadata:
  type: project
---

Retro sweep 2026-07-21, verified against origin/main (`29064ce` merge + Build C `5dcb188`/`c8b7ac5` + #628-3 `2e72401`). Working tree == origin/main for all gate files (git diff empty). All probes $0 local tsx (/tmp/rt268.ts) importing the real deployed lib.

## Verdict per attack

**ATTACK 1 (census-edge dodge to ADMIT): FAIL — three dodges, one fixture-confirmed hard.**
- **D1 (hard, fixture-proven):** upload/null-ingestion fallback classifier `isScannedDoc` (`src/lib/cost-prescreen.ts:202-213`) — the byte-density check only runs when `d.bytes > 1_000_000` (line 212); line 213 `return false` means any word-shaped cover (>=8 words, >=200 meaningful chars) on a doc **<=1,000,000 bytes** classifies NOT-scanned regardless of body. Fixture: 20 x 999,999-byte image-body docs w/ text covers -> census scanned=0/20, 20MB, **pass=true** (248s < 288s limit) — the OCR wall-clock term is fully suppressed. Directly contradicts the in-code claim "Ambiguity => scanned (fail-safe)". Production SAM path is IMMUNE (authoritative `has_text` from ingest, `machineReadable` short-circuit at :203); the hole is the `censusPackage` fallback (executor :453, null-ingestion upload path) only.
- **D2 (narrow, quantified):** the $ gate keys on CHARS; cost keys on TOKENS. E133 anchor implies 1.72 chars/input-side-token (579,462 input-side tokens / 995,368 chars). Admit-edge at fanout=5 is 69,027 chars (proj exactly $2.00 = gate). A package tokenizing at 1.3 chars/tok -> real ~$2.33 (inside cap, margin absorbs); at 1.0 chars/tok (dense digit-tables/CJK/symbol soup that clears garble floors) -> real ~**$2.74 > $2.50 cap**, outputs held fixed = conservative. The 20% margin absorbs density up to ~1.32x the anchor; beyond that the admit is wrong. Model-error class, not structural; recalibration schedule (marginForN) is the intended fix path.
- **D3 (placement, structural):** the $ projection prices ONLY the panel (E133 panel profile). Pre-panel LLM spend executes BEFORE the gate line (executor:436): OCR-LAYER3 vision confirms (~:296+), table-confirm, and — unacknowledged in comments — **chunked map-reduce extraction** (`assembleFullSourceChunked`, :247-255, Sonnet calls scaling with RAW chars, flag AUDIT_CHUNKED_INGEST). A refusal caps panel spend only; the in-code note "usageCalls holds only any ingest-time OCR confirm cost" under-states this when chunked mode is on.
- **Latent (not reachable today):** executor census `f.bytes ?? 0` (:451-452) zeroes `bytes: number|null`; fixture: a 31MB/40k-char package with null bytes admits at 232s where true bytes refuse at 398s. All three production `ingested:true` constructors set numeric bytes (sam-attachments:1184/:1346, api/audit/route.ts:404) so unreachable now — flag on any new ingestion producer.

**ATTACK 2 (decision on incomplete record): REFUSE path HOLDS / ADMIT path FAILS.**
- A REFUSAL cannot fire on a partial census: gate arms only on `manifestComplete && !constructionOOS` (executor:436), and manifestComplete cross-checks the manifest against the actually-ingested set + overflow. Item-6 doctrine satisfied for refusals.
- The DUAL is the hole: **manifestComplete=false => the entire gate is SKIPPED and the panel fires at full spend.** One flaky attachment, a mid-fetch failure, or default budgeted-mode overflow/truncation (MAX_FULLSOURCE_CHARS 1.4M, agentic-executor.ts:168) bypasses the cost gate on exactly the oversized class it was built for. Fixture PA2: a truncated 1.4M-char run at fanout-5 would have projected **$40.56 vs the $2.00 gate** — and runs anyway, producing at best an INCOMPLETE verdict. "INCOMPLETE wins" is correct for LABELING but silently forfeits the cost protection. Carded defect, not a fix-in-place.

**ATTACK 3 (flag-off no-op / on-coherence): PASS with a documented arm-blocker.**
- OFF is a strict no-op: single call site (executor:436), lib is pure, `preOcrScannedDocCount` snapshot (:295) is a pure read. No other consumer of the flag in src/.
- ON refuse-path record is coherent at the DB layer: rich re-checkable `pipelineBoundaryRecord`, no-charge quota mark, $0 ledger, 3x persist retry then THROW (no silent drop).
- BUT verified live: **zero render surfaces match size_boundary** in src/app + src/components on origin/main — a flag-ON refusal renders the wrong "INCOMPLETE payload re-run" shell. The in-code comment says exactly this and binds arming to three preconditions (fallback:none cert + render surface + Rule-61 arm card). Comment claims verified TRUE — honest, and the risk is confined to arming.

## Grade: C+
Refuse-side is doctrine-clean (complete-census-gated, no-charge, re-checkable, honest about its own arm-blockers), but the admit side is dodgeable three ways, and the incomplete-bypass (Attack 2 dual) defeats the gate's core purpose on the most expensive package class. No fabrication anywhere — every in-code factual claim I tested verified true.

## Repro
Probe: /tmp/rt268.ts (rebuildable from this file's numbers). Key anchors: cost-prescreen.ts:67 (costPrescreen), :202-213 (isScannedDoc gap), :243-251 (pipelinePrescreen); audit-executor-v3.ts:436 (arm condition = the bypass), :453 (census fallback), :459 (fanout-5 default via !AUDIT_ROUTING_CLEAN).
