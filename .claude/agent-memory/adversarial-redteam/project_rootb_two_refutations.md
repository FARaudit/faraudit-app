---
name: rootb-two-refutations
description: Two recurring red-team claims that are REFUTED at source — the SECTION_READ_CAP "silent truncation" claim and the "no path emits a questions deadline" claim
metadata:
  type: project
---

Two claims raised in the root-b design review round (2026-07-28) are REFUTED against source. Re-verified from files, not recall.

**b1 — "SECTION_READ_CAP=12000 silently truncates read_section with no continuation" — REFUTED.**
`src/lib/audit-tools.ts:133` `SECTION_READ_CAP = 12000` is real, but the truncation is neither silent nor consequential to the verdict:
- `readSection` returns `truncated` in its result object (`audit-tools.ts:166`) — the lens is told it saw a SLICE.
- The completeness proof does NOT read the capped view. `sectionFullText` (uncapped, `audit-tools.ts:171`) is what `audit-procedural-coverage.ts:109` grounds against, so an obligation past the cap surfaces as UNGROUNDED ⇒ INCOMPLETE, never a false COMPLETE.
- A continuation path exists for the highest-risk tail class: `SECTION_RESCUE_MARKER` + `extractLaborStandardsBlocks` under `AUDIT_LENS_EMISSION_INTEGRITY`, with an explicit partial-rescue note and a `console.warn` when the rescue itself is cut.
The residual true statement is narrower: non-labor-standards tail content is not rescued into the lens view. That is a coverage limit, not a silent-truncation defect.

**b5 — "no code path can emit a questions deadline (keyfact-detector `/question/i` skip + COMPETING_DATE_CTX)" — REFUTED.**
The `/question/i` skip at `audit-keyfact-detector.ts:127` sits INSIDE the QUOTE-deadline emitter's branch (i); it prevents a "Question Response Due Date" line from being mislabeled as the quote deadline. It does not suppress questions deadlines globally, and the keyfact detector is not the only emitter. Production evidence, non-test:
- `src/lib/audit-decide.ts:2452` `isInquiryDeadlineBenign` + `:2489` `applyInquiryDeadlineBenignGuard` — a guard whose whole job is classifying INQUIRY (questions) deadlines. Called live at `audit-orchestrator.ts:2820` (flag `AUDIT_INQUIRY_DEADLINE_BENIGN`) and read at `:3209`. A guard for questions deadlines exists only because questions deadlines reach the decider.
- `audit-decide.ts:2065` records the REAL seq-2 run dccce793: `"questions due July 14, 2026"` surfaced **2×**, restated by paired lenses. Observed output, not a fixture.
- `audit-engine.ts:2341` must actively DROP due-ish interim labels ("questions due", "RFI response") so a questions date does not masquerade as the submission deadline.

**CITATION CORRECTION (caught in my own discipline check):** there is NO `src/lib/audit-decide-inquiry-deadline.ts`. Only `audit-decide-inquiry-deadline.test.ts` exists; the logic lives in `audit-decide.ts`. I cited the module by the test's name — the exact fabrication class I grade F on. Verify a path with `ls` before citing it.

**Why it matters:** both claims are the plausible-but-wrong shape — a real constant / a real `continue` statement, with a consequence asserted rather than traced. Trace the consumer before grading a guard.
