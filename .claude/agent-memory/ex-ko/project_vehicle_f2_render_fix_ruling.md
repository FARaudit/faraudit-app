---
name: vehicle-f2-render-fix-ruling
description: Vehicle-F2 render-polish (audit 496a9a21 / FA813726R0033) seat ruling — PASS/CEO-deliverable; excerpt-head dedup is within-tier + span-literal so it misses cross-tier/cross-span restatements
metadata:
  type: project
---

Vehicle-F2 fixed render of audit 496a9a21 (FA813726R0033, Tinker AFB MAC BOA B3001) graded **PASS / CEO-DELIVERABLE** by the ex-KO seat. All four fixes landed honestly, zero fabrication, zero over-collapse, zero lost citation, verdict integrity intact (NHR pole, two-tier eligibility BOA-only + concluded-site-visit, no conflict language).

- **F-2** (gate→"Gate", dedup): label fix clean (2 P0 "Stop", 69 P1 "Gate", 10 P2 "Advisory", zero "Critical"). One-proposal family collapsed 5→1; DFARS 252.204-7012 collapsed 4→1; merges concatenate cites (no loss). 252.225-7012 Berry kept correctly SEPARATE from 252.204-7012 (no over-collapse).
- **F-3** set-aside "None confirmed" + subnote: HONEST. 52.219-6 genuinely absent from source; SAM carries "Small Business Type: Small Business / Set Aside Percent: 100 / typeCode SBA". Defensible call, hedged with "confirm."
- **F-5** coverage "Incomplete": honest — grounded in Wage Determination 5-8-26.pdf parse failure (could-not-commit).
- **F-4** issuing-office leaf: null → absent, no fabrication.

**Named next defect (the durable lesson):** the 120-char excerpt-head dedup key is **within-tier + span-literal**. It misses same-obligation restatements that (a) sit across the show-stopper/gate boundary — the BOA-only bar renders BOTH as P0 "Stop" (line 608/613) AND P1 "Gate" (line 878/883), same excerpt head; and (b) quote different spans of one clause — Section L §1.10 amendment-ack renders 3× (rows 7/20/30), CUI-legend 2×, bid-bond 3×. All are UNDER-collapse (the safe direction: no info lost, no distinct obligation merged), so not a reject — but the anchor eligibility bar showing at two severities is the most conspicuous residual blemish.

**Why:** the charge's zero-tolerance is fabrication + over-collapse; neither occurred. A conservative excerpt-head key errs toward duplication, which is fabrication-safe.
**How to apply:** if a future increment claims "amendment-ack collapse," verify the key normalizes across spans of the same citation and dedups show-stopper↔gate cross-tier, not just within-tier literal heads.
See [[hardbar-pivot-panel-ruling]], [[root2-completeness-gate-ruling]].
