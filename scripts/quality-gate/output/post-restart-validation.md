# Post-restart validation · FA301626Q0068

Date: 2026-05-04T15:39:03.626Z
Spend: $0.68 · 124.5s wall-clock

## Wiring
- `result.model_used` = `claude-sonnet-4-6` (expected `claude-sonnet-4-6`) · ✓
- `result.retry_escalations` = `[]` (expected `[]` for clean run) · ✓

## Trap detection (vs quality-gate run-2 baseline)
- hex-chrome (DFARS 252.223-7008): ✓ detected
- FOB conflict: ✓ detected
- DFARS engine flags: 9 (run-2 baseline: 5)

## Economics
- Calls: 4
- Input tokens: 172,068
- Output tokens: 10,662
- Cost: $0.68 (Sonnet pricing $3 in / $15 out per MTok)
- Wall-clock: 124.5s

## Full result
- Classification: `RFQ` (high)
- Recommendation: `DECLINE`
- Compliance score: 30/100

## Verdict

**PASS** — production defaults wire cleanly · Sonnet 4.6 holds trap parity · model tagging populates correctly · ready to bump BATCH_SIZE.