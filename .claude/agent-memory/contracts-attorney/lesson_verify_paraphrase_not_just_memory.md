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

**A PAGE NUMBER IS A PIN TOO — and eyeballing one off a `sed` window is how I got 4 wrong** (W50S6U26QA019,
2026-08-02). I cited 52.244-6 "page 39" (real: 40), 52.252-2 "page 47" (real: 48), Section E "page 26"
(real: 27), and MIL-STD-129 "page 49" (the clause heading is 49; the para (e) I quoted is on 50). The bug:
a page footer sits **after** the content of that page, so the footer visible in a window is not that line's
page. **Map it mechanically** — collect every `Page N of M` footer line, then for a target line take the
FIRST footer at or after it. Same discipline as a paragraph designator: a citation a customer cannot turn
to is a citation that fails at the gate review.

**A DESIGNATOR THAT TURNS OUT RIGHT WAS STILL UNEARNED.** W50S6U26QA019: the authority pack gives
`4 CFR 21.2`; I supplied `(a)(1)` from memory and repeated it across four passes before checking. It
verified — *"Protests based upon alleged improprieties in a solicitation which are apparent prior to bid
opening or the time set for receipt of initial proposals shall be filed prior to…"* — but **luck is not
verification**, and a 5th-pass check is what caught it, not the first four. **Standing sub-lesson for this
lens: 21.2(a)(1) says "bid opening or … initial proposals" — on an RFQ (quotations are neither), state the
patent-ambiguity bar as "raise it before closing," never as a flat statutory waiver.**

**SCOPE YOUR ABSENCE CLAIMS TO WHAT YOU ACTUALLY GREPPED.** Same review: I wrote "searched every posted
document — zero hits" for CUI/52.219-14/7019-7020 having grepped only the **PDFs**. `.xlsx`/`.docx` are zip
archives and need `unzip -qo … && cat **/*.xml` before they are in your corpus at all. All three claims
survived the re-check, but they were unearned when written — and an unearned absence claim is the same
defect class I grade the engine F for. Also grep the **raw artifact**, not your HTML-stripped copy: a
string can survive inside a `<script>` data blob you deleted. (Beware substring noise — `CUI` matched 9
times inside base64 font data.) **Raster/scanned pages you did not OCR are outside your corpus — say so.**

**How to apply:** treat a paraphrase as a claim with its own citation debt. Before a paragraph designator
(`(b)(3)`, `(a)(5)`) goes in a ruling, fetch it — designators are where mis-citation hides, and a wrong pin
is the exact defect a clause-layer review exists to catch. Also: fetch tools **paraphrase, renumber, and
sometimes echo the prompt back inside quotation marks** (FAR 4.1105 did this). Only text the tool presents as
a quote counts as verbatim; a tool's numbered list is not the regulation's numbering.

Environment note (**UPDATED 2026-08-02 — the eCFR half of this was stale**): the **eCFR versioner API now
works directly** and is the fastest CFR route —
`https://www.ecfr.gov/api/versioner/v1/full/<date>/title-48.xml?chapter=1&subchapter=D&part=19&section=19.507`
(also title-13 for SBA). It serves **daily** editions, so currency is real, but the newest issue date lags
today by a few days — query the lag date, not today, or you get a 404 that names the correct date for you.
govinfo remains the fallback (annual editions only — flag the edition). **acquisition.gov 504s under any
burst** (CloudFront): retry 3–5× with ~8s sleeps and it clears; a 504 body is 132 bytes and will happily
be saved as a "PDF". esd.whs.mil and dla.mil program pages return 403.

Related: [[747-v2-narrative-registry-ruling]]
