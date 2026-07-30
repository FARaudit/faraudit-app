---
name: sweep-pr269-doubleext-census
description: Retroactive hostile pass on PR #269 (Brain #624 double-extraction fix + Build-C census) — both headline claims FAIL on proven counterexamples; 3 defects to card, none fabrication-class
metadata:
  type: project
---

# Sweep: PR #269 (merged `b82f7fd`, Tier E, no adversarial round) — 2026-07-21

## CLAIM (a) "pass-2 reuse is byte-identical" — FAIL (narrow, LIVE, un-flagged)
The commit prose ("Reuse is byte-identical: both paths call the same extractText(buffer).rawText") is a false
universal. Proven divergence band: carried text with **0 < meaningfulLen < 50** (non-whitespace chars).
- Producer carries ANY non-empty pass-1 text: `sam-attachments.ts:1180` / `:1343` (`carryText = buf === f.buffer && f.text ? f.text : undefined`) — no floor, no placeholder check. `estimateDocTokens` returns text on `text.length > 0` (`sam-attachments.ts:974`), INCLUDING the extraction-failure placeholder.
- Consumer floor differs: `agentic-executor.ts:76` accepts existing only at `meaningfulLen ≥ 50`; sub-floor carried text falls through re-extraction and is returned by `return existing ?? ""` (`agentic-executor.ts:83`) — pre-fix returned `""`.
- Hostile (i)/(iii) PROVEN $0: corrupt/encrypted-style PDF → `extractText` throws → placeholder `"[PDF_EXTRACTION_FAILED: N bytes received]"` (`pdf-text-extractor.ts:231-238`, meaningfulLen≈40-46, inside the band) → REUSE doc.text = the placeholder string in fullSource; OLD path = `""`. Also proven for a watermark/stamp-only text layer ("DRAFT COPY 07/2026").
- Cert gap: `_cert-double-ext-624.ts` D uses a sentinel ≥ floor, E uses ABSENT text — the sub-floor band is untested. Perf claim also broken in-band (still double-extracts).
- What SURVIVED: keying is object-paired (text rides the same struct as buffer — no cache key, no collision, no staleness); truncation guard (`buf === f.buffer`) sound; hostile (ii) zero-text and (iv) mixed-doc byte-identical; `extractedText` has exactly ONE consumer (`audit-executor-v3.ts:184`).

## CLAIM (b) "census classifier can't be fooled" — FAIL (fallback arm + script char basis)
- AUTHORITATIVE arm SURVIVES all 4 hostiles: `has_text = hasEngineText && !partialPageText && !ocrSuspect` (`sam-attachments.ts:1184`); `hasEngineText` (`sam-attachments.ts:278`) kills placeholder-prefix, looksGarbled, <8 real words. Production flag-ON gate uses it + `machineReadableChars = fullSource.length` (`audit-executor-v3.ts:436-453`) — sound.
- FALLBACK arm (`isScannedDoc`, `cost-prescreen.ts:202-214`) fooled 4/4, PROVEN $0:
  (i) ≤1MB cover-only, no page meta → machine-readable (byte gate only fires >1MB — `:212`; CCITT B/W scans are routinely <1MB);
  (ii)/(iii) EXACTLY half pages text → machine-readable (`textPages/pages < 0.5` strict `<` at `:210` contradicts the "majority of pages" comment);
  (iv) mojibake/garble text layer → machine-readable (NO looksGarbled in the fallback; word-shape `/[A-Za-z]{2,}/≥8` passes spaced garble).
  Reachable in production on the single-doc-upload arm (`censusPackage(docs…)` at `audit-executor-v3.ts:453` passes only {bytes,text} — never pages) and in any future script without ingest meta.
- BIGGER census defect (deployed pre-fire SCRIPT, the tool actually used to certify fires): `_prescreen-buildC-N0016726Q1089.ts` sums `(d.text ?? "")` from the assembler carry — a TRUNCATED doc carries `text=undefined` (`sam-attachments.ts:1160/1180`) → contributes **0 chars** while the panel reads up to MAX_DOC_TOKENS=250k tokens ≈ 875k chars of it. Under-projects $ AND wall-clock on exactly the oversized-doc class the gate exists for; item-6 reconciliation checks docs/scanned/bytes but NOT chars → self-certifies. (The production flag-ON gate does NOT share this — it uses fullSource.length post-re-extraction.)

## Cards (defects carded, NOT fixed — READ-ONLY sweep)
1. P1 — short-band carry divergence (live, un-flagged): align carry gate with consumer floor (carry only meaningfulLen≥50 && !placeholder) OR make textOf's final fallback return "" for sub-floor existing.
2. P1 — prescreen script char census blind to truncated docs; add chars to item-6 reconciliation.
3. P2 — isScannedDoc fallback: add looksGarbled, fix `<0.5` boundary to match "majority" intent, revisit the 1MB byte gate.

## Durable lessons
- A "byte-identical reuse" cert must probe the FLOOR-MISMATCH band between producer carry gate and consumer accept gate — the two gates used different metrics (any-non-empty vs meaningfulLen≥50) AND different fallbacks ("" vs existing).
- The extraction-failure PLACEHOLDER is text-shaped — every text-quality gate (hasEngineText got it right) must string-match it; new carriers of extracted text must too.
- When a lib ships two classifier arms (authoritative + fallback), attack the FALLBACK and enumerate who can reach it; "production callers pass the authoritative signal" was true for the gate but the upload arm reaches the fallback with no page meta.
- Grep truncation trap (mine): my first `git grep | head -20` hid the production wiring of pipelinePrescreen — re-grep before asserting "script-only."
