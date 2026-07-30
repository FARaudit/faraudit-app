---
name: lesson-verify-paraphrase-not-just-memory
description: Re-verify your own paraphrase, not just your memory — two of my worst cites in the #747 review were a wrong-on-the-merits CFR section and a "sharpening" I invented one round earlier
metadata:
  type: feedback
---

Re-fetch the source for **my own prior-round paraphrase**, not only for claims I carried from memory.

**Why:** in the ARC #747 V2 review I ran three discipline passes. The memory-sourced cites I flagged and
fixed easily. The two that actually broke were ones I had already "verified" in a loose way:
- **22 C.F.R. 127.1** — I cited it for a domestic contractor-to-contractor transfer of Air Force technical
  orders. Fetched it: **127.1(a)(2) governs retransfer "from one foreign end-user … to another foreign
  end-user."** Wrong on the merits, not merely unverified. Retracted; the finding was restated on DoDD
  5230.25 + the DD 2345 custodian's dissemination responsibility, which is what it always rested on.
- **FAR 4.1102(a)(5)** — in round 2 I "sharpened" a finding by saying Alternate I of 52.204-7 is triggered by
  the emergency/disaster-response exception. Fetched it in round 3: (a)(5) is **"Contracts awarded without
  providing for full and open competition due to unusual or compelling urgency (see 6.302-2)"**; deployed-CO
  /emergency ops is (a)(3). My sharpening was fabricated confidence. The corrected version was strictly
  better — it put the defect in the *non-competitive* acquisition family, which is where the arc lives.
  I also reported "nine exceptions" from a fetch tool's list-splitting; the regulation has seven, (a)(1)–(a)(7).

**How to apply:** treat a paraphrase as a claim with its own citation debt. Before a paragraph designator
(`(b)(3)`, `(a)(5)`) goes in a ruling, fetch it — designators are where mis-citation hides, and a wrong pin
is the exact defect a clause-layer review exists to catch. Also: fetch tools **paraphrase, renumber, and
sometimes echo the prompt back inside quotation marks** (FAR 4.1105 did this). Only text the tool presents as
a quote counts as verbatim; a tool's numbered list is not the regulation's numbering.

Environment note: **ecfr.gov and federalregister.gov 302-redirect to an unblock host** from this sandbox.
Route CFR cites through **govinfo.gov** (`/content/pkg/CFR-YYYY-titleN-volN/xml/CFR-...-secX-Y.xml`), which
works but serves **annual editions** — flag the edition rather than implying same-day currency.
acquisition.gov works fine for FAR/DFARS. esd.whs.mil and dla.mil program pages return 403.

Related: [[747-v2-narrative-registry-ruling]]
