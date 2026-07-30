---
name: phase5-underfire-redteamB
description: Phase 5 passiveFrameEligBarSentence (card #560) UNDER-FIRE red-team B corpus — 22 verified false-negatives across 3 seams
metadata:
  type: project
---

Red-team B UNDER-FIRE corpus for `passiveFrameEligBarSentence` (src/lib/audit-orchestrator.ts:1594, flag AUDIT_ELIG_BAR_PASSIVE_FRAME default-OFF). 24 specimens (22 flag / 2 honest-skip) written to `ceo/phase5-gauntlet/redteam-B-underfire.json`. All 22 flag specimens EMPIRICALLY VERIFIED to SKIP the detector via /tmp probe of the exact NOUN+FRAME regexes.

**Why:** Detector requires BOTH an in-vocab credential NOUN and an in-list requirement FRAME in ONE enclosing sentence. Under-fire = firm disqualifier slips to false-COMPLETE = hard zero.

**How to apply (3 dominant under-fire seams):**
1. **Consequence-verb-outside-frame** (in-vocab noun, frame=0): the GAO pass/fail idioms are NOT in PASSIVE_REQUIREMENT_FRAME_RE — "will be found nonresponsive", "renders the offer unawardable", "are ineligible for award", "need not respond", "is a condition of / precondition to", "will be rejected". This is the single most common real phrasing of a firm-clearance/NADCAP/QPL gate. MOST DANGEROUS.
2. **OOV-credential** (noun=0): SCIF/DCSA-accredited, COMSEC account, JCP+DD-2345, FOCI mitigation, AS9100, DMEA/Trusted Foundry — real standing firm credentials entirely absent from PASSIVE_CREDENTIAL_NOUN_RE.
3. **Two-sentence split**: noun in sentence 1 (bare "mandatory"=no frame), consequence in sentence 2 (no in-scope noun) — single-sentence detector sees each half benign.

**Confirmed regex micro-defects (exploitable):** (a) `\brequire[sd]?\b` FAILS on "requirement" (word-boundary) → bare noun-headers "...clearance requirement applies" / "Facility Clearance Requirement:" evade. (b) `only (offerors|firms|vendors|contractors|quoters)` branch MISSES "only <credential> holders / manufacturers / suppliers may perform". (c) FCL context-gate (needs secret/clearance/facilit/level/top within 30 chars) defeated by "holding an FCL"/"possess an FCL" → noun=0 even with real frame "contingent upon". (d) negative-polarity QPL "items NOT listed on QPL will be rejected" evades (positive "must appear on" fires). (e) "non-authorized" hyphen breaks `\bauthorized` boundary → noun=0.

**Single most dangerous under-fire:** rtB-01 "Offerors lacking a Top Secret facility clearance at the SECRET level will be found nonresponsive." — canonical FCL who-may-bid bar, in-vocab noun, but "found nonresponsive" (FAR 9.104/14.404-2) is outside the frame list → SKIP → false-COMPLETE.

**Authority verification ledger (discipline-check pass):** VERIFIED LIVE via WebSearch of primary .gov/USC: Berry Amendment=10 USC 4862 (uscode.house.gov / Cornell LII; note formerly 2533a); JCP/DD-2345 governed by DoDD 5230.25, and JCP is REQUIRED to obtain export-controlled RFP details/technical data needed to bid (DLA JCP, confirms rtB-12 pre-award-access framing); FOCI mitigation=32 CFR 117.11 (eCFR — approved instrument is the CURE, absence bars classified award, rtB-13 corrected); FAR 9.202/9.203 QPL (acquisition.gov — HAS a pre-award cure path, rtB-20 rationale CORRECTED, not an absolute bar). NOT yet independently verified live (asserted from domain knowledge, flagged as such, NOT load-bearing to the under-fire finding which rests only on the empirically-proven regex SKIP): FAR 9.104/14.404-2 (nonresponsible/nonresponsive idiom), ICD 705 (SCIF), 22 CFR 122 (ITAR/DDTC registration), 10 CFR 725/Atomic Energy Act (DOE Q / Restricted Data), DoD Trusted Access/DMEA, 32 CFR 117 FCL-eligibility sections (only 117.11 FOCI verified). Every under-fire claim is grounded in the ACTUAL regex behavior (empirically run), not the citation — the citation only characterizes WHY the sentence is a real bar.

**Fix direction (for builder):** add a consequence-verb / disqualifier-idiom arm to the frame (nonresponsib*/ineligible/unawardable/rejected/need not respond/precondition/condition of), fix `requirement` boundary, generalize only-<actor> to actor-agnostic who-may-bid + credential-holder, add OOV credential SHAPE nouns. Over-fire (rtB-23 obtain-post-award) is the safe pole — acceptable.
