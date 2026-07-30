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

**SECOND OCCURRENCE — audit 95698f91 / W9123826QA032 (2026-07-30).** Same class, twice more, both caught in
self-check *while I was grading the report for exactly this error*:
- **FAR 19.507(a)** — I wrote "per 19.507(a), 52.219-6 is the designation." **(a) and (b) are `[Reserved]`;**
  the 52.219-6 prescription is **(c)**. Watch for RESERVED paragraphs — a plausible-sounding early designator
  is likelier to be empty than wrong-but-occupied.
- **Section labels are designators too.** I collapsed 52.240-90/-91/-93 into one cell labeled "`sol.txt:2565`,
  §I." Line 2565 sits past the §K header — **52.240-90 is a §K PROVISION (offeror rep), -91/-93 are §I
  CLAUSES.** Verify a section label by the header byte-offsets (`grep -n "^Section [A-M] -"`), never by which
  table the clause *looks* like it belongs to. The §K/§I split was the load-bearing half of that finding.
- **Reflowed ≠ verbatim.** Clause titles in a PDF `§I` table wrap across 3–6 lines and `pdftotext` preserves
  the breaks; attachment tables split a column header ("Provided / Under / Separate / Cover") from its cell
  value. Assembling those into one string is a faithful *reading*, not a quote — say so, or quote the raw block.

Three passes: pass 1 fixed 6 items, pass 2 fixed 2, **pass 3 found zero.** That is the stop signal. A sweep
that has stopped finding things must be *closed and said to be closed* — running a fourth to satisfy a
repeating stop-hook manufactures either ceremony or invented findings.

Environment note: **ecfr.gov and federalregister.gov 302-redirect to an unblock host** from this sandbox.
Route CFR cites through **govinfo.gov** (`/content/pkg/CFR-YYYY-titleN-volN/xml/CFR-...-secX-Y.xml`), which
works but serves **annual editions** — flag the edition rather than implying same-day currency.
acquisition.gov works fine for FAR/DFARS. esd.whs.mil and dla.mil program pages return 403.
Confirmed again 2026-07-30, plus: **dol.gov/agencies/whd/** returns **403**, and govinfo 404s on
`FR-YYYY-MM-DD/pdf/` EO paths. For **Executive Order status affecting wage determinations**, the working
.gov primary is **`sam.gov/announcements/<slug>`** (EO 14236 / EO 14026 revocation confirmed there).
`acquisition.gov/far-overhaul/far-part-deviation-guide/far-overhaul-part-<N>` serves the model deviation
text and is the right source when a solicitation cites "(Deviation 2026-O0038)" — that is where §889 moved
(Part 4 clauses → **52.240-91**, prescribed at 40.205(b); rep **52.240-90** at 40.205(a); §889 at 40.202(d)).

Related: [[747-v2-narrative-registry-ruling]]
